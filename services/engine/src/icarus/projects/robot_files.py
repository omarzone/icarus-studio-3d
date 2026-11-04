"""URDF and MJCF robot files read by MuJoCo itself, only as data: the files land flat in a private folder, every
file they name is looked up there by its name alone, and nothing in them ever runs."""

import base64
import binascii
import re
import tempfile
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import Literal

import mujoco

from icarus.contracts.robots import RobotFile

DESCRIPTIONS = (".urdf", ".xml", ".mjcf")
MAX_TOTAL_BYTES = 30_000_000
_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$")
# Elements that load engine plugins; a robot description is data and never asks for code.
_REFUSED_TAGS = {"plugin", "extension", "instance"}

RobotFormat = Literal["urdf", "mjcf"]


class RobotRejected(ValueError):
    pass


@dataclass(frozen=True)
class RobotModel:
    model: mujoco.MjModel
    format: RobotFormat
    # The description's file name, without its suffix.
    stem: str


def _decode(file: RobotFile) -> bytes:
    try:
        return base64.b64decode("".join(file.data.split()), validate=True)
    except (binascii.Error, ValueError) as error:
        raise RobotRejected(f"{file.name} is not valid base64") from error


def named_files(files: Iterable[tuple[str, bytes]]) -> dict[str, bytes]:
    """Each file under its name alone, refusing names a folder cannot keep and two files with one name."""
    named: dict[str, bytes] = {}
    for path, data in files:
        name = _file_name(path)
        if not _NAME.match(name):
            raise RobotRejected(f"{path} is not a file name the import can keep")
        if name.lower() in {item.lower() for item in named}:
            raise RobotRejected(f"Two picked files are named {name}; robot files are looked up by name alone")
        named[name] = data
    if sum(len(data) for data in named.values()) > MAX_TOTAL_BYTES:
        raise RobotRejected(f"The robot's files are larger than {MAX_TOTAL_BYTES // 1_000_000} MB together")
    return named


def decode_files(files: list[RobotFile]) -> dict[str, bytes]:
    return named_files((file.name, _decode(file)) for file in files)


def _tree(name: str, data: bytes) -> ET.Element:
    text = data.decode("utf-8", errors="replace")
    if re.search(r"<!(DOCTYPE|ENTITY)", text, re.IGNORECASE):
        raise RobotRejected(f"{name} declares a DOCTYPE or entities, which a robot description never needs")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as error:
        raise RobotRejected(f"{name} is not valid XML: {error}") from error
    refused = sorted({element.tag for element in root.iter()} & _REFUSED_TAGS)
    if refused:
        raise RobotRejected(f"{name} asks for engine plugins ({', '.join(refused)}), which the import never loads")
    return root


def _included(root: ET.Element) -> set[str]:
    return {_file_name(item.get("file", "")) for item in root.iter("include")}


def _flat_includes(root: ET.Element) -> bytes:
    """The description with every include naming a picked file by name, so it is read from the private folder."""
    for item in root.iter("include"):
        item.set("file", _file_name(item.get("file", "")))
    return ET.tostring(root, encoding="utf-8")


def _file_name(path: str) -> str:
    return PurePath(path.replace("\\", "/")).name


def _main(trees: dict[str, ET.Element], asked: str | None) -> str:
    if asked is not None:
        name = _file_name(asked)
        if name not in trees:
            raise RobotRejected(f"{asked} is not one of the picked .urdf or .xml files")
        return name
    included = set().union(*(_included(root) for root in trees.values()))
    tops = [name for name, root in trees.items() if root.tag in ("robot", "mujoco") and name not in included]
    if len(tops) == 1:
        return tops[0]
    if not tops:
        raise RobotRejected("Pick the robot's .urdf or MJCF .xml file along with its meshes")
    raise RobotRejected("Several robot descriptions were picked; pick one .urdf or one MJCF .xml with its meshes")


def _without_textures(spec: mujoco.MjSpec) -> None:
    """Textures only change looks the studio draws its own way, so a robot imports without its image files."""
    for material in spec.materials:
        material.textures = ["" for _ in material.textures]
    for texture in list(spec.textures):
        spec.delete(texture)


def _first_line(error: Exception) -> str:
    text = str(error).strip()
    return text.splitlines()[0] if text else "unknown error"


def read_robot(named: dict[str, bytes], main: str | None = None) -> RobotModel:
    """Compile the robot with MuJoCo from files by name (see `named_files`), every file it names found among them."""
    trees = {name: _tree(name, data) for name, data in named.items() if name.lower().endswith(DESCRIPTIONS)}
    chosen = _main(trees, main)
    kind: RobotFormat = "urdf" if trees[chosen].tag == "robot" else "mjcf"
    if kind == "mjcf" and trees[chosen].tag != "mujoco":
        raise RobotRejected(f"{chosen} is neither a URDF robot nor an MJCF model")
    with tempfile.TemporaryDirectory(prefix="icarus-robot-") as folder:
        root = Path(folder)
        for name, data in named.items():
            tree = trees.get(name)
            (root / name).write_bytes(_flat_includes(tree) if tree is not None and _included(tree) else data)
        try:
            spec = mujoco.MjSpec.from_file(str(root / chosen))
            spec.meshdir = ""
            spec.texturedir = ""
            spec.strippath = True
            # Links a URDF welds to its root stay their own parts instead of melting into the world.
            spec.compiler.fusestatic = False
            _without_textures(spec)
            model = spec.compile()
        except (ValueError, mujoco.FatalError) as error:
            # The private folder means nothing to the person; the file names do.
            reason = re.sub(r"[^\s']*" + re.escape(root.name) + r"[\\/]", "", _first_line(error))
            raise RobotRejected(f"MuJoCo could not read {chosen}: {reason}") from error
    if model.nbody < 2:
        raise RobotRejected(f"{chosen} has no bodies to import")
    return RobotModel(model=model, format=kind, stem=PurePath(chosen).stem)
