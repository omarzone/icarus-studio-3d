from fastapi import APIRouter, Request

from icarus.contracts.robots import RobotImport, RobotImported
from icarus.projects.robot_import import import_robot
from icarus.projects.store import ProjectStore

router = APIRouter()


@router.post("/projects/{project_id}/robots", status_code=201)
def import_robot_files(request: Request, project_id: str, body: RobotImport) -> RobotImported:
    store: ProjectStore = request.app.state.store
    return import_robot(store, project_id, body)
