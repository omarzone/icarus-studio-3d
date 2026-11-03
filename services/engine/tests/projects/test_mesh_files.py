import struct

import numpy as np
import pytest

from icarus.projects.mesh_files import as_glb, read_mesh, write_glb
from icarus.projects.skin_files import SkinRejected, read_skin
from tests.model_files import glb, humanoid_obj


def test_an_obj_stands_on_the_engines_z_up_axes():
    mesh = read_mesh("person.obj", humanoid_obj())
    low, high = mesh.bounds
    # OBJ is Y-up: the person's 1.7 m height becomes z.
    assert high[2] - low[2] == pytest.approx(1.7, abs=1e-3)
    assert high[1] - low[1] < 0.25


def test_binary_and_text_stl_read_the_same_triangle():
    corners = [(0, 0, 0), (1, 0, 0), (0, 2, 0.5)]
    binary = b"\0" * 80 + struct.pack("<I", 1) + struct.pack("<12fH", 0, 0, 1, *[v for c in corners for v in c], 0)
    text = "solid t\nfacet normal 0 0 1\nouter loop\n" + "".join(f"vertex {x} {y} {z}\n" for x, y, z in corners)
    text += "endloop\nendfacet\nendsolid t\n"
    for data in (binary, text.encode()):
        mesh = read_mesh("part.stl", data)
        assert mesh.triangles.shape == (1, 3)
        np.testing.assert_allclose(mesh.vertices, corners)


def test_a_glb_reads_through_its_node_transform():
    mesh = read_mesh("tri.glb", glb())
    low, high = mesh.bounds
    # The node moves it by 5 on every axis, and Y-up becomes Z-up.
    np.testing.assert_allclose(low, (5, -5.5, 5))
    np.testing.assert_allclose(high, (7, -5, 6))


def test_a_written_glb_is_a_valid_skin_with_the_same_size():
    mesh = read_mesh("person.obj", humanoid_obj())
    skin = read_skin(write_glb(mesh))
    low, high = mesh.bounds
    np.testing.assert_allclose(skin.bounds, high - low, atol=1e-4)
    assert skin.triangles == len(mesh.triangles)


def test_obj_and_stl_become_glb_and_anything_else_is_refused():
    name, data = as_glb("person.obj", humanoid_obj())
    assert name == "person.glb" and data[:4] == b"glTF"
    with pytest.raises(SkinRejected):
        read_mesh("notes.txt", b"hello")
    with pytest.raises(SkinRejected):
        read_mesh("broken.obj", b"v 0 0 0\nv 1 0 0\nf 1 2 9\n")
