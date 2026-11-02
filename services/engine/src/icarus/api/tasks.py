from fastapi import APIRouter, HTTPException, Request

from icarus.contracts.events import TaskInfo
from icarus.tasks import TaskRegistry, UnknownTask

router = APIRouter()


def _tasks(request: Request) -> TaskRegistry:
    return request.app.state.tasks


@router.get("/tasks")
def list_tasks(request: Request, project: str | None = None) -> list[TaskInfo]:
    return _tasks(request).list(project)


@router.delete("/tasks/{task_id}", status_code=202)
def cancel_task(request: Request, task_id: str) -> TaskInfo:
    try:
        return _tasks(request).cancel(task_id)
    except UnknownTask as error:
        raise HTTPException(status_code=404, detail=f"There is no task {task_id!r}") from error
