import pytest
from pydantic import ValidationError

from icarus.contracts.library import PieceInfo
from icarus.contracts.objects import ObjectSpec
from icarus.contracts.scene import SceneGeom

GEOM = {
    "name": "facade",
    "body": "world",
    "shape": "box",
    "size": (10.0, 10.0, 18.0),
    "position": (0.0, 0.0, 9.0),
    "quaternion": (1.0, 0.0, 0.0, 0.0),
    "color": "#a8a29e",
}


def _piece(**extra: object) -> dict[str, object]:
    obj = ObjectSpec(id="x", name="X", parent=None, components=[]).model_dump()
    return {"id": "x", "label": "X", "icon": "box", "description": "", "object": obj, **extra}


def test_a_geom_with_a_finish_and_glow_round_trips_through_json():
    geom = SceneGeom.model_validate(
        {**GEOM, "style": "building", "finish": "brick", "roughness": 0.8, "metalness": 0.1, "emissive": 0.6}
    )
    assert SceneGeom.model_validate_json(geom.model_dump_json()) == geom


def test_geoms_exported_before_finishes_keep_their_look():
    geom = SceneGeom.model_validate(GEOM)
    assert (geom.finish, geom.roughness, geom.metalness, geom.emissive) == (None, 0.5, 0.5, 0)


def test_unknown_finishes_and_categories_are_rejected():
    with pytest.raises(ValidationError):
        SceneGeom.model_validate({**GEOM, "finish": "marble"})
    with pytest.raises(ValidationError):
        PieceInfo.model_validate(_piece(category="space"))


def test_pieces_sent_before_categories_land_in_basics():
    assert PieceInfo.model_validate(_piece()).category == "basics"


def test_a_geom_with_a_skin_round_trips_and_older_geoms_have_none():
    skin = {"project": "0123456789ab", "asset": "sk0123456789abcdef", "fill": 0.9, "rotation": (0.0, 0.0, 90.0)}
    geom = SceneGeom.model_validate({**GEOM, "skin": skin})
    assert SceneGeom.model_validate_json(geom.model_dump_json()) == geom
    assert SceneGeom.model_validate(GEOM).skin is None
    with pytest.raises(ValidationError):
        SceneGeom.model_validate({**GEOM, "skin": {**skin, "url": "https://example.com/car.glb"}})
