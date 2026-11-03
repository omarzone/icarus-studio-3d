"""What each layout recipe can be asked for, with ranges and defaults: the model fills them, Pydantic checks."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

LayoutRecipe = Literal[
    "parking_lot",
    "room",
    "maze",
    "city_block",
    "warehouse",
    "forest",
    "obstacle_course",
    "terrain_steps",
    "block_terrain",
]
Side = Literal["west", "east", "south", "north"]
MAX_BLOCK_COLUMNS = 400
Cell = tuple[int, int]


def knob(default: Any, low: float, high: float, text: str) -> Any:
    return Field(default, ge=low, le=high, description=f"{text} Default {default}.")


def switch(default: bool, text: str) -> Any:
    return Field(default, description=f"{text} Default {str(default).lower()}.")


class _Layout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seed: int = knob(0, 0, 99_999, "Same seed, same layout; change it for another arrangement.")
    spawn: bool = switch(True, "Put the spawn point at the layout's start.")
    goal: bool = switch(True, "Put the goal zone at the layout's goal.")
    clearance: float = knob(
        1.0, 0.2, 3, "Half the width of what must pass, in metres: the path from start to goal keeps this room."
    )


class ParkingLot(_Layout):
    recipe: Literal["parking_lot"]
    rows: int = knob(2, 1, 4, "Rows of bays; two rows share each aisle, back-to-back rows share a median.")
    bays_per_row: int = knob(8, 2, 16, "Bays in each row.")
    bay_width: float = knob(2.7, 2.3, 3.5, "Bay width in metres.")
    bay_depth: float = knob(5.5, 4.5, 6.5, "Bay depth in metres.")
    aisle_width: float = knob(6.5, 5, 9, "Driving aisle width in metres.")
    occupancy: float = knob(0.6, 0, 1, "Share of the bays not kept free that hold a parked car.")
    free_bays: list[int] = Field(
        default=[], max_length=64, description="Bay numbers (1 is the first bay of the first row) kept empty."
    )
    goal_bay: int | None = Field(
        default=None, ge=1, description="The bay the goal sits in, always kept empty; none picks one by the seed."
    )
    entry_length: float = knob(8.0, 4, 20, "Length of the entry lane before the lot, where the start is.")
    lamps: bool = switch(True, "Lamp posts along the curbs; with surroundings, street lights with arms over the lot.")
    lamp_spacing: float = knob(15.0, 8, 30, "Metres between lamp posts.")
    buildings: bool = switch(True, "Buildings along the far side.")
    trees: bool = switch(True, "Trees around the lot; with surroundings, on the grass strips.")
    surroundings: bool = switch(
        True,
        "The lot's surroundings: ground around it instead of bare floor, raised sidewalks, the streets, gates, paint "
        "and street furniture below; off lays out the bare lot.",
    )
    ground: Literal["grass", "concrete"] = Field(
        default="grass", description="What covers the ground around the lot, drawing only. Default grass."
    )
    streets: int = knob(
        2,
        0,
        2,
        "Streets beside the lot: 1 along the west side where the entry lane meets it, 2 adds one along the south side.",
    )
    street_width: float = knob(8.0, 6, 14, "Street width in metres, both lanes.")
    sidewalk_width: float = knob(2.5, 1.5, 4, "Width of the raised sidewalks around the lot in metres.")
    gates: bool = switch(True, "Barrier gates with raised booms on both sides of the entry lane.")
    paint: bool = switch(True, "P marks painted in the aisle and an arrow on the entry lane.")
    vehicles: Literal["mixed", "cars"] = Field(
        default="mixed",
        description="Parked vehicles: mixed adds pickups, SUVs and hatchbacks among the cars. Default mixed.",
    )

    @model_validator(mode="after")
    def _bays_exist(self) -> "ParkingLot":
        count = self.rows * self.bays_per_row
        wrong = [bay for bay in [*self.free_bays, *([self.goal_bay] if self.goal_bay else [])] if not 1 <= bay <= count]
        if wrong:
            raise ValueError(f"bays are numbered 1 to {count}; {wrong} do not exist")
        return self


class Room(_Layout):
    recipe: Literal["room"]
    width: float = knob(10.0, 4, 30, "Inside size along x in metres.")
    depth: float = knob(8.0, 4, 30, "Inside size along y in metres.")
    wall_height: float = knob(2.5, 1, 4, "Wall height in metres.")
    doorways: list[Side] = Field(
        default=["west", "east"],
        max_length=4,
        description="Walls with a doorway; the start is inside the first, the goal inside the last.",
    )
    door_width: float = knob(1.6, 1, 4, "Doorway width in metres.")
    furniture: float = knob(0.4, 0, 1, "How furnished the room is, from empty to full.")
    floor: Literal["wood", "concrete", "rubber"] = Field(default="wood", description="Floor surface. Default wood.")


class Maze(_Layout):
    recipe: Literal["maze"]
    cells_x: int = knob(6, 1, 15, "Cells along x.")
    cells_y: int = knob(6, 1, 15, "Cells along y; one row of cells is a plain corridor.")
    cell_size: float = knob(3.0, 1, 6, "Cell size in metres, wall to wall.")
    wall_height: float = knob(1.2, 0.3, 3, "Wall height in metres.")
    loops: float = knob(0.1, 0, 1, "Share of inner walls removed after carving, which opens more than one way.")
    start_cell: Cell | None = Field(default=None, description="Start cell (x, y) from 0; none is the first corner.")
    goal_cell: Cell | None = Field(default=None, description="Goal cell (x, y) from 0; none is the far corner.")

    @model_validator(mode="after")
    def _cells_exist(self) -> "Maze":
        for cell in (self.start_cell, self.goal_cell):
            if cell and not (0 <= cell[0] < self.cells_x and 0 <= cell[1] < self.cells_y):
                raise ValueError(f"cell {cell} is outside a maze of {self.cells_x} by {self.cells_y} cells")
        return self


class CityBlock(_Layout):
    recipe: Literal["city_block"]
    blocks_x: int = knob(2, 1, 4, "Blocks along x.")
    blocks_y: int = knob(2, 1, 4, "Blocks along y.")
    block_size: float = knob(24.0, 12, 50, "Block size in metres, curb to curb.")
    street_width: float = knob(8.0, 6, 16, "Street width in metres.")
    sidewalk_width: float = knob(2.5, 1.5, 4, "Sidewalk width in metres.")
    min_height: float = knob(6.0, 3, 40, "Lowest building in metres.")
    max_height: float = knob(24.0, 3, 60, "Tallest building in metres.")
    buildings_per_side: int = knob(2, 1, 4, "Buildings along each side of a block.")
    lamps: bool = switch(True, "Street lights with arms over the street at the block corners.")
    trees: bool = switch(True, "Trees along the sidewalks.")
    crossings: bool = switch(True, "Zebra crossings at the intersections.")
    furniture: bool = switch(True, "Litter bins and fire hydrants on the sidewalks.")
    goal_intersection: Cell | None = Field(
        default=None,
        description="Goal intersection (x, y) from 0; the start is intersection (0, 0); none is the far one.",
    )

    @model_validator(mode="after")
    def _sensible(self) -> "CityBlock":
        if self.min_height > self.max_height:
            raise ValueError("min_height is above max_height")
        cell = self.goal_intersection
        if cell and not (0 <= cell[0] <= self.blocks_x and 0 <= cell[1] <= self.blocks_y):
            raise ValueError(f"intersections run from (0, 0) to ({self.blocks_x}, {self.blocks_y})")
        return self


class Warehouse(_Layout):
    recipe: Literal["warehouse"]
    width: float = knob(30.0, 12, 60, "Inside size along x in metres.")
    depth: float = knob(20.0, 10, 50, "Inside size along y in metres.")
    wall_height: float = knob(5.0, 3, 8, "Wall height in metres.")
    shelf_rows: int = knob(4, 1, 12, "Rows of shelving, running along x.")
    aisle_width: float = knob(3.0, 2, 6, "Aisle width between shelving rows in metres.")
    shelf_height: float = knob(3.0, 1, 6, "Shelving height in metres.")
    crates: float = knob(0.3, 0, 1, "How many crates stand in the aisles, from none to many.")
    door_width: float = knob(4.0, 2, 8, "Loading door width in the west wall, where the start is.")
    goal_aisle: int | None = Field(
        default=None, ge=1, description="Aisle (1 is the southmost) whose far end holds the goal; none picks by seed."
    )


class Forest(_Layout):
    recipe: Literal["forest"]
    size_x: float = knob(40.0, 15, 80, "Size along x in metres; the path crosses it from west to east.")
    size_y: float = knob(30.0, 10, 60, "Size along y in metres.")
    trees: float = knob(0.5, 0, 1, "Tree density.")
    rocks: float = knob(0.3, 0, 1, "Rock density.")
    path_width: float = knob(3.0, 1.5, 6, "Width of the clear path in metres.")
    bends: int = knob(2, 0, 4, "Bends in the path.")
    park: bool = switch(False, "A park instead of a forest: grass, fewer trees, benches and lamps along the path.")


class ObstacleCourse(_Layout):
    recipe: Literal["obstacle_course"]
    length: float = knob(40.0, 15, 100, "Track length in metres along x.")
    lanes: int = knob(1, 1, 4, "Lanes side by side; the start and goal are in the first.")
    lane_width: float = knob(3.0, 2, 6, "Lane width in metres.")
    barriers: float = knob(0.5, 0, 1, "How many barriers stand in each lane, alternating sides.")
    side_height: float = knob(0.5, 0.2, 1.5, "Height of the walls along the lanes.")
    ramps: bool = switch(False, "Humps to climb across the lanes (touching them counts as a contact).")
    ramp_height: float = knob(0.2, 0.05, 0.5, "Hump height in metres.")


class TerrainSteps(_Layout):
    recipe: Literal["terrain_steps"]
    steps: int = knob(5, 1, 12, "Steps up to the top platform.")
    step_height: float = knob(0.15, 0.03, 0.5, "Rise of each step in metres.")
    step_depth: float = knob(1.0, 0.3, 3, "Depth of each step in metres.")
    width: float = knob(3.0, 1, 10, "Width of the steps in metres.")
    platform_length: float = knob(3.0, 1, 10, "Length of the top platform in metres.")
    gap: float = knob(0.0, 0, 1, "Gap between steps in metres; above zero they become separate platforms.")
    descend: bool = switch(True, "Steps back down after the platform; otherwise the goal is on top.")
    rails: bool = switch(True, "Low walls along both sides.")


class BlockTerrain(_Layout):
    recipe: Literal["block_terrain"]
    blocks_x: int = knob(12, 2, 30, "Columns of blocks along x; the start is west of them and the goal east.")
    blocks_y: int = knob(6, 1, 30, "Columns of blocks along y.")
    block_size: float = knob(1.0, 0.25, 4, "Side of each block in metres.")
    layer_height: float = knob(0.1, 0.02, 1, "Height of one layer of blocks in metres.")
    max_layers: int = knob(3, 1, 10, "Most layers in one column; neighbours differ by at most one layer.")

    @model_validator(mode="after")
    def _not_too_many(self) -> "BlockTerrain":
        if self.blocks_x * self.blocks_y > MAX_BLOCK_COLUMNS:
            raise ValueError(f"at most {MAX_BLOCK_COLUMNS} columns of blocks fit one layout")
        return self


AnyLayout = ParkingLot | Room | Maze | CityBlock | Warehouse | Forest | ObstacleCourse | TerrainSteps | BlockTerrain
LayoutParams = Annotated[AnyLayout, Field(discriminator="recipe")]
