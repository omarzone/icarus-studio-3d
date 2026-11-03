"""Wedge and corner wedge parts: convex meshes the engine builds from a part's full size, centered on its box."""

import xml.etree.ElementTree as ET

MESH_SHAPES = frozenset({"wedge", "corner_wedge"})
MESH_SUFFIX = ":shape"

Vertex = tuple[float, float, float]


def wedge_vertices(shape: str, size: tuple[float, float, float]) -> list[Vertex]:
    """Corners of the shape inside the box of this full size: a wedge's top edge runs along -y, a corner wedge's
    peak stands over the +x, -y corner."""
    x, y, z = (value / 2 for value in size)
    floor = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z)]
    if shape == "wedge":
        return [*floor, (-x, -y, z), (x, -y, z)]
    return [*floor, (x, -y, z)]


def add_wedge_mesh(root: ET.Element, name: str, shape: str, size: tuple[float, float, float]) -> str:
    """Adds the mesh asset of one part and returns its name; each part has its own, sized as the part."""
    assets = root.find("asset")
    if assets is None:
        assets = ET.SubElement(root, "asset")
    vertices = " ".join(f"{value:.6g}" for vertex in wedge_vertices(shape, size) for value in vertex)
    mesh = f"{name}{MESH_SUFFIX}"
    ET.SubElement(assets, "mesh", {"name": mesh, "vertex": vertices})
    return mesh
