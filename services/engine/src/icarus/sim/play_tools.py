import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.scene import Vector3
from icarus.sim.model_state import LiveWorld, build_world

_QPOS_SIZE = {
    int(mujoco.mjtJoint.mjJNT_FREE): 7,
    int(mujoco.mjtJoint.mjJNT_BALL): 4,
    int(mujoco.mjtJoint.mjJNT_SLIDE): 1,
    int(mujoco.mjtJoint.mjJNT_HINGE): 1,
}
_DOF_SIZE = {
    int(mujoco.mjtJoint.mjJNT_FREE): 6,
    int(mujoco.mjtJoint.mjJNT_BALL): 3,
    int(mujoco.mjtJoint.mjJNT_SLIDE): 1,
    int(mujoco.mjtJoint.mjJNT_HINGE): 1,
}


class ToolRejected(Exception):
    """A Play command that cannot act on this world; the message is shown to the user."""


def body_id(world: LiveWorld, object_id: str) -> int:
    index = int(mujoco.mj_name2id(world.model, mujoco.mjtObj.mjOBJ_BODY, object_id))
    if index < 0 or object_id not in world.object_names:
        raise ToolRejected(f"There is no object {object_id!r} in this world")
    return index


def free_joint(world: LiveWorld, body: int) -> int | None:
    """The free joint of a body that moves on its own, if it has one."""
    model = world.model
    if int(model.body_jntnum[body]) < 1:
        return None
    joint = int(model.body_jntadr[body])
    return joint if int(model.jnt_type[joint]) == int(mujoco.mjtJoint.mjJNT_FREE) else None


def move_body(world: LiveWorld, body: int, position: Vector3) -> None:
    joint = free_joint(world, body)
    if joint is None:
        name = world.object_names[world.model.body(body).name]
        raise ToolRejected(f"{name} is attached by a joint or fixed in place, so it cannot be moved")
    qpos, dof = int(world.model.jnt_qposadr[joint]), int(world.model.jnt_dofadr[joint])
    world.data.qpos[qpos : qpos + 3] = position
    world.data.qvel[dof : dof + 6] = 0
    mujoco.mj_forward(world.model, world.data)


def apply_impulse(world: LiveWorld, body: int, impulse: np.ndarray) -> None:
    """Change velocities as an impulse at the body's centre of mass would: dq = M⁻¹ Jᵀ p."""
    model, data = world.model, world.data
    mujoco.mj_forward(model, data)
    jacobian = np.zeros((3, model.nv))
    mujoco.mj_jacBodyCom(model, data, jacobian, None, body)
    if not np.any(jacobian):
        name = world.object_names[model.body(body).name]
        raise ToolRejected(f"{name} is fixed in place and cannot be pushed")
    generalized = (jacobian.T @ impulse).reshape(1, model.nv)
    change = np.zeros((1, model.nv))
    mujoco.mj_solveM(model, data, change, generalized)
    data.qvel[:] += change[0]
    mujoco.mj_forward(model, data)


def movable_props(world: LiveWorld) -> list[int]:
    """World objects that move freely: everything a shuffle may relocate."""
    roots = [obj.id for obj in world.project.world.objects if obj.parent is None]
    bodies = [int(mujoco.mj_name2id(world.model, mujoco.mjtObj.mjOBJ_BODY, root)) for root in roots]
    return [body for body in bodies if body >= 0 and free_joint(world, body) is not None]


def shuffle_props(world: LiveWorld, rng: np.random.Generator, reach: float) -> int:
    props = movable_props(world)
    if not props:
        raise ToolRejected("There are no movable props to shuffle")
    for body in props:
        joint = free_joint(world, body)
        assert joint is not None
        qpos, dof = int(world.model.jnt_qposadr[joint]), int(world.model.jnt_dofadr[joint])
        world.data.qpos[qpos : qpos + 2] += rng.uniform(-reach, reach, 2)
        world.data.qvel[dof : dof + 6] = 0
    mujoco.mj_forward(world.model, world.data)
    return len(props)


def copy_state(old: LiveWorld, new: LiveWorld) -> None:
    """Carry joint positions, velocities, controls and time over by name."""
    for joint in range(old.model.njnt):
        index = int(mujoco.mj_name2id(new.model, mujoco.mjtObj.mjOBJ_JOINT, old.model.joint(joint).name))
        if index < 0:
            continue
        kind = int(old.model.jnt_type[joint])
        source, target = int(old.model.jnt_qposadr[joint]), int(new.model.jnt_qposadr[index])
        new.data.qpos[target : target + _QPOS_SIZE[kind]] = old.data.qpos[source : source + _QPOS_SIZE[kind]]
        source, target = int(old.model.jnt_dofadr[joint]), int(new.model.jnt_dofadr[index])
        new.data.qvel[target : target + _DOF_SIZE[kind]] = old.data.qvel[source : source + _DOF_SIZE[kind]]
    new.data.ctrl[:] = old.data.ctrl
    new.data.time = old.data.time
    new.model.opt.wind[:] = old.model.opt.wind
    new.model.opt.density = old.model.opt.density
    new.start_height = old.start_height


def add_piece(world: LiveWorld, spec: ObjectSpec) -> LiveWorld:
    """A rebuilt world with the object added and every existing body where it was."""
    project = world.project.model_copy(deep=True)
    project.world.objects.append(spec)
    rebuilt = build_world(project)
    copy_state(world, rebuilt)
    mujoco.mj_forward(rebuilt.model, rebuilt.data)
    return rebuilt
