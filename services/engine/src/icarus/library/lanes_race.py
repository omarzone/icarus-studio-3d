"""A race in lanes: an obstacle course with a lane per agent, each agent a different library body with its own brain,
spawn point, finish and scoreboard showing what the engine measures for it."""

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, EditOperation, SetAgent
from icarus.contracts.project import Project
from icarus.library.agents import agent_operations
from icarus.library.layout_params import ObstacleCourse
from icarus.library.layouts import expand_layout
from icarus.library.parts import Part, Raw
from icarus.projects.operations import empty_project

# Lane by lane, the body that races in it and its name.
RACERS: tuple[tuple[str, str], ...] = (
    ("walker_robot", "Walker"),
    ("humanoid", "Humanoid"),
    ("parking_car", "Car"),
    ("motorcycle", "Motorcycle"),
)
BOARD_HEIGHT = 2.2
# Each panel of a lane's scoreboard: what it shows, its label, format and place across the lane.
PANELS: tuple[tuple[str, str, str, str, float], ...] = (
    ("time", "episode_time", "TIME", "time", -0.36),
    ("try", "try", "TRY", "integer", -0.12),
    ("left", "goal_distance", "TO GO", "decimal", 0.12),
    ("wins", "successes", "WINS", "integer", 0.36),
)


def race_course(lanes: int) -> ObstacleCourse:
    return ObstacleCourse(
        recipe="obstacle_course",
        length=30,
        lanes=lanes,
        lane_width=4,
        barriers=0.3,
        ramps=True,
        ramp_height=0.1,
        spawn=False,
        goal=False,
    )


def _panel(id: str, name: str, parent: str, position: tuple[float, float, float], display: dict[str, Raw]) -> Part:
    """A look-only panel facing back along the lane, toward the start; nothing touches it."""
    return Part(
        id,
        name,
        parent,
        {
            "transform": {"position": position, "rotation": (0, 0, 180)},
            "mesh": {"shape": "box", "size": (0.05, 0.9, 0.45)},
            "material": {"color": "#1b1d22", "finish": "painted_metal"},
            "display": {"offset": (0.03, 0, 0), "width": 0.8, "decimals": 1} | display,
        },
    )


def scoreboard(prefix: str, name: str, start: tuple[float, float], lane_width: float) -> list[ObjectSpec]:
    """A lane's scoreboard above its start: the agent's name and its time, tries, metres to go and wins."""
    root = f"{prefix}board"
    x, y = start[0] - 1.5, start[1]
    parts = [Part(root, f"{name} scoreboard", None, {"transform": {"position": (x, y, 0)}})]
    parts.append(
        _panel(
            f"{prefix}board_name",
            f"{name} name",
            root,
            (0, 0, BOARD_HEIGHT + 0.5),
            {"source": "fixed", "format": "text", "text": name.upper()},
        )
    )
    for key, source, label, fmt, across in PANELS:
        position = (0, across * lane_width, BOARD_HEIGHT)
        display: dict[str, Raw] = {"source": source, "format": fmt, "label": label}
        parts.append(_panel(f"{prefix}board_{key}", f"{name} {label.lower()}", root, position, display))
    return [part.spec() for part in parts]


def race_operations(project: Project, lanes: int = len(RACERS)) -> list[EditOperation]:
    """Lay the course from where the project's ground is and put an agent with its scoreboard in each lane."""
    layout = expand_layout(race_course(lanes), project, (0.0, 0.0))
    operations: list[EditOperation] = list(layout.operations)
    for index, ((body, name), (start, goal)) in enumerate(zip(RACERS, layout.site.lanes, strict=False)):
        prefix = f"lane{index + 1}_"
        world_start = (layout.origin[0] + start[0], layout.origin[1] + start[1])
        world_goal = (layout.origin[0] + goal[0], layout.origin[1] + goal[1])
        board = scoreboard(prefix, name, world_start, 4)
        operations += [CreateObject(op="create_object", target="world", object=obj) for obj in board]
        operations += agent_operations(project, body, name, world_start, world_goal, prefix=prefix)
        operations.append(SetAgent(op="set_agent", agent=prefix[:-1], objects=[board[0].id]))
    return operations


def race_template() -> list[EditOperation]:
    """The race on a new project, after its ground, sun and sky."""
    return race_operations(empty_project("000000000000", "Lanes race"))
