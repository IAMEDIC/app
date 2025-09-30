"""
DICOM handler service: anonymizes and converts DICOM files into standard
image/video byte streams so the rest of the pipeline can treat them like
.png or .mp4 uploads.

- Single-frame DICOM -> PNG (image/png)
- Multi-frame DICOM (NumberOfFrames > 1) -> MP4 (video/mp4)

We do not persist any DICOM metadata; PHI is removed before pixel extraction.
"""
from __future__ import annotations

import io
from typing import Tuple, Optional, List

import numpy as np
from PIL import Image
import pydicom
from pydicom.pixel_data_handlers.util import apply_voi_lut
import ffmpeg  # ffmpeg-python


# Tags commonly containing PHI and identifying information.
# We will remove these from the dataset prior to any processing.
PHI_TAGS = [
    (0x0010, 0x0010),  # PatientName
    (0x0010, 0x0020),  # PatientID
    (0x0010, 0x0030),  # PatientBirthDate
    (0x0010, 0x0040),  # PatientSex
    (0x0008, 0x0080),  # InstitutionName
    (0x0008, 0x0081),  # InstitutionAddress
    (0x0008, 0x0090),  # ReferringPhysicianName
    (0x0008, 0x1010),  # StationName
    (0x0010, 0x1010),  # PatientAge
    (0x0010, 0x1020),  # PatientSize
    (0x0010, 0x1030),  # PatientWeight
    (0x0010, 0x2160),  # EthnicGroup
    (0x0010, 0x4000),  # PatientComments
    (0x0008, 0x1048),  # PhysiciansOfRecord
    (0x0008, 0x1050),  # PerformingPhysicianName
    (0x0008, 0x1070),  # OperatorsName
    (0x0018, 0x1000),  # DeviceSerialNumber
]


def _anonymize(ds: pydicom.Dataset) -> pydicom.Dataset:
    # Use DICOM's inbuilt mechanism for basic patient data removal where available
    # and then explicitly delete our known PHI tags.
    try:
        ds.remove_private_tags()
    except Exception:
        pass
    for tag in PHI_TAGS:
        if tag in ds:
            del ds[tag]
    # Overwrite obvious identifiers if present
    for name in [
        "PatientName", "PatientID", "PatientBirthDate", "PatientSex",
        "AccessionNumber", "StudyID", "StudyInstanceUID", "SeriesInstanceUID",
        "FrameOfReferenceUID",
    ]:
        if hasattr(ds, name):
            setattr(ds, name, "")
    return ds


def _to_uint8(image: np.ndarray) -> np.ndarray:
    """Convert image to uint8 range [0, 255]. Handles 16-bit and floats."""
    if image.dtype == np.uint8:
        return image
    img = image.astype(np.float32)
    # Normalize to 0..1 then scale
    min_val = np.min(img)
    max_val = np.max(img)
    if max_val <= min_val:
        return np.zeros_like(img, dtype=np.uint8)
    img = (img - min_val) / (max_val - min_val)
    img = (img * 255.0).clip(0, 255)
    return img.astype(np.uint8)


def _prepare_frame(ds: pydicom.Dataset, frame: np.ndarray) -> np.ndarray:
    """Apply VOI LUT and rescale slope/intercept if present, then convert to RGB."""
    try:
        frame = apply_voi_lut(frame, ds)
    except Exception:
        pass
    # Rescale slope/intercept handled by apply_voi_lut in many cases; fallback omitted.
    img = _to_uint8(frame)
    # Convert monochrome to RGB if needed
    if img.ndim == 2:
        img_rgb = np.stack([img, img, img], axis=-1)
    elif img.ndim == 3 and img.shape[2] == 3:
        img_rgb = img
    else:
        # Unexpected channel dimension; try to collapse
        img_rgb = np.stack([img[..., 0], img[..., 0], img[..., 0]], axis=-1)
    return img_rgb


def _encode_png(image_rgb: np.ndarray) -> bytes:
    pil_img = Image.fromarray(image_rgb, mode='RGB')
    buf = io.BytesIO()
    pil_img.save(buf, format='PNG')
    return buf.getvalue()


def _encode_mp4(frames_rgb: List[np.ndarray], fps: int = 30) -> bytes:
    if not frames_rgb:
        raise ValueError("No frames to encode")
    h, w, _ = frames_rgb[0].shape
    # Concatenate frames into rawvideo byte stream
    raw = b''.join(frame.astype(np.uint8).tobytes() for frame in frames_rgb)
    # Pipe into ffmpeg to produce MP4 in-memory
    process = (
        ffmpeg
        .input('pipe:0', format='rawvideo', pix_fmt='rgb24', s=f'{w}x{h}', r=fps)
        .output('pipe:1', format='mp4', vcodec='libx264', pix_fmt='yuv420p', movflags='frag_keyframe+empty_moov+faststart', r=fps)
        .global_args('-loglevel', 'error')
        .run_async(pipe_stdin=True, pipe_stdout=True, pipe_stderr=True)
    )
    out, err = process.communicate(input=raw)
    if process.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {err.decode('utf-8', errors='ignore')}")
    return out


def process_dicom(file_bytes: bytes, filename: str) -> Tuple[bytes, str, str]:
    """
    Process a DICOM file:
    - Anonymize metadata
    - Convert to PNG (single-frame) or MP4 (multi-frame)

    Returns: (output_bytes, output_filename, output_mime)
    """
    # Load with force to support a broader set of files
    ds = pydicom.dcmread(io.BytesIO(file_bytes), force=True)
    ds = _anonymize(ds)

    # Extract pixel data; pydicom handles decompress with suitable handlers
    if 'PixelData' not in ds:
        raise ValueError('DICOM has no pixel data')

    number_of_frames = int(getattr(ds, 'NumberOfFrames', 1) or 1)

    # Handle PhotometricInterpretation nuances implicitly via apply_voi_lut
    pixel_array = ds.pixel_array  # may be shape (frames, rows, cols) or (rows, cols)

    if number_of_frames > 1:
        # Multi-frame -> video
        # Ensure pixel_array has shape (frames, rows, cols[, channels])
        frames: List[np.ndarray] = []
        if pixel_array.ndim == 3:
            for i in range(pixel_array.shape[0]):
                frames.append(_prepare_frame(ds, pixel_array[i]))
        elif pixel_array.ndim == 4:
            for i in range(pixel_array.shape[0]):
                frames.append(_prepare_frame(ds, pixel_array[i]))
        else:
            raise ValueError('Unsupported multi-frame DICOM shape')
        # FPS guess: use FrameTime or CineRate if available
        fps = 30
        try:
            if hasattr(ds, 'FrameTime') and ds.FrameTime:  # in ms
                fps = max(1, int(round(1000.0 / float(ds.FrameTime))))
            elif hasattr(ds, 'CineRate') and ds.CineRate:
                fps = int(ds.CineRate)
        except Exception:
            pass
        mp4_bytes = _encode_mp4(frames, fps=fps)
        base = filename.rsplit('.', 1)[0]
        out_name = f"{base}.mp4"
        return mp4_bytes, out_name, 'video/mp4'
    else:
        # Single frame -> PNG
        if pixel_array.ndim == 2:
            frame = pixel_array
        elif pixel_array.ndim == 3:
            # Some files may be (rows, cols, samples)
            frame = pixel_array
        else:
            raise ValueError('Unsupported single-frame DICOM shape')
        img_rgb = _prepare_frame(ds, frame)
        png_bytes = _encode_png(img_rgb)
        base = filename.rsplit('.', 1)[0]
        out_name = f"{base}.png"
        return png_bytes, out_name, 'image/png'
