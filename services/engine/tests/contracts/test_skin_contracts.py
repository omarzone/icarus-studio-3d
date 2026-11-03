import pytest
from pydantic import ValidationError

from icarus.contracts.skins import SkinImport


def test_a_skin_import_defaults_to_a_movable_box_in_the_world():
    upload = SkinImport(name="car.glb", data="Z2xURg==")
    assert (upload.target, upload.collider, upload.mode, upload.length) == ("world", "box", "dynamic", None)


def test_a_skin_import_rejects_unknown_colliders_and_fields():
    with pytest.raises(ValidationError):
        SkinImport.model_validate({"name": "car.glb", "data": "", "collider": "mesh"})
    with pytest.raises(ValidationError):
        SkinImport.model_validate({"name": "car.glb", "data": "", "uri": "https://example.com/car.glb"})
