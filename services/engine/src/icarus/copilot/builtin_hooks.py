"""The engine's own rules as hooks, so they run at explicit points in a known order."""

from pydantic import BaseModel, ConfigDict

from icarus.contracts.project import Project
from icarus.copilot.agent.permissions import APPLY_DENIED, permission
from icarus.copilot.grounding import unsupported_numbers
from icarus.copilot.hooks import HookContext, HookDecision, HookRegistry

ASK_MODE_ORDER = 10


class _ToolArgs(BaseModel):
    model_config = ConfigDict(extra="allow")


def ask_mode_tool(context: HookContext) -> HookDecision | None:
    if context.tool is None or context.fields.get("autonomy") not in {"ask", "autopilot"}:
        return None
    autonomy = "autopilot" if context.fields.get("autonomy") == "autopilot" else "ask"
    verdict, reason = permission(context.tool, _ToolArgs.model_validate(dict(context.args)), autonomy)
    match verdict:
        case "allow":
            return None
        case "deny":
            return HookDecision(point=context.point, action="block", reason=reason, source="ask_mode")
        case "offer":
            return HookDecision(point=context.point, action="suggest", reason=reason, source="ask_mode")


def ask_mode_apply(context: HookContext) -> HookDecision | None:
    if context.fields.get("autonomy") == "ask" and context.fields.get("actor") == "copilot":
        return HookDecision(point=context.point, action="block", reason=APPLY_DENIED, source="ask_mode")
    return None


def grounding_check(context: HookContext) -> str | None:
    answer = context.fields.get("answer")
    sources = context.fields.get("sources")
    if not isinstance(answer, str) or not isinstance(sources, list):
        return None
    missing = unsupported_numbers(answer, [str(source) for source in sources])
    return f"These numbers have no source: {', '.join(missing)}" if missing else None


def design_check(context: HookContext) -> str | None:
    project = context.fields.get("project")
    if not isinstance(project, Project):
        return None
    from icarus.design.checks import design_report

    report, _ = design_report(project)
    failed = [f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail"]
    return "; ".join(failed) if failed else None


def default_registry() -> HookRegistry:
    registry = HookRegistry()
    registry.register("before_tool", ask_mode_tool, name="ask_mode", order=ASK_MODE_ORDER)
    registry.register("before_apply", ask_mode_apply, name="ask_mode", order=ASK_MODE_ORDER)
    registry.register_check("grounding", grounding_check)
    registry.register_check("design_tests", design_check)
    return registry
