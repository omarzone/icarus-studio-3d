from dataclasses import dataclass

from icarus.contracts.operations import AddBody, CreateObject, EditOperation, OperationBatch, RemoveBody
from icarus.contracts.project import Project
from icarus.contracts.robots import RobotImport, RobotImported
from icarus.contracts.specs import BodySpec
from icarus.projects.auto_rig import new_body_id, spawn_spot, walking_task
from icarus.projects.robot_files import RobotFormat, RobotRejected, decode_files, read_robot
from icarus.projects.robot_parts import robot_parts
from icarus.projects.store import ProjectStore, RejectedBatch


@dataclass(frozen=True)
class RobotBuild:
    operations: list[EditOperation]
    body_id: str
    label: str
    format: RobotFormat
    parts: int
    joints: int
    motors: int
    notes: list[str]


def _label(stem: str) -> str:
    text = stem.replace("_", " ").replace("-", " ").strip()
    return (text[:1].upper() + text[1:])[:80] or "Robot"


def build_robot(project: Project, named: dict[str, bytes], main: str | None = None) -> RobotBuild:
    """The operations that make a URDF or MJCF robot the project's body, standing on the spawn point; a walking
    task replaces one that cannot drive a body. A URDF's base floats, as MuJoCo would weld it to the world."""
    robot = read_robot(named, main)
    label = _label(robot.stem)
    body_id = new_body_id(label, project)
    world = {obj.id for obj in project.world.objects}
    x, y = spawn_spot(project)
    floating = True if robot.format == "urdf" else None
    mapped = robot_parts(robot.model, taken=world | {body_id}, at=(x, y, 0.0), floating=floating)
    operations: list[EditOperation] = [RemoveBody(op="remove_body", body=body.id) for body in project.bodies]
    operations.append(AddBody(op="add_body", body=BodySpec(id=body_id, name=label, objects=[])))
    operations += [CreateObject(op="create_object", target=body_id, object=part.spec()) for part in mapped.parts]
    operations += walking_task(project)
    return RobotBuild(
        operations, body_id, label, robot.format, len(mapped.parts), mapped.joints, mapped.motors, mapped.notes
    )


def import_robot(store: ProjectStore, project_id: str, upload: RobotImport) -> RobotImported:
    """Build the robot and apply it in one revision that passes the design tests."""
    build = build_robot(store.state(project_id).project, decode_files(upload.files), upload.main)
    batch = OperationBatch(operations=build.operations, summary=f"Imported the robot {build.label}")
    try:
        state = store.apply(project_id, batch)
    except RejectedBatch as rejected:
        reasons = "; ".join(issue.message for issue in rejected.issues) or "the physics tests failed"
        raise RobotRejected(f"{build.label} did not pass the design tests once imported: {reasons}") from rejected
    return RobotImported(
        body=build.body_id,
        name=build.label,
        format=build.format,
        parts=build.parts,
        joints=build.joints,
        motors=build.motors,
        revision=state.revision.number,
        notes=build.notes,
    )
