from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DiagnosisEvidence(_Model):
    kind: Literal["metric", "reward_term", "episode", "frame"]
    # What it is, in words ("Falls in 92% of episodes").
    label: str = Field(max_length=200)
    detail: str | None = Field(default=None, max_length=500)
    # A frame rendered from a recorded episode, when the evidence is a picture.
    attachment_id: str | None = None


class FailureGroup(_Model):
    # How episodes go wrong, in words ("Falls forward in the first second").
    label: str = Field(max_length=120)
    # Share of the evaluated episodes in this group, 0 to 1.
    share: float = Field(ge=0, le=1)
    description: str = Field(max_length=500)
    frame_attachment_ids: list[str] = Field(default=[], max_length=6)


class Diagnosis(_Model):
    """What the coach found in a run at one checkpoint, from the run's own data and frames."""

    id: str
    project_id: str
    run_id: str
    step: int = Field(ge=0)
    created_at: datetime
    # One plain sentence a beginner understands.
    summary: str = Field(max_length=400)
    observations: list[str] = Field(max_length=12)
    evidence: list[DiagnosisEvidence] = Field(max_length=16)
    failure_groups: list[FailureGroup] = Field(max_length=8)
    # Why it thinks the brain behaves this way ("spins in place to collect the alignment reward").
    hypothesis: str = Field(max_length=600)
    # What the coach recommends doing with the run now.
    next_step: Literal["keep_training", "stop_and_fix", "done"]
    # The fix it proposes, as an ordinary copilot proposal.
    proposal_id: str | None = None


AutopilotMode = Literal["ask", "fix"]
AutopilotState = Literal["running", "waiting_approval", "done", "stopped", "failed"]


class AutopilotStart(_Model):
    # ask: the coach diagnoses and proposes, the person applies; fix: it applies, retrains and compares by itself.
    mode: AutopilotMode
    # Evaluation success rate that counts as learned, 0 to 1.
    goal_success: float = Field(default=0.8, gt=0, le=1)
    max_iterations: int = Field(default=4, ge=1, le=12)
    max_minutes: int = Field(default=60, ge=5, le=600)


class AutopilotLogLine(_Model):
    time: datetime
    text: str = Field(max_length=400)


class AutopilotStatus(_Model):
    project_id: str
    mode: AutopilotMode
    state: AutopilotState
    iteration: int = Field(ge=0)
    max_iterations: int
    goal_success: float
    started_at: datetime
    finished_at: datetime | None = None
    run_ids: list[str]
    diagnosis_ids: list[str]
    best_run_id: str | None = None
    best_success: float | None = None
    log: list[AutopilotLogLine]
