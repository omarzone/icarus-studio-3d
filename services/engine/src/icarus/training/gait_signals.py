import math
from statistics import fmean, pstdev

from icarus.sim.gait import yaw
from icarus.sim.model_state import LiveWorld
from icarus.sim.rewards import RewardState
from icarus.training.episodes import FootSignal, GaitSignals


def measures_gait(world: LiveWorld) -> bool:
    """Gait is measured for bodies that walk: locomotion tasks and legged bodies sent to a goal."""
    return world.agent is not None and (world.family == "locomotion" or world.legged)


class GaitMeter:
    """Accumulates the gait signals of one episode from the reward state after every control step."""

    def __init__(self, world: LiveWorld, start: RewardState) -> None:
        self.world, self.start, self.last = world, start, start
        self.heights: list[float] = []
        self.tilts: list[float] = []
        self.turns: list[float] = []
        self.limits: list[float] = []
        self.changes: list[float] = []
        self.contacts = [0] * len(world.feet)
        self.lift_offs = [0] * len(world.feet)
        self.airborne = 0
        self.flight = 0

    def add(self, state: RewardState) -> None:
        self.heights.append(state.position[2])
        self.tilts.append(math.degrees(math.acos(min(max(state.up, -1.0), 1.0))))
        self.turns.append(abs(math.degrees(yaw(state.forward))))
        self.limits.append(state.at_limits)
        if state.controls and len(state.controls) == len(self.last.controls):
            pairs = zip(self.last.controls, state.controls, strict=True)
            self.changes.append(fmean(abs(new - old) for old, new in pairs))
        for index, down in enumerate(state.feet_down):
            self.contacts[index] += down
        for index, air in enumerate(state.landed_air):
            self.lift_offs[index] += air > 0
        if state.feet_down and not all(state.feet_down):
            self.airborne += 1
        if state.feet_down and not any(state.feet_down):
            self.flight += 1
        self.last = state

    def result(self, seconds: float) -> GaitSignals | None:
        steps = len(self.heights)
        if steps == 0:
            return None
        world, start, end = self.world, self.start, self.last
        model = world.model
        feet = [
            FootSignal(
                name=str(world.object_names.get(model.body(foot).name, model.body(foot).name)),
                contact_share=round(self.contacts[index] / steps, 3),
                lift_offs=self.lift_offs[index],
            )
            for index, foot in enumerate(world.feet)
        ]
        return GaitSignals(
            height_mean=round(fmean(self.heights), 3),
            height_spread=round(pstdev(self.heights), 3),
            start_height=round(world.start_height, 3),
            tilt_mean=round(fmean(self.tilts), 1),
            turn_mean=round(fmean(self.turns), 1),
            forward_speed=round((end.position[0] - start.position[0]) / seconds, 3) if seconds > 0 else 0.0,
            drift=round(end.position[1] - start.position[1], 3),
            feet=feet,
            airborne_share=round(self.airborne / steps, 3),
            flight_share=round(self.flight / steps, 3),
            joints_at_limits=round(fmean(self.limits), 3),
            action_change=round(fmean(self.changes), 3) if self.changes else 0.0,
        )
