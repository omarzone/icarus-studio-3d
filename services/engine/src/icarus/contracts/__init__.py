from pydantic import BaseModel

from icarus.contracts.coach import AutopilotStart, AutopilotStatus, Diagnosis
from icarus.contracts.copilot import (
    AttachmentInfo,
    AttachmentUpload,
    BuildIdea,
    BuildStatus,
    Conversation,
    IdeaRequest,
    IdeaSet,
    ModelSettings,
    ModelSettingsPatch,
    SendMessage,
    SetAutonomy,
)
from icarus.contracts.design import DesignReport
from icarus.contracts.errors import ApiError, ValidationErrorBody
from icarus.contracts.events import EngineEventEnvelope, TaskInfo
from icarus.contracts.health import HealthStatus
from icarus.contracts.library import LibraryCatalog
from icarus.contracts.operations import OperationBatch
from icarus.contracts.play import PlayCommandEnvelope, PlayMessageEnvelope
from icarus.contracts.project import CreateProject, DuplicateProject, Project, ProjectState, ProjectSummary, Revision
from icarus.contracts.scene import SceneDescription
from icarus.contracts.training import (
    CheckpointInfo,
    MetricPoint,
    Rollout,
    RunConfig,
    RunEventEnvelope,
    RunStatus,
    StartRun,
    TrainingSettings,
    TrainingSettingsPatch,
)

MODELS: tuple[type[BaseModel], ...] = (
    HealthStatus,
    ApiError,
    ValidationErrorBody,
    Project,
    Revision,
    ProjectSummary,
    ProjectState,
    CreateProject,
    DuplicateProject,
    OperationBatch,
    DesignReport,
    SceneDescription,
    LibraryCatalog,
    PlayCommandEnvelope,
    PlayMessageEnvelope,
    StartRun,
    RunConfig,
    RunStatus,
    MetricPoint,
    CheckpointInfo,
    Rollout,
    RunEventEnvelope,
    TrainingSettings,
    TrainingSettingsPatch,
    Conversation,
    SendMessage,
    SetAutonomy,
    IdeaRequest,
    IdeaSet,
    BuildIdea,
    BuildStatus,
    ModelSettings,
    ModelSettingsPatch,
    AttachmentUpload,
    AttachmentInfo,
    Diagnosis,
    AutopilotStart,
    AutopilotStatus,
    EngineEventEnvelope,
    TaskInfo,
)

__all__ = ["MODELS", "ApiError", "HealthStatus"]
