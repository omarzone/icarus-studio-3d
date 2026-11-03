"""Corrections a reference comparison asks for, applied to the scene plan so the next assembly carries them."""

from icarus.copilot.building.part_plan import CompoundObject, CompoundPart
from icarus.copilot.building.scene_plan import (
    AddObject,
    AddPiece,
    Correction,
    Move,
    Remove,
    Resize,
    Restyle,
    ScenePiece,
    ScenePlan,
    SetLook,
    piece_size,
)


def _ids(plan: ScenePlan) -> set[str]:
    return {item.id for item in [*plan.pieces, *plan.objects, *plan.lamps]}


def _scaled(compound: CompoundObject, factor: float) -> CompoundObject:
    """The object grown uniformly: sizes, offsets and joint anchors by the factor, masses by its cube."""

    def grow(part: CompoundPart) -> CompoundPart:
        joint = part.joint
        if joint is not None:
            joint = joint.model_copy(update={"anchor": tuple(value * factor for value in joint.anchor)})
        return part.model_copy(
            update={
                "size": tuple(value * factor for value in part.size),
                "position": tuple(value * factor for value in part.position),
                "mass": part.mass * factor**3 if part.mass is not None else None,
                "joint": joint,
            }
        )

    return compound.model_copy(update={"parts": [grow(part) for part in compound.parts]})


def _restyled(compound: CompoundObject, change: Restyle) -> CompoundObject | str:
    if change.part and all(part.id != change.part for part in compound.parts):
        return f"{compound.name} has no part `{change.part}`"
    fields = {"color", "finish", "roughness", "metalness", "emissive"}
    update = {key: value for key, value in change.model_dump(include=fields).items() if value is not None}
    parts = [
        part.model_copy(update={"look": part.look.model_copy(update=update)})
        if change.part in (None, part.id)
        else part
        for part in compound.parts
    ]
    return compound.model_copy(update={"parts": parts})


def _piece(piece: ScenePiece, change: Correction) -> ScenePiece | str:
    match change:
        case Move(position=(x, y, lift), heading_deg=heading):
            update = {"position": (x, y), "lift_m": max(lift, 0.0)}
            return piece.model_copy(update=update | ({"heading_deg": heading} if heading is not None else {}))
        case Resize(factor=factor):
            size = piece_size(piece)
            if size is None:
                return f"{piece.name}: there is no library piece `{piece.piece}`"
            return piece.model_copy(update={"size": tuple(value * factor for value in size)})
        case Restyle(color=color, finish=finish):
            update = {key: value for key, value in (("color", color), ("finish", finish)) if value is not None}
            return piece.model_copy(update=update)
    return f"{piece.name} cannot take {change.action}"


def _compound(compound: CompoundObject, change: Correction) -> CompoundObject | str:
    match change:
        case Move(position=position, heading_deg=heading):
            update = {"position": position} | ({"heading_deg": heading} if heading is not None else {})
            return compound.model_copy(update=update)
        case Resize(factor=factor):
            return _scaled(compound, factor)
        case Restyle():
            return _restyled(compound, change)
    return f"{compound.name} cannot take {change.action}"


def _edit_item(plan: ScenePlan, change: Move | Resize | Restyle) -> ScenePlan | str:
    for index, piece in enumerate(plan.pieces):
        if piece.id == change.item:
            edited = _piece(piece, change)
            if isinstance(edited, str):
                return edited
            return plan.model_copy(update={"pieces": [*plan.pieces[:index], edited, *plan.pieces[index + 1 :]]})
    for index, compound in enumerate(plan.objects):
        if compound.id == change.item:
            changed = _compound(compound, change)
            if isinstance(changed, str):
                return changed
            return plan.model_copy(update={"objects": [*plan.objects[:index], changed, *plan.objects[index + 1 :]]})
    for index, lamp in enumerate(plan.lamps):
        if lamp.id == change.item and isinstance(change, Move):
            moved = lamp.model_copy(update={"position": change.position})
            return plan.model_copy(update={"lamps": [*plan.lamps[:index], moved, *plan.lamps[index + 1 :]]})
    return f"there is no item `{change.item}` that can take {change.action}"


def _without_part(plan: ScenePlan, item: str, part: str) -> ScenePlan | str:
    """The plan with one part of an object gone, and every part that hangs from it."""
    index = next((number for number, compound in enumerate(plan.objects) if compound.id == item), None)
    if index is None:
        return f"there is no object `{item}` to remove a part from"
    compound = plan.objects[index]
    gone = {part}
    if part not in {member.id for member in compound.parts}:
        return f"{compound.name} has no part `{part}`"
    grew = True
    while grew:
        hanging = {member.id for member in compound.parts if member.parent in gone} - gone
        gone |= hanging
        grew = bool(hanging)
    kept = [member for member in compound.parts if member.id not in gone]
    if not kept:
        return f"removing `{part}` would leave {compound.name} empty; remove the whole item instead"
    changed = compound.model_copy(update={"parts": kept})
    return plan.model_copy(update={"objects": [*plan.objects[:index], changed, *plan.objects[index + 1 :]]})


def corrected(plan: ScenePlan, change: Correction) -> ScenePlan | str:
    """The plan with one correction applied, or why it cannot be."""
    match change:
        case Move() | Resize() | Restyle():
            return _edit_item(plan, change)
        case Remove(item=item, part=str(part)):
            return _without_part(plan, item, part)
        case Remove(item=item):
            if item not in _ids(plan):
                return f"there is no item `{item}` to remove"
            return plan.model_copy(
                update={
                    "pieces": [piece for piece in plan.pieces if piece.id != item],
                    "objects": [compound for compound in plan.objects if compound.id != item],
                    "lamps": [lamp for lamp in plan.lamps if lamp.id != item],
                }
            )
        case AddPiece(piece=piece):
            if piece.id in _ids(plan):
                return f"an item `{piece.id}` already exists"
            return plan.model_copy(update={"pieces": [*plan.pieces, piece]})
        case AddObject(object=compound):
            if compound.id in _ids(plan):
                return f"an item `{compound.id}` already exists"
            return plan.model_copy(update={"objects": [*plan.objects, compound]})
        case SetLook():
            update = {key: getattr(change, key) for key in ("ground", "sky", "sun", "camera")}
            return plan.model_copy(update={key: value for key, value in update.items() if value is not None})


def apply_corrections(plan: ScenePlan, changes: list[Correction]) -> tuple[ScenePlan, list[str], list[str]]:
    """The corrected plan, what each applied correction did, and why the others were refused."""
    applied: list[str] = []
    refused: list[str] = []
    for change in changes:
        result = corrected(plan, change)
        if isinstance(result, str):
            refused.append(result)
            continue
        plan = result
        target = getattr(change, "item", None)
        applied.append(f"{change.action} {target}" if target else change.action)
    return plan, applied, refused
