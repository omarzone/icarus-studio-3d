"""The two small robots of the import tests, as picked files: an MJCF walker and a URDF leg, each with its mesh."""

import base64
from pathlib import Path

from icarus.contracts.robots import RobotFile
from tests.model_files import box_stl

ROBOTS = Path(__file__).parent / "projects" / "robots"


def robot_file(name: str, data: bytes) -> RobotFile:
    return RobotFile(name=name, data=base64.b64encode(data).decode())


def walker_files() -> list[RobotFile]:
    # The mesh comes from a subfolder, as a picked mesh folder would; only its name counts.
    description = robot_file("tiny_walker.xml", (ROBOTS / "tiny_walker.xml").read_bytes())
    return [description, robot_file("meshes/foot.stl", box_stl((0.16, 0.08, 0.03)))]


def leg_files() -> list[RobotFile]:
    description = robot_file("tiny_leg.urdf", (ROBOTS / "tiny_leg.urdf").read_bytes())
    return [description, robot_file("shin.stl", box_stl((0.05, 0.05, 0.3)))]
