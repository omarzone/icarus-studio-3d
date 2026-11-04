from icarus.contracts.operations import AddBody, CreateObject, EditOperation, OperationBatch, RemoveBody
from icarus.contracts.robots import RobotImport, RobotImported
from icarus.contracts.specs import BodySpec
from icarus.projects.auto_rig import new_body_id, spawn_spot, walking_task
from icarus.projects.robot_files import RobotRejected, read_robot
from icarus.projects.robot_parts import robot_parts
from icarus.projects.store import ProjectStore, RejectedBatch


def _label(stem: str) -> str:
    text = stem.replace("_", " ").replace("-", " ").strip()
    return (text[:1].upper() + text[1:])[:80] or "Robot"


def import_robot(store: ProjectStore, project_id: str, upload: RobotImport) -> RobotImported:
    """Read a URDF or MJCF robot with MuJoCo and make it the project's body, standing on the spawn point, in one
    revision that passes the design tests; a walking task replaces one that cannot drive a body."""
    project = store.state(project_id).project
    robot = read_robot(upload.files, upload.main)
    label = _label(robot.stem)
    body_id = new_body_id(label, project)
    world = {obj.id for obj in project.world.objects}
    x, y = spawn_spot(project)
    mapped = robot_parts(
        robot.model, taken=world | {body_id}, at=(x, y, 0.0), floating=True if robot.format == "urdf" else None
    )
    operations: list[EditOperation] = [RemoveBody(op="remove_body", body=body.id) for body in project.bodies]
    operations.append(AddBody(op="add_body", body=BodySpec(id=body_id, name=label, objects=[])))
    operations += [CreateObject(op="create_object", target=body_id, object=part.spec()) for part in mapped.parts]
    operations += walking_task(project)
    batch = OperationBatch(operations=operations, summary=f"Imported the robot {label}")
    try:
        state = store.apply(project_id, batch)
    except RejectedBatch as rejected:
        reasons = "; ".join(issue.message for issue in rejected.issues) or "the physics tests failed"
        raise RobotRejected(f"{label} did not pass the design tests once imported: {reasons}") from rejected
    return RobotImported(
        body=body_id,
        name=label,
        format=robot.format,
        parts=len(mapped.parts),
        joints=mapped.joints,
        motors=mapped.motors,
        revision=state.revision.number,
        notes=mapped.notes,
    )
