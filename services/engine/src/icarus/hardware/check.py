"""A body's needs checked against a hardware kit: pass, warn or fail per joint and sensor, with the gap in words."""

from dataclasses import dataclass

from icarus.contracts.build import (
    HardwareCheck,
    HardwareKitInfo,
    HardwarePart,
    HardwareProblem,
    HardwareRow,
    HardwareStatus,
    HardwareVerdict,
)
from icarus.hardware.demands import BodyNeeds, MotorNeed, SensorNeed
from icarus.library.hardware import ACTUATORS, KITS, SENSORS, ActuatorClass, ActuatorSlot, HardwareKit, SensorSlot

# Share of a part's rating a need may use and still pass: the rest covers friction, battery sag and heat.
MARGIN = 0.8
# A distance sensor that reaches this share of the simulated ray only warns: far readings read as nothing.
RANGE_WARN = 1.5


@dataclass(frozen=True)
class _Measure:
    need: float
    limit: float
    unit: str
    what: str

    @property
    def ratio(self) -> float:
        return self.need / self.limit if self.limit > 0 else float("inf")


def _status(ratio: float) -> HardwareStatus:
    return "pass" if ratio <= MARGIN else "warn" if ratio <= 1.0 else "fail"


def _number(value: float) -> str:
    return f"{value:.2f}" if value < 10 else f"{value:.0f}"


def _measures(need: MotorNeed, part: ActuatorClass) -> list[_Measure]:
    rotary = part.motion == "rotary"
    measures = [_Measure(need.effort, part.effort, "N·m" if rotary else "N", "torque" if rotary else "force")]
    if need.speed is not None:
        measures.append(_Measure(need.speed, part.speed, "rad/s" if rotary else "m/s", "speed"))
    if need.travel is not None and part.travel is not None:
        measures.append(_Measure(need.travel, part.travel, "°" if rotary else "m", "travel"))
    elif need.travel is None and part.travel is not None and need.role != "steering":
        measures.append(_Measure(float("inf"), part.travel, "°" if rotary else "m", "travel"))
    return measures


def _motor_gap(measures: list[_Measure], part: ActuatorClass, measured: bool, joints: int) -> str:
    source = "measured with the trained brain" if measured else "the design's limit"
    worst = max(measures, key=lambda item: item.ratio)
    shared = f" for {joints} joints together" if joints > 1 else ""
    if worst.need == float("inf"):
        return f"The joint turns without end, but a {part.name} only travels {_number(worst.limit)}{worst.unit}."
    text = (
        f"Needs {_number(worst.need)} {worst.unit} of {worst.what}{shared} ({source}); a {part.name} gives "
        f"{_number(worst.limit)} {worst.unit}"
    )
    status = _status(worst.ratio)
    if status == "fail":
        return f"{text}, {worst.ratio:.1f}× short."
    if status == "warn":
        return f"{text}: under the {int(MARGIN * 100)}% margin real motors need for friction, battery sag and heat."
    return f"{text}, {worst.ratio:.0%} of it, inside the margin the simulation does not model."


def _missing(id: str, part: str, kind: str, role: str, reason: str) -> HardwareRow:
    return HardwareRow(
        id=id,
        part=part,
        kind="joint" if kind == "joint" else "sensor",
        role=role,
        hardware=None,
        need=None,
        limit=None,
        unit="",
        fraction=0,
        status="fail",
        measured=False,
        gap=reason,
    )


def _motor_row(id: str, label: str, needs: list[MotorNeed], slot: ActuatorSlot) -> HardwareRow:
    part = ACTUATORS[slot.part]
    effort = sum(need.effort for need in needs)
    speeds = [need.speed for need in needs if need.speed is not None]
    travels = [need.travel for need in needs]
    combined = MotorNeed(
        id,
        needs[0].joint,
        label,
        needs[0].role,
        effort,
        max(speeds) if speeds else None,
        None if None in travels else max(travel for travel in travels if travel is not None),
        all(need.measured for need in needs),
    )
    measures = _measures(combined, part)
    worst = max(measures, key=lambda item: item.ratio)
    finite = worst.need != float("inf")
    return HardwareRow(
        id=id,
        part=label,
        kind="joint",
        role=combined.role,
        hardware=part.name,
        need=worst.need if finite else None,
        limit=worst.limit,
        unit=worst.unit,
        fraction=min(worst.ratio, 2.0) if finite else 0,
        status=_status(worst.ratio),
        measured=combined.measured,
        gap=_motor_gap(measures, part, combined.measured, len(needs)),
    )


def _motor_rows(motors: list[MotorNeed], kit: HardwareKit) -> list[HardwareRow]:
    rows: list[HardwareRow] = []
    for role in dict.fromkeys(need.role for need in motors):
        needs = [need for need in motors if need.role == role]
        slot = next((slot for slot in kit.actuators if slot.role == role), None)
        if slot is None:
            rows += [_missing(n.id, n.part, "joint", role, f"This kit has no part for {role} joints.") for n in needs]
            continue
        if slot.shared:
            label = ", ".join(need.part for need in needs) if len(needs) > 1 else needs[0].part
            rows.append(_motor_row(f"{role}:shared", label, needs, slot))
            continue
        for number, need in enumerate(needs):
            if number < slot.count:
                rows.append(_motor_row(need.id, need.part, [need], slot))
            else:
                reason = f"The kit has {slot.count} {role} parts; this body needs {len(needs)}."
                rows.append(_missing(need.id, need.part, "joint", role, reason))
    return rows


def _sensor_row(need: SensorNeed, slot: SensorSlot) -> HardwareRow:
    part = SENSORS[slot.part]
    if need.range_m is None or part.range_m is None:
        gap = f"A {part.name} covers it; its noise and delay differ from the simulation's exact readings."
        return HardwareRow(
            id=need.id,
            part=need.part,
            kind="sensor",
            role=slot.role,
            hardware=part.name,
            need=None,
            limit=None,
            unit="",
            fraction=0,
            status="pass",
            measured=False,
            gap=gap,
        )
    ratio = need.range_m / part.range_m
    status: HardwareStatus = "pass" if ratio <= 1 else "warn" if ratio <= RANGE_WARN else "fail"
    gap = f"The simulated ray reaches {_number(need.range_m)} m and a {part.name} {_number(part.range_m)} m" + (
        ": inside its range." if status == "pass" else ": objects beyond its range read as nothing."
    )
    return HardwareRow(
        id=need.id,
        part=need.part,
        kind="sensor",
        role=slot.role,
        hardware=part.name,
        need=need.range_m,
        limit=part.range_m,
        unit="m",
        fraction=min(ratio, 2.0),
        status=status,
        measured=False,
        gap=gap,
    )


VIRTUAL_GAP = (
    "The simulator gives the brain this exactly; no kit part measures it. On the device it must come from odometry "
    "or localization (wheel encoders, a camera, a beacon), with errors the brain never trained with."
)


def _sensor_rows(sensors: list[SensorNeed], kit: HardwareKit) -> list[HardwareRow]:
    rows: list[HardwareRow] = []
    used: dict[str, int] = {}
    for need in sensors:
        if need.virtual or need.role is None:
            rows.append(
                HardwareRow(
                    id=need.id,
                    part=need.part,
                    kind="sensor",
                    role="estimate",
                    hardware=None,
                    need=None,
                    limit=None,
                    unit="",
                    fraction=0,
                    status="warn",
                    measured=False,
                    gap=VIRTUAL_GAP,
                )
            )
            continue
        slot = next((slot for slot in kit.sensors if slot.role == need.role), None)
        if slot is None:
            rows.append(_missing(need.id, need.part, "sensor", need.role, f"This kit has no {need.role} sensor."))
            continue
        used[need.role] = used.get(need.role, 0) + 1
        if used[need.role] > slot.count:
            reason = f"The kit has {slot.count} {need.role} sensors; this body has more."
            rows.append(_missing(need.id, need.part, "sensor", need.role, reason))
            continue
        rows.append(_sensor_row(need, slot))
    return rows


def _verdict(rows: list[HardwareRow]) -> HardwareVerdict:
    statuses = {row.status for row in rows}
    return "fail" if "fail" in statuses else "warn" if "warn" in statuses else "pass"


FIXES = {
    "estimate": "Plan how the device will estimate it, or skip it once you have.",
    "missing": "Check against another kit, or skip it if the device will not need this part.",
    "short": "Check against a kit with stronger parts, or lower this motor's Max force in Body and train again.",
    "range": "Shorten the ray's Range in Body and train again, or skip it to accept the shorter reach.",
}


def _problem(rows: list[HardwareRow]) -> HardwareProblem | None:
    for status in ("fail", "warn"):
        row = next((row for row in rows if row.status == status), None)
        if row is None:
            continue
        if row.role == "estimate":
            fix = FIXES["estimate"]
        elif row.hardware is None:
            fix = FIXES["missing"]
        else:
            fix = FIXES["range" if row.kind == "sensor" else "short"]
        title = f"{row.part} does not fit this kit." if status == "fail" else f"{row.part} needs attention."
        return HardwareProblem(title=title, fix=f"{row.gap} {fix}")
    return None


def _parts(kit: HardwareKit, rows: list[HardwareRow]) -> list[HardwarePart]:
    parts: list[HardwarePart] = []
    for slot in [*kit.actuators, *kit.sensors]:
        name = ACTUATORS[slot.part].name if slot.part in ACTUATORS else SENSORS[slot.part].name
        used = sum(1 for row in rows if row.hardware == name and row.role == slot.role)
        if used == 0:
            continue
        count = slot.count if isinstance(slot, ActuatorSlot) and slot.shared else used
        usd = ACTUATORS[slot.part].usd if slot.part in ACTUATORS else SENSORS[slot.part].usd
        parts.append(HardwarePart(name=name, count=count, usd=usd))
    return parts + [HardwarePart(name=extra.name, count=extra.count, usd=extra.usd) for extra in kit.extras]


def _safety(needs: BodyNeeds) -> list[str]:
    rules = []
    if needs.top_speed is not None:
        rules.append(f"Limit top speed to {needs.top_speed / 2:.1f} m/s for the first runs")
    rules += [
        "Start at half torque: the simulation has no backlash, battery sag or motor heat",
        "Keep a stop switch in reach; Icarus does not drive the device itself",
    ]
    if needs.measured_from is None:
        rules.append("No trained brain was measured: needs are the design's limits")
    return rules


def kit_info(kit: HardwareKit) -> HardwareKitInfo:
    return HardwareKitInfo(id=kit.id, name=kit.name, board=kit.board)


def check_rows(needs: BodyNeeds, kit: HardwareKit, skipped: frozenset[str] = frozenset()) -> list[HardwareRow]:
    rows = _motor_rows(needs.motors, kit) + _sensor_rows(needs.sensors, kit)
    return [row.model_copy(update={"status": "skipped"}) if row.id in skipped else row for row in rows]


def best_kit(needs: BodyNeeds) -> HardwareKit:
    """The kit with the fewest failing then warning rows, then the cheapest."""

    def score(kit: HardwareKit) -> tuple[int, int, float]:
        rows = check_rows(needs, kit)
        cost = sum(part.usd * part.count for part in _parts(kit, rows))
        return (sum(row.status == "fail" for row in rows), sum(row.status == "warn" for row in rows), cost)

    return min(KITS.values(), key=score)


def check_hardware(
    project_id: str, revision: int, needs: BodyNeeds, kit: HardwareKit | None, skipped: frozenset[str]
) -> HardwareCheck:
    chosen = kit or best_kit(needs)
    rows = check_rows(needs, chosen, skipped)
    return HardwareCheck(
        project_id=project_id,
        revision=revision,
        kit=kit_info(chosen),
        kits=[kit_info(item) for item in KITS.values()],
        rows=rows,
        verdict=_verdict(rows),
        problem=_problem(rows),
        parts=_parts(chosen, rows),
        safety=_safety(needs),
        measured_from=needs.measured_from,
    )
