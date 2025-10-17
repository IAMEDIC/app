"""
Simple background task manager for tracking long-running operations.
In a production environment, this should be replaced with a proper task queue like Celery + Redis.
"""

import logging
import threading
import uuid
from typing import Dict, Any, Callable, Optional
from datetime import datetime, timedelta
from app.schemas.file_management import HardDeleteProgress

logger = logging.getLogger(__name__)


class TaskManager:
    """Simple in-memory task manager for tracking background operations"""
    
    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        
    def create_task(self, task_function: Callable, *args, **kwargs) -> str:
        """
        Create and start a background task.
        
        Args:
            task_function: Function to execute in background
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function
            
        Returns:
            str: Task ID for tracking progress
        """
        task_id = str(uuid.uuid4())
        
        with self._lock:
            self._tasks[task_id] = {
                "id": task_id,
                "status": "running",
                "progress": 0.0,
                "processed_items": 0,
                "total_items": 0,
                "current_operation": "Starting task...",
                "errors": [],
                "started_at": datetime.utcnow(),
                "completed_at": None,
                "result": None
            }
        
        # Define progress callback
        def progress_callback(progress_data: Dict[str, Any]):
            self._update_task_progress(task_id, progress_data)
        
        # Define task wrapper
        def task_wrapper():
            try:
                logger.info(f"🚀 Starting background task {task_id}")
                result = task_function(progress_callback, *args, **kwargs)
                
                with self._lock:
                    if task_id in self._tasks:
                        self._tasks[task_id]["result"] = result
                        self._tasks[task_id]["completed_at"] = datetime.utcnow()
                        if self._tasks[task_id]["status"] != "failed":
                            self._tasks[task_id]["status"] = "completed"
                            self._tasks[task_id]["progress"] = 1.0
                            self._tasks[task_id]["current_operation"] = "Task completed successfully"
                
                logger.info(f"✅ Background task {task_id} completed successfully")
                
            except Exception as e:
                logger.error(f"❌ Background task {task_id} failed: {str(e)}")
                with self._lock:
                    if task_id in self._tasks:
                        self._tasks[task_id]["status"] = "failed"
                        self._tasks[task_id]["current_operation"] = f"Task failed: {str(e)}"
                        self._tasks[task_id]["errors"].append(str(e))
                        self._tasks[task_id]["completed_at"] = datetime.utcnow()
        
        # Start task in background thread
        thread = threading.Thread(target=task_wrapper, daemon=True)
        thread.start()
        
        logger.info(f"📋 Created background task {task_id}")
        return task_id
    
    def _update_task_progress(self, task_id: str, progress_data: Dict[str, Any]):
        """Update task progress with new data"""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                task.update(progress_data)
                logger.debug(f"📊 Task {task_id} progress: {progress_data.get('progress', 0):.1%}")
    
    def get_task_progress(self, task_id: str) -> Optional[HardDeleteProgress]:
        """
        Get current progress of a task.
        
        Args:
            task_id: ID of the task to check
            
        Returns:
            HardDeleteProgress: Current task progress or None if not found
        """
        with self._lock:
            if task_id not in self._tasks:
                return None
            
            task = self._tasks[task_id]
            return HardDeleteProgress(
                status=task["status"],
                progress=task["progress"],
                processed_items=task["processed_items"],
                total_items=task["total_items"],
                current_operation=task["current_operation"],
                errors=task["errors"]
            )
    
    def cleanup_old_tasks(self, max_age_hours: int = 24):
        """
        Remove old completed/failed tasks to prevent memory leaks.
        
        Args:
            max_age_hours: Maximum age in hours for keeping completed tasks
        """
        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
        
        with self._lock:
            tasks_to_remove = []
            for task_id, task in self._tasks.items():
                if (task["completed_at"] and 
                    task["completed_at"] < cutoff_time and 
                    task["status"] in ["completed", "failed"]):
                    tasks_to_remove.append(task_id)
            
            for task_id in tasks_to_remove:
                del self._tasks[task_id]
            
            if tasks_to_remove:
                logger.info(f"🧹 Cleaned up {len(tasks_to_remove)} old tasks")
    
    def get_active_tasks_count(self) -> int:
        """Get count of currently running tasks"""
        with self._lock:
            return len([t for t in self._tasks.values() if t["status"] == "running"])


# Global task manager instance
task_manager = TaskManager()