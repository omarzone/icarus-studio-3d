"""Copilot tools for bodies and motion: rig an attached mesh into a body, fix what the rig audit finds and make the
project imitate its tracked clip. Each one only tries operations; propose or apply lands them like any change."""

from typing import Literal

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.trying import LookSpec, run_try
from icarus.copilot.attachments import UnknownAttachment
from icarus.copilot.step_words import step_said
from icarus.design.checks import design_report
from icarus.design.rig_audit import rig_findings
from icarus.motion.comparison import compare
from icarus.motion.imitation import imitation_operations
from icarus.motion.retarget import NotRetargetable, build_reference
from icarus.projects.auto_rig import AutoRigRefused, build_rig
from icarus.projects.skin_files import SkinRejected

FOCUS_SECONDS = 1.0


class AutoRigArgs(ToolArgs):
    attachment: str = Field(description="Id of a 3D model the person attached: OBJ, STL, glTF or GLB.")
    height_m: float | None = Field(default=None, ge=0.2, le=5, description="Standing height; none keeps the model's.")


def _auto_rig(scope: TurnScope, args: AutoRigArgs) -> Observation:
    def refused(reason: str) -> Observation:
        return Observation(reason, ok=False, summary=step_said("rig_refused", scope.language, reason=reason))

    skins = scope.services.skins
    if skins is None:
        return refused("models cannot be stored in this conversation")
    try:
        attachment = scope.services.attachments.of_project(scope.project_id, [args.attachment])[0]
    except UnknownAttachment:
        return refused(f"there is no attachment {args.attachment!r} in this project")
    if attachment.info.kind != "model":
        return refused(f"{attachment.info.name} is not a 3D model")
    try:
        build = build_rig(scope.state.project, skins, attachment.info.name, attachment.content(), args.height_m)
    except (SkinRejected, AutoRigRefused) as error:
        return refused(str(error))
    shape = "a humanoid" if build.humanoid else "one rigid part, since it found no separate legs"
    scope.sources.append(f"auto-rig of {attachment.info.name}: {build.parts} parts")
    look = LookSpec(target=build.body_id) if scope.can_see and scope.services.views is not None else None
    tried = run_try(scope, build.operations, look)
    note = (
        f"The fit read {attachment.info.name} as {shape} with {build.parts} parts; the body replaces the project's "
        "own when applied, each part wearing its piece of the mesh (look only)."
    )
    return Observation(
        f"{note}\n{tried.text}", ok=tried.ok, image=tried.image, image_label=tried.image_label, summary=tried.summary
    )


AUTO_RIG = Tool(
    name="auto_rig",
    description=(
        "Turn a 3D model the person attached (OBJ, STL, glTF or GLB of a standing figure) into the project's body: "
        "a geometric fit finds two legs, the torso and where the arms reach, places a humanoid's joints and motors "
        "sized from the mesh and binds each part to its piece of the mesh for drawing. A mesh without two separate "
        "legs becomes one rigid part. It returns a try of the operations; propose or apply it."
    ),
    args=AutoRigArgs,
    step="try",
    effect="read",
    run=_auto_rig,
    per_turn=2,
    timeout_s=90,
)


class FixBodyArgs(ToolArgs):
    pass


def _fix_body(scope: TurnScope, args: FixBodyArgs) -> Observation:
    report, compiled = design_report(scope.state.project)
    if compiled is None:
        failed = "; ".join(check.detail for check in report.checks if check.status == "fail")
        return Observation(f"The design tests fail before the audit can run: {failed}", ok=False)
    findings = [item for item in rig_findings(scope.state.project, compiled) if item.fix]
    if not findings:
        return Observation("The rig audit found nothing to fix.", summary=step_said("body_fine", scope.language))
    listed = "\n".join(f"- {item.text}" for item in findings)
    tried = run_try(scope, [operation for item in findings for operation in item.fix], None)
    return Observation(f"The rig audit found:\n{listed}\n{tried.text}", ok=tried.ok, summary=tried.summary)


FIX_BODY = Tool(
    name="fix_body",
    description=(
        "Run the design tests and the rig audit on the body (joints without a motor, motors too weak to lift their "
        "limb, a legged body without a balance sense, feet without touch) and try the fixes as one change; propose "
        "or apply the passing try."
    ),
    args=FixBodyArgs,
    step="try",
    effect="read",
    run=_fix_body,
    per_turn=2,
    timeout_s=60,
)


class ImitateArgs(ToolArgs):
    focus: Literal["even", "weakest"] = Field(
        default="even", description="weakest makes more tries start at the clip's worst moment of the latest run."
    )


def _imitate(scope: TurnScope, args: ImitateArgs) -> Observation:
    def refused(reason: str) -> Observation:
        return Observation(reason, ok=False, summary=step_said("imitate_refused", scope.language, reason=reason))

    clips = scope.services.clips
    clip = clips.latest(scope.project_id) if clips is not None else None
    if clip is None:
        return refused("the project has no reference video; the person brings one in the Motion workspace")
    focus = None
    if args.focus == "weakest" and (compared := compare(scope.services.runs, scope.project_id, clip.id)) is not None:
        share = FOCUS_SECONDS * clip.video.fps / max(len(clip.frames), 1)
        focus = (compared.weakest, min(1.0, compared.weakest + share))
    try:
        reference = build_reference(scope.state.project, clip, focus)
    except NotRetargetable as error:
        return refused(str(error))
    operations = imitation_operations(scope.state.project, reference)
    if not operations:
        return Observation("The project already imitates this clip; train it to improve the copy.")
    matched = ", ".join(f"{track.segment} → {track.part}" for track in reference.tracks)
    tried = run_try(scope, operations, None)
    return Observation(f"Limbs matched: {matched}\n{tried.text}", ok=tried.ok, summary=tried.summary)


IMITATE_CLIP = Tool(
    name="imitate_clip",
    description=(
        "Make the project's body imitate its tracked reference video: each tracked limb is matched to a body part "
        "and the task becomes imitation with the motion reward (track_motion) plus posture terms. Returns a try; "
        "propose or apply it, then train."
    ),
    args=ImitateArgs,
    step="try",
    effect="read",
    run=_imitate,
    per_turn=2,
    timeout_s=60,
)
