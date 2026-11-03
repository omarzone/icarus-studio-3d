"""Play for a project with several agents: every agent steps its own world, with only its body and its own brain, as it
trained; the frames show them together. Nothing physical passes between them (ADR 013)."""

from dataclasses import dataclass

from icarus.contracts.play import (
    AddObjectCommand,
    LightCommand,
    MoveCommand,
    PauseCommand,
    PlayAgentBrain,
    PlayAgentStatus,
    PlayCommand,
    PlayEvent,
    PlayFrame,
    PlayReady,
    PlaySessionInfo,
    PushCommand,
    ResetCommand,
    ShuffleCommand,
    SpeedCommand,
    TouchCommand,
    WindCommand,
)
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneDescription
from icarus.copilot.language import Language
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.projects.agents import agent_brain, agent_project
from icarus.sim.play import PlayReply, PlaySession
from icarus.sim.policy import Policy

# Commands every agent's world follows, so the lanes stay in step.
_ALL = (LightCommand, WindCommand, SpeedCommand, PauseCommand, ResetCommand)


@dataclass(frozen=True)
class AgentBrain:
    """The brain one agent plays with: its policy, and the run and step it comes from when trained."""

    policy: Policy
    run_id: str | None = None
    step: int | None = None


class AgentsPlay:
    """The same surface as PlaySession over one session per agent; the first agent's session leads the shared world."""

    def __init__(self, project: Project, revision: int, brains: list[AgentBrain], language: Language = "en") -> None:
        if len(brains) != len(project.agents):
            raise ValueError("Every agent needs a brain")
        self.revision = revision
        self.agents = list(project.agents)
        self.brains = brains
        self.sessions = [
            PlaySession(
                agent_project(project, agent.id),
                revision,
                brain.policy,
                agent_brain(project, agent).seed,
                language,
                brain.step or 0,
            )
            for agent, brain in zip(self.agents, brains, strict=True)
        ]
        self._scene = scene_description(compile_project(project), revision)
        parts = {agent.id: set(agent.parts) for agent in self._scene.agents}
        self._parts = [parts.get(agent.id, set()) for agent in self.agents]
        self._geom_body = {geom.name: geom.body for geom in self._scene.geoms}

    @property
    def paused(self) -> bool:
        return self.sessions[0].paused

    def _owner(self, object_id: str) -> PlaySession:
        """The session whose agent has this part; world objects belong to the leading session."""
        for parts, session in zip(self._parts, self.sessions, strict=True):
            if object_id in parts:
                return session
        return self.sessions[0]

    def _ours(self, replies: list[PlayReply]) -> list[PlayReply]:
        return [self.ready() if isinstance(reply, PlayReady) else reply for reply in replies]

    def apply(self, command: PlayCommand) -> list[PlayReply]:
        match command:
            case MoveCommand() | PushCommand() | TouchCommand():
                return self._ours(self._owner(command.object).apply(command))
            case AddObjectCommand() | ShuffleCommand():
                return self._ours(self.sessions[0].apply(command))
            case _ if isinstance(command, _ALL):
                replies = [session.apply(command) for session in self.sessions]
                return self._ours(replies[0])
        return []

    def step_realtime(self, dt_real: float) -> list[PlayEvent]:
        events: list[PlayEvent] = []
        for agent, session in zip(self.agents, self.sessions, strict=True):
            for event in session.step_realtime(dt_real):
                events.append(event.model_copy(update={"text": f"{agent.name}: {event.text}"}))
        return events

    def due(self) -> list[PlayReply]:
        return self._ours(self.sessions[0].due())

    def scene(self) -> SceneDescription:
        """Every agent's body and lane, with anything Add object brought into the leading world."""
        lead = scene_description(self.sessions[0].world.compiled, self.revision)
        known = {geom.name for geom in self._scene.geoms}
        known_bodies = {body.name for body in self._scene.bodies}
        added = [geom for geom in lead.geoms if geom.name not in known]
        bodies = [body for body in lead.bodies if body.name not in known_bodies]
        return self._scene.model_copy(
            update={"geoms": [*self._scene.geoms, *added], "bodies": [*self._scene.bodies, *bodies]}
        )

    def ready(self) -> PlayReady:
        return PlayReady(type="ready", session=self.info())

    def info(self) -> PlaySessionInfo:
        lead = self.sessions[0].info()
        agents = [
            PlayAgentBrain(
                agent=agent.id, name=agent.name, brain=brain.policy.label, run_id=brain.run_id, step=brain.step
            )
            for agent, brain in zip(self.agents, self.brains, strict=True)
        ]
        return lead.model_copy(
            update={
                "brain": ", ".join(f"{agent.name}: {agent.brain}" for agent in agents),
                "run_id": None,
                "step": None,
                "scene": self.scene(),
                "agents": agents,
            }
        )

    def frame(self) -> PlayFrame:
        frames = [session.frame() for session in self.sessions]
        lead = frames[0]
        geoms = list(lead.geoms)
        for parts, frame in zip(self._parts[1:], frames[1:], strict=True):
            geoms += [geom for geom in frame.geoms if self._geom_body.get(geom.name) in parts]
        signals = lead.signals
        if signals is not None:
            seen = {reading.object for reading in signals.displays}
            displays = list(signals.displays)
            for frame in frames[1:]:
                for reading in frame.signals.displays if frame.signals else []:
                    if reading.object not in seen:
                        displays.append(reading)
                        seen.add(reading.object)
            signals = signals.model_copy(update={"displays": displays})
        statuses = [
            PlayAgentStatus(
                agent=agent.id,
                name=agent.name,
                status=frame.status,
                reward=frame.reward,
                episode_return=frame.episode_return,
            )
            for agent, frame in zip(self.agents, frames, strict=True)
        ]
        return lead.model_copy(update={"geoms": geoms, "signals": signals, "agents": statuses})
