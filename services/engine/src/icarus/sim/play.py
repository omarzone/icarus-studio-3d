import math
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.play import (
    AddObjectCommand,
    LightCommand,
    MoveCommand,
    PauseCommand,
    PlayCommand,
    PlayErrorMessage,
    PlayEvent,
    PlayEventMessage,
    PlayFrame,
    PlayGeomPose,
    PlayReading,
    PlayReady,
    PlaySessionInfo,
    PlayStatus,
    PlayToolInfo,
    PushCommand,
    ResetCommand,
    ShuffleCommand,
    SpeedCommand,
    TouchCommand,
    WindCommand,
)
from icarus.contracts.project import Project
from icarus.copilot.language import Language, say
from icarus.design.ray_readings import ray_readings
from icarus.design.scene import scene_description
from icarus.library.pieces import PIECES
from icarus.sim.brain_readings import action_readings, sense_readings
from icarus.sim.displays import goal_distance
from icarus.sim.model_state import (
    apply_action,
    build_world,
    control_substeps,
    observation,
    reset_world,
    reward_state,
    touching,
)
from icarus.sim.play_drops import (
    PendingDrop,
    check_drop,
    piece_object,
    play_pieces,
    rain,
    spawn_point,
    throw_velocity,
)
from icarus.sim.play_tools import (
    ToolRejected,
    add_piece,
    apply_impulse,
    body_id,
    free_joint,
    movable_props,
    move_body,
    shuffle_props,
)
from icarus.sim.policy import Policy
from icarus.sim.rewards import RewardState, compose, inside_goal
from icarus.sim.signals import scene_signals
from icarus.sim.start_pose import place_start
from icarus.sim.success import task_done

PlayReply = PlayEventMessage | PlayErrorMessage | PlayReady
EventKind = Literal["user", "agent", "world"]

AIR_DENSITY = 1.204
SHUFFLE_REACH = 1.0
# The downward impulse of a poke, in N·s.
POKE = 2.0

_CORE_TOOLS = [
    ("move", "Move"),
    ("push", "Push"),
    ("add-object", "Add object"),
    ("light", "Light"),
    ("wind", "Wind"),
    ("slow", "Slow"),
    ("reset", "Reset"),
]


def _amount(value: float) -> str:
    return f"{value:.0f}" if abs(value) >= 10 else f"{value:.2g}"


def _vector(values) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]))


class PlaySession:
    """One live world stepped in real time with a brain. It works on its own copy and never changes the project."""

    def __init__(
        self,
        project: Project,
        revision: int,
        brain: Policy,
        seed: int,
        language: Language = "en",
        brain_steps: int | None = None,
    ) -> None:
        self.revision = revision
        self.language: Language = language
        self.brain = brain
        # The world as designed; Reset returns to it, dropping whatever Add object brought in.
        self._project = project.model_copy(deep=True)
        self.world = build_world(self._project.model_copy(deep=True))
        self._added = 0
        self._rain: list[tuple[AddObjectCommand, PendingDrop]] = []
        self.speed = 1.0
        self.paused = False
        self._project_id = project.id
        self._rng = np.random.default_rng(seed)
        self._substeps = control_substeps(self.world)
        self._base_diffuse = self.world.model.light_diffuse.copy()
        self._terms = [term.term for term in project.task.rewards]
        self._weights = [term.weight for term in project.task.rewards]
        self.world.tally.training_steps = brain_steps
        self._restart()

    def _restart(self) -> None:
        reset_world(self.world)
        spawn = self.world.spawn
        # Play starts where the agent stands unless the spawn point asks for varied starts, which each reset draws.
        if spawn is not None and spawn.mode != "auto":
            place_start(self.world, self._rng)
        self.step = 0
        self.reward = 0.0
        self.episode_return = 0.0
        self._debt = 0.0
        self._observe()
        self.world.tally.start_try(goal_distance(self._state))
        self._act()

    def _observe(self) -> None:
        self._state = reward_state(self.world)
        self._touching = touching(self.world)
        self._plates_reached = list(self.world.plate_reached)

    def _act(self) -> None:
        if self.world.actuators:
            apply_action(self.world, self.brain.act(observation(self.world)))

    def _name(self, object_id: str | None) -> str:
        return self.world.object_names.get(object_id or "", object_id or "")

    def _text(self, key: str, **values: object) -> str:
        return say(key, self.language, **values)

    def _event(self, text: str, kind: EventKind = "user") -> PlayEvent:
        return PlayEvent(time=float(self.world.data.time), kind=kind, text=text)

    def step_realtime(self, dt_real: float) -> list[PlayEvent]:
        """Advance dt_real × speed of simulated time, running the brain at the control rate."""
        if self.paused or dt_real <= 0:
            return []
        timestep = float(self.world.model.opt.timestep)
        self._debt += dt_real * self.speed
        steps = int(self._debt / timestep + 1e-9)
        self._debt -= steps * timestep
        events: list[PlayEvent] = []
        for _ in range(steps):
            mujoco.mj_step(self.world.model, self.world.data)
            self.step += 1
            if self.step % self._substeps == 0:
                events += self._control()
        return events

    def _control(self) -> list[PlayEvent]:
        before, after = self._state, reward_state(self.world)
        self.reward = compose(self._terms, self._weights, before, after)[0] if self.world.agent is not None else 0.0
        self.episode_return += self.reward
        self.world.tally.episode_return = self.episode_return
        events: list[PlayEvent] = []
        agent = self._name(self.world.agent_object)
        now = touching(self.world)
        for geom in sorted(now - self._touching):
            other = self._name(self.world.model.geom(geom).name)
            events.append(self._event(self._text("play_touched", agent=agent, other=other), "agent"))
        if self.world.goal and inside_goal(after) and not inside_goal(before):
            goal = self._name(self.world.goal.object)
            events.append(
                self._event(self._text("play_reached", agent=agent, goal=f"{goal[:1].lower()}{goal[1:]}"), "agent")
            )
        if after.fallen and not before.fallen:
            events.append(self._event(self._text("play_fell", agent=agent), "agent"))
        events += self._plate_events(before, after, agent)
        self._state, self._touching = after, now
        self._plates_reached = list(self.world.plate_reached)
        self._act()
        return events

    def _plate_events(self, before: RewardState, after: RewardState, agent: str) -> list[PlayEvent]:
        """Plates reached for the first time in this try, and the goal completed when the plates are the goal; a plate
        that flickers under a stumbling body is told once."""
        events: list[PlayEvent] = []
        for plate, now, was in zip(self.world.plates, self.world.plate_reached, self._plates_reached, strict=False):
            if now and not was:
                events.append(self._event(self._text("play_plate_on", plate=self._name(plate.object)), "world"))
        if task_done(self.world, after) and not task_done(self.world, before):
            self.world.tally.successes += 1
            if self.world.plate_goal:
                events.append(self._event(self._text("play_plates_done", agent=agent), "agent"))
        return events

    def apply(self, command: PlayCommand) -> list[PlayReply]:
        """Act on the world. A command that cannot act returns an error message instead of raising."""
        try:
            return self._apply(command)
        except ToolRejected as rejected:
            return [PlayErrorMessage(type="error", message=str(rejected))]

    def _say(self, text: str, kind: EventKind = "user") -> PlayEventMessage:
        return PlayEventMessage(type="event", event=self._event(text, kind))

    def _ready(self) -> PlayReady:
        return PlayReady(type="ready", session=self.info())

    def _apply(self, command: PlayCommand) -> list[PlayReply]:
        world = self.world
        match command:
            case MoveCommand():
                move_body(world, body_id(world, command.object), command.position)
                return [self._say(self._text("play_moved", name=self._name(command.object)))]
            case PushCommand():
                body = body_id(world, command.object)
                direction = np.array(command.direction, dtype=float)
                length = float(np.linalg.norm(direction))
                if length < 1e-9:
                    raise ToolRejected("A push needs a direction")
                # Sized by the mass that moves with the part, so a push shows on a car as on a box.
                impulse = direction / length * command.speed * float(world.model.body_subtreemass[body])
                apply_impulse(world, body, impulse)
                magnitude = _amount(float(np.linalg.norm(impulse)))
                return [self._say(self._text("play_pushed", name=self._name(command.object), impulse=magnitude))]
            case AddObjectCommand():
                check_drop(command)
                drops = rain(command, float(world.data.time), self._rng)
                name = self._drop(command, drops[0])
                self._rain += [(command, drop) for drop in drops[1:]]
                if command.count > 1:
                    text = self._text("play_rain", count=command.count, name=name)
                elif command.placement == "throw":
                    text = self._text("play_threw", name=name, speed=f"{command.speed:g}")
                else:
                    text = self._text("play_dropped" if command.placement == "drop" else "play_added", name=name)
                return [self._ready(), self._say(text)]
            case LightCommand():
                world.model.light_diffuse[:] = self._base_diffuse * command.intensity
                return [self._ready(), self._say(self._text("play_light", percent=f"{command.intensity * 100:.0f}"))]
            case WindCommand():
                world.model.opt.wind[:] = command.velocity
                speed = math.hypot(*command.velocity)
                # Wind only pushes bodies through air, so air gets its density while wind blows.
                world.model.opt.density = AIR_DENSITY if speed > 0 else 0.0
                text = self._text("play_wind", speed=_amount(speed)) if speed > 0 else self._text("play_wind_off")
                return [self._say(text)]
            case SpeedCommand():
                self.speed = command.speed
                return [self._say(self._text("play_speed", speed=f"{command.speed:g}"))]
            case PauseCommand():
                self.paused = command.paused
                return [self._say(self._text("play_paused" if command.paused else "play_resumed"))]
            case ResetCommand():
                rebuilt = self._added > 0
                self._clear_added()
                self._restart()
                said = self._say(self._text("play_reset"), "world")
                return [self._ready(), said] if rebuilt else [said]
            case ShuffleCommand():
                count = shuffle_props(world, self._rng, SHUFFLE_REACH)
                self._observe()
                return [self._say(self._text("play_shuffled_one" if count == 1 else "play_shuffled", count=count))]
            case TouchCommand():
                body = body_id(world, command.object)
                if not any(sensor.id == f"{command.object}:touch" for sensor in world.sensors):
                    raise ToolRejected(f"{self._name(command.object)} has no touch sensor to poke")
                apply_impulse(world, body, np.array([0.0, 0.0, -POKE]))
                return [self._say(self._text("play_poked", name=self._name(command.object)))]

    def _drop(self, command: AddObjectCommand, drop: PendingDrop) -> str:
        """Add one copy to the running world; a throw leaves already flying at the agent."""
        old = self.world
        spec = piece_object(old.project, command, drop.position)
        launch = None
        if command.placement == "throw":
            if old.agent is None:
                raise ToolRejected("There is no agent to throw at")
            launch = throw_velocity(np.array(spawn_point(spec)), old.data.xpos[old.agent].copy(), command.speed)
        self.world = add_piece(old, spec)
        # The rebuilt world keeps the try's counts, so displays and plates carry on.
        self.world.tally = old.tally
        self.world.model.light_diffuse[:] = old.model.light_diffuse
        self._added += 1
        joint = free_joint(self.world, body_id(self.world, spec.id))
        if launch is not None and joint is not None:
            dof = int(self.world.model.jnt_dofadr[joint])
            self.world.data.qvel[dof : dof + 3] = launch
            mujoco.mj_forward(self.world.model, self.world.data)
        self._observe()
        return PIECES[command.piece].label if command.count > 1 else spec.name

    def due(self) -> list[PlayReply]:
        """Drop the copies of a rain whose time has come; a copy that cannot be added ends the rain."""
        now = float(self.world.data.time)
        ready = [entry for entry in self._rain if entry[1].due <= now]
        if not ready:
            return []
        self._rain = [entry for entry in self._rain if entry[1].due > now]
        try:
            for command, drop in ready:
                self._drop(command, drop)
        except ToolRejected as rejected:
            self._rain = []
            return [self._ready(), PlayErrorMessage(type="error", message=str(rejected))]
        return [self._ready()]

    def _clear_added(self) -> None:
        """Back to the designed world, keeping the light and wind the person set."""
        self._rain = []
        if self._added == 0:
            return
        old = self.world
        self.world = build_world(self._project.model_copy(deep=True))
        self.world.model.light_diffuse[:] = old.model.light_diffuse
        self.world.model.opt.wind[:] = old.model.opt.wind
        self.world.model.opt.density = old.model.opt.density
        self._added = 0

    def tools(self) -> list[PlayToolInfo]:
        tools = [PlayToolInfo(id=id, label=label) for id, label in _CORE_TOOLS]
        if any(sensor.kind == "touch" for sensor in self.world.sensors):
            tools.append(PlayToolInfo(id="touch", label="Touch"))
        if movable_props(self.world):
            tools.append(PlayToolInfo(id="shuffle", label="Shuffle"))
        return tools

    def info(self) -> PlaySessionInfo:
        return PlaySessionInfo(
            project_id=self._project_id,
            revision_number=self.revision,
            brain=self.brain.label,
            tools=self.tools(),
            scene=scene_description(self.world.compiled, self.revision),
            pieces=list(play_pieces()),
        )

    def _senses(self) -> list[PlayReading]:
        return sense_readings(self.world)

    def _status(self) -> PlayStatus:
        title = "Paused" if self.paused else "Playing"
        state, world = self._state, self.world
        if world.goal and state.goal is not None:
            goal = self._name(world.goal.object)
            if inside_goal(state):
                return PlayStatus(title=title, detail=f"Inside the {goal[:1].lower()}{goal[1:]}")
            distance = math.hypot(state.goal[0] - state.position[0], state.goal[1] - state.position[1])
            return PlayStatus(title=title, detail=f"{distance:.1f} m to the {goal[:1].lower()}{goal[1:]}")
        if world.agent is not None:
            return PlayStatus(title=title, detail=f"{self._name(world.agent_object)} at {state.position[2]:.2f} m high")
        return PlayStatus(title=title, detail=self.brain.label)

    def frame(self) -> PlayFrame:
        model, data = self.world.model, self.world.data
        geoms: list[PlayGeomPose] = []
        names = {geom.name for geom in scene_description(self.world.compiled, self.revision).geoms}
        for index in range(model.ngeom):
            name = model.geom(index).name
            if name not in names:
                continue
            quaternion = np.zeros(4)
            mujoco.mju_mat2Quat(quaternion, data.geom_xmat[index])
            geoms.append(
                PlayGeomPose(
                    name=name,
                    position=_vector(data.geom_xpos[index]),
                    quaternion=(
                        float(quaternion[0]),
                        float(quaternion[1]),
                        float(quaternion[2]),
                        float(quaternion[3]),
                    ),
                )
            )
        actions = action_readings(self.world)
        return PlayFrame(
            time=float(data.time),
            step=self.step,
            speed=self.speed,
            paused=self.paused,
            geoms=geoms,
            senses=self._senses(),
            actions=actions,
            reward=self.reward,
            episode_return=self.episode_return,
            status=self._status(),
            rays=ray_readings(model, data, {sensor.id: sensor.label for sensor in self.world.sensors}),
            signals=scene_signals(self.world, self._state),
        )
