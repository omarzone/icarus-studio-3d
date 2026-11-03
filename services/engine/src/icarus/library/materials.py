"""The material palette: each material names how a part looks and what its faces grip like."""

from dataclasses import dataclass

from icarus.contracts.scene import MATERIAL_PRESETS, GeomSurface

# Keeps the part's own surface and finish; every project made before the palette reads as custom.
CUSTOM = "custom"


@dataclass(frozen=True)
class MaterialPreset:
    surface: GeomSurface
    # Sliding friction the part's collider and surface take when the material is picked.
    friction: float


MATERIALS: dict[str, MaterialPreset] = {
    "plastic": MaterialPreset("plastic", 0.6),
    "smooth_plastic": MaterialPreset("plastic", 0.5),
    "wood": MaterialPreset("wood", 0.7),
    "wood_planks": MaterialPreset("wood", 0.7),
    "brick": MaterialPreset("stone", 0.9),
    "cobblestone": MaterialPreset("stone", 0.85),
    "concrete": MaterialPreset("concrete", 0.9),
    "metal": MaterialPreset("metal", 0.5),
    "diamond_plate": MaterialPreset("metal", 0.8),
    "corroded_metal": MaterialPreset("metal", 0.7),
    "grass": MaterialPreset("grass", 0.6),
    "sand": MaterialPreset("sand", 0.45),
    "ground": MaterialPreset("dirt", 0.75),
    "ice": MaterialPreset("ice", 0.05),
    "glass": MaterialPreset("glass", 0.4),
    "neon": MaterialPreset("plastic", 0.5),
    "marble": MaterialPreset("stone", 0.55),
    "granite": MaterialPreset("stone", 0.85),
    "fabric": MaterialPreset("fabric", 0.8),
    "foil": MaterialPreset("metal", 0.4),
}

assert list(MATERIALS) == MATERIAL_PRESETS, "every palette material needs a surface and a friction"

MATERIAL_OPTIONS = [CUSTOM, *MATERIAL_PRESETS]
# Ice must stay slippery under grippy tires: MuJoCo takes the larger friction of two touching geoms unless one wins.
SLIPPERY = frozenset({"ice"})

MATERIAL_HINT = (
    "Picks the look and the grip together: picking one also sets Surface and the Friction of the object's Collider "
    "and Surface. Ice stays slippery under anything; Sand, Grass, Ground and Fabric grip less or more than plain "
    "plastic; Glass is see-through and Neon glows. Custom keeps Surface and Finish as they are"
)
