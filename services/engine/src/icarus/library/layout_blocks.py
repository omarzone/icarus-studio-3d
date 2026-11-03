"""A terrain of block columns with uneven heights, to walk or drive across from west to east."""

import random

from icarus.library.layout_params import BlockTerrain
from icarus.library.layout_site import Site

# Open ground before and after the blocks, where the start and the goal are.
APPROACH = 2.0


def _heights(params: BlockTerrain, rng: random.Random) -> list[list[int]]:
    """Layers per column: each one follows its west and south neighbours by at most one layer up or down."""
    heights: list[list[int]] = []
    for column in range(params.blocks_x):
        row_heights: list[int] = []
        for row in range(params.blocks_y):
            near = [*([heights[column - 1][row]] if column else []), *([row_heights[row - 1]] if row else [])]
            # Diagonal columns differ by two at most, so a height one layer from both neighbours always exists.
            low = max([1, *(value - 1 for value in near)])
            high = min([params.max_layers, *(value + 1 for value in near)])
            row_heights.append(rng.randint(low, high) if near else 1)
        heights.append(row_heights)
    return heights


def block_terrain(params: BlockTerrain, prefix: str) -> Site:
    site = Site(prefix, "Block terrain")
    rng = random.Random(params.seed)
    size = params.block_size
    width, depth = params.blocks_x * size, params.blocks_y * size
    group = site.group("blocks", "Blocks", (APPROACH + width / 2, 0.0))
    highest = 0
    for column, row_heights in enumerate(_heights(params, rng)):
        for row, layers in enumerate(row_heights):
            center = (APPROACH + (column + 0.5) * size, (row + 0.5) * size - depth / 2)
            height = layers * params.layer_height
            site.add("block", group, center, (size, size, height), name=f"Block {column + 1}-{row + 1}", blocks=False)
            highest = max(highest, layers)
    site.start = (0.0, 0.0)
    site.goal, site.goal_name = (2 * APPROACH + width, 0.0), "Past the blocks"
    site.goal_radius = min(1.0, max(depth / 2, 0.5))
    site.notes = {"columns": params.blocks_x * params.blocks_y, "top_height": round(highest * params.layer_height, 3)}
    return site
