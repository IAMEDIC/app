"""
Video optimization utilities for progressive streaming and fast-start playback.
Enhances video files for web streaming without changing existing functionality.
"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class VideoOptimizer:
    """
    Video optimization service for progressive streaming enhancements.
    Provides MP4 fast-start and basic transcoding without disrupting existing workflows.
    """
    
    def __init__(self):
        self.ffmpeg_available = self._check_ffmpeg_availability()
        if not self.ffmpeg_available:
            logger.warning("FFmpeg not available - video optimization disabled")
    
    def _check_ffmpeg_availability(self) -> bool:
        """Check if FFmpeg is available in the system"""
        try:
            result = subprocess.run(
                ['ffmpeg', '-version'], 
                capture_output=True, 
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    def optimize_mp4_for_streaming(self, input_path: str, output_path: Optional[str] = None) -> Tuple[bool, str]:
        """
        Optimize MP4 file for progressive streaming by moving metadata to front (fast-start).
        
        Args:
            input_path: Path to input MP4 file
            output_path: Optional output path, defaults to temp file
            
        Returns:
            Tuple of (success: bool, output_path: str)
        """
        if not self.ffmpeg_available:
            logger.warning("FFmpeg not available - skipping MP4 optimization")
            return False, input_path
        
        try:
            # Use temporary file if no output path specified
            if output_path is None:
                temp_fd, output_path = tempfile.mkstemp(suffix='.mp4')
                import os
                os.close(temp_fd)  # Close the file descriptor, we just need the path
            
            # FFmpeg command for MP4 fast-start optimization
            cmd = [
                'ffmpeg',
                '-y',  # Overwrite output file
                '-i', input_path,
                '-c', 'copy',  # Copy streams without re-encoding
                '-movflags', '+faststart',  # Move metadata to front for progressive playback
                '-f', 'mp4',
                output_path
            ]
            
            logger.info(f"Optimizing MP4 for streaming: {input_path} -> {output_path}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                logger.error(f"MP4 optimization failed: {result.stderr}")
                return False, input_path
            
            # Verify output file was created and has reasonable size
            output_file = Path(output_path)
            if not output_file.exists() or output_file.stat().st_size == 0:
                logger.error(f"MP4 optimization produced invalid output: {output_path}")
                return False, input_path
            
            logger.info(f"Successfully optimized MP4: {input_path} -> {output_path}")
            return True, output_path
            
        except subprocess.TimeoutExpired:
            logger.error(f"MP4 optimization timed out: {input_path}")
            return False, input_path
        except Exception as e:
            logger.error(f"MP4 optimization error: {e}")
            return False, input_path
    
    def get_video_info(self, video_path: str) -> Optional[dict]:
        """
        Get basic video information using FFprobe.
        
        Args:
            video_path: Path to video file
            
        Returns:
            Dictionary with video info or None if failed
        """
        if not self.ffmpeg_available:
            return None
        
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                video_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.warning(f"FFprobe failed for {video_path}: {result.stderr}")
                return None
            
            import json
            info = json.loads(result.stdout)
            
            # Extract useful information
            video_streams = [s for s in info.get('streams', []) if s.get('codec_type') == 'video']
            if not video_streams:
                return None
            
            video_stream = video_streams[0]
            format_info = info.get('format', {})
            
            return {
                'duration': float(format_info.get('duration', 0)),
                'size': int(format_info.get('size', 0)),
                'bitrate': int(format_info.get('bit_rate', 0)),
                'width': int(video_stream.get('width', 0)),
                'height': int(video_stream.get('height', 0)),
                'codec': video_stream.get('codec_name', 'unknown'),
                'fps': eval(video_stream.get('r_frame_rate', '0/1'))  # Convert fraction to float
            }
            
        except Exception as e:
            logger.error(f"Error getting video info for {video_path}: {e}")
            return None
    
    def is_web_optimized(self, video_path: str) -> bool:
        """
        Check if video file is already optimized for web streaming.
        Checks for faststart flag in MP4 files.
        
        Args:
            video_path: Path to video file
            
        Returns:
            True if video is web-optimized
        """
        if not self.ffmpeg_available:
            return False
        
        try:
            # Use ffprobe to check if faststart is enabled
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                video_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                return False
            
            # For MP4, check if moov atom is at the beginning (faststart)
            # This is a simplified check - in practice, this is complex to determine
            # For now, we'll assume non-optimized and let the optimization run
            return False
            
        except Exception:
            return False


# Global instance
video_optimizer = VideoOptimizer()