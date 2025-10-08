"""
File storage abstraction service for managing media files.
Provides a consistent interface for file operations that can be easily
migrated to cloud storage services like AWS S3, Azure Blob Storage, etc.

MIME Type Detection:
- Requires python-magic-bin package for accurate file type detection
- Falls back to filename extension mapping if python-magic is not available
- For development on Windows/macOS, python-magic-bin should work out of the box
- For production Linux, libmagic system library is installed via Dockerfile

Video Optimization:
- MP4 files are automatically optimized for progressive streaming (fast-start)
- Optimization moves metadata to front of file for immediate playback
- Gracefully falls back to original file if optimization fails
"""

import uuid
import mimetypes
from pathlib import Path
from typing import Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

try:
    import magic
    HAS_MAGIC = True
except ImportError:
    HAS_MAGIC = False
    print("Warning: python-magic not available. MIME type detection will use filename fallback only.")


@dataclass
class FileInfo:
    """Information about a stored file"""
    file_id: str
    filename: str
    file_size: int
    mime_type: str
    media_type: str


class FileStorageService:
    """
    File storage service that abstracts file operations.
    Currently implements local storage but can be easily extended for cloud storage.
    """
    # Maximum file size: 1GB
    MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1GB in bytes
    # Maximum total storage per doctor: 2GB
    MAX_TOTAL_STORAGE = 2 * 1024 * 1024 * 1024  # 2GB in bytes
    # Supported image MIME types
    SUPPORTED_IMAGE_TYPES = {
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
        'image/tiff', 'image/webp', 'image/svg+xml', 'image/x-icon',
        'image/vnd.microsoft.icon'
    }
    # Supported video MIME types
    SUPPORTED_VIDEO_TYPES = {
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
        'video/x-ms-wmv', 'video/webm', 'video/3gpp', 'video/x-flv',
        'video/x-matroska', 'video/ogg'
    }
    # Extended MIME type mapping for common file extensions
    EXTENSION_MIME_MAP = {
        # Images
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        # Videos
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.webm': 'video/webm',
        '.3gp': 'video/3gpp',
        '.flv': 'video/x-flv',
        '.mkv': 'video/x-matroska',
        '.ogg': 'video/ogg',
        '.mpeg': 'video/mpeg',
        '.mpg': 'video/mpeg',
    }

    def __init__(self, storage_root: str = "/app/media_storage"):
        """
        Initialize the file storage service.
        Args:
            storage_root: Root directory for file storage
        """
        self.storage_root = Path(storage_root)
        self._ensure_storage_directory()

    def _ensure_storage_directory(self) -> None:
        """Ensure the storage directory exists"""
        self.storage_root.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, file_id: str) -> Path:
        """Get the full path for a file ID"""
        return self.storage_root / file_id

    def _detect_mime_type(self, file_data: bytes, filename: str) -> str:
        """
        Detect MIME type from file data and filename.
        Uses python-magic for accurate detection from file content when available.
        """
        if HAS_MAGIC:
            try:
                mime_type = magic.from_buffer(file_data, mime=True)
                if mime_type and mime_type != 'application/octet-stream':
                    return mime_type
            except Exception:  # pylint: disable=broad-except
                pass
        file_ext = Path(filename).suffix.lower()
        if file_ext in self.EXTENSION_MIME_MAP:
            return self.EXTENSION_MIME_MAP[file_ext]
        mime_type, _ = mimetypes.guess_type(filename)
        return mime_type or 'application/octet-stream'

    def _get_media_type(self, mime_type: str) -> str:
        """Determine if the file is an image or video based on MIME type"""
        if mime_type in self.SUPPORTED_IMAGE_TYPES:
            return 'image'
        elif mime_type in self.SUPPORTED_VIDEO_TYPES:
            return 'video'
        else:
            raise ValueError(f"Unsupported file type: {mime_type}")

    def _validate_file(self, file_data: bytes, filename: str) -> Tuple[str, str]:
        """
        Validate file size and type.
        Returns:
            Tuple of (mime_type, media_type)
        Raises:
            ValueError: If file is invalid
        """
        if len(file_data) > self.MAX_FILE_SIZE:
            raise ValueError(f"File size exceeds maximum limit of {self.MAX_FILE_SIZE / (1024*1024):.1f}MB")
        if len(file_data) == 0:
            raise ValueError("File is empty")
        mime_type = self._detect_mime_type(file_data, filename)
        media_type = self._get_media_type(mime_type)
        return mime_type, media_type

    def create_file(self, file_data: bytes, filename: str, optimize_video: bool = True) -> FileInfo:
        """
        Store a file and return file information.
        Args:
            file_data: Raw file bytes
            filename: Original filename
            optimize_video: Whether to optimize video files for streaming (default: True)
        Returns:
            FileInfo object with file details
        Raises:
            ValueError: If file is invalid or too large
            OSError: If file cannot be written
        """
        mime_type, media_type = self._validate_file(file_data, filename)
        file_id = str(uuid.uuid4())
        file_path = self._get_file_path(file_id)
        
        try:
            # Write original file
            with open(file_path, 'wb') as f:
                f.write(file_data)
            
            # Optimize MP4 videos for progressive streaming
            if optimize_video and media_type == 'video' and mime_type == 'video/mp4':
                self._optimize_video_file(file_path)
                
        except OSError as e:
            raise OSError(f"Failed to write file: {e}") from e
        
        # Get final file size (may have changed after optimization)
        final_size = file_path.stat().st_size
        
        return FileInfo(
            file_id=file_id,
            filename=filename,
            file_size=final_size,
            mime_type=mime_type,
            media_type=media_type
        )

    def read_file(self, file_id: str) -> Tuple[bytes, str]:
        """
        Read a file by its ID.
        Args:
            file_id: Unique file identifier
        Returns:
            Tuple of (file_data, mime_type)
        Raises:
            FileNotFoundError: If file doesn't exist
            OSError: If file cannot be read
        """
        file_path = self._get_file_path(file_id)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")
        try:
            with open(file_path, 'rb') as f:
                file_data = f.read()
            if HAS_MAGIC:
                try:
                    mime_type = magic.from_buffer(file_data, mime=True)
                except Exception:  # pylint: disable=broad-except
                    mime_type = 'application/octet-stream'
            else:
                mime_type = 'application/octet-stream'
            return file_data, mime_type
        except OSError as e:
            raise OSError(f"Failed to read file: {e}") from e

    def read_file_chunked(self, file_id: str, chunk_size: int = 8192):
        """
        Generator that yields file chunks for streaming.
        Args:
            file_id: Unique file identifier
            chunk_size: Size of each chunk in bytes (default 8KB)
        Yields:
            bytes: File chunks
        Raises:
            FileNotFoundError: If file doesn't exist
            OSError: If file cannot be read
        """
        file_path = self._get_file_path(file_id)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")
        
        try:
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        except OSError as e:
            raise OSError(f"Failed to read file: {e}") from e

    def read_file_range(self, file_id: str, start: int, end: int):
        """
        Read a specific range of bytes from a file.
        Args:
            file_id: Unique file identifier
            start: Starting byte position (inclusive)
            end: Ending byte position (inclusive)
        Returns:
            bytes: File data for the specified range
        Raises:
            FileNotFoundError: If file doesn't exist
            OSError: If file cannot be read
            ValueError: If range is invalid
        """
        file_path = self._get_file_path(file_id)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")
        
        if start < 0 or end < start:
            raise ValueError(f"Invalid range: {start}-{end}")
        
        try:
            with open(file_path, 'rb') as f:
                f.seek(start)
                chunk_size = end - start + 1
                return f.read(chunk_size)
        except OSError as e:
            raise OSError(f"Failed to read file range: {e}") from e

    def delete_file(self, file_id: str) -> bool:
        """
        Delete a file by its ID.
        Args:
            file_id: Unique file identifier
        Returns:
            True if file was deleted, False if it didn't exist
        Raises:
            OSError: If file cannot be deleted
        """
        file_path = self._get_file_path(file_id)
        if not file_path.exists():
            return False
        try:
            file_path.unlink()
            return True
        except OSError as e:
            raise OSError(f"Failed to delete file: {e}") from e

    def file_exists(self, file_id: str) -> bool:
        """Check if a file exists"""
        return self._get_file_path(file_id).exists()

    def get_file_size(self, file_id: str) -> Optional[int]:
        """Get the size of a file in bytes"""
        file_path = self._get_file_path(file_id)
        if file_path.exists():
            return file_path.stat().st_size
        return None

    def calculate_total_storage_used(self, file_ids: list[str]) -> int:
        """
        Calculate total storage used by a list of files.
        Args:
            file_ids: List of file IDs to calculate storage for
        Returns:
            Total storage used in bytes
        """
        total_size = 0
        for file_id in file_ids:
            size = self.get_file_size(file_id)
            if size is not None:
                total_size += size
        return total_size

    def check_storage_availability(self, file_ids: list[str], additional_size: int) -> bool:
        """
        Check if there's enough storage for an additional file.
        Args:
            file_ids: List of existing file IDs for the doctor
            additional_size: Size of the new file to upload
        Returns:
            True if storage is available, False otherwise
        """
        current_usage = self.calculate_total_storage_used(file_ids)
        return (current_usage + additional_size) <= self.MAX_TOTAL_STORAGE

    def get_storage_info(self, file_ids: list[str]) -> dict:
        """
        Get storage usage information.
        Args:
            file_ids: List of file IDs for the doctor
        Returns:
            Dictionary with storage information
        """
        used = self.calculate_total_storage_used(file_ids)
        total = self.MAX_TOTAL_STORAGE
        available = total - used
        percentage = (used / total) * 100
        return {
            'used_bytes': used,
            'total_bytes': total,
            'available_bytes': available,
            'used_percentage': round(percentage, 2),
            'used_mb': round(used / (1024 * 1024), 2),
            'total_mb': round(total / (1024 * 1024), 2),
            'available_mb': round(available / (1024 * 1024), 2)
        }

    def _optimize_video_file(self, file_path: Path) -> None:
        """
        Optimize video file for progressive streaming (in-place).
        Uses FFmpeg to move metadata to front for fast-start playback.
        Falls back gracefully if optimization fails.
        
        Args:
            file_path: Path to the video file to optimize
        """
        try:
            from .video_optimizer import video_optimizer
            
            # Create temporary file for optimization
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
                temp_path = temp_file.name
            
            # Optimize the video
            success, optimized_path = video_optimizer.optimize_mp4_for_streaming(
                str(file_path), 
                temp_path
            )
            
            if success and optimized_path != str(file_path):
                # Replace original with optimized version
                import shutil
                shutil.move(optimized_path, str(file_path))
                logger.info(f"Successfully optimized video file: {file_path}")
            else:
                # Cleanup temp file if optimization failed
                Path(temp_path).unlink(missing_ok=True)
                logger.warning(f"Video optimization failed for: {file_path}")
                
        except Exception as e:
            logger.error(f"Error optimizing video file {file_path}: {e}")
            # Continue with original file - optimization is optional
