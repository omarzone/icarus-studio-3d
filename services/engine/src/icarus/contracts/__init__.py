from pydantic import BaseModel

from icarus.contracts.brain_network import (
    BrainActivations,
    BrainBehaviors,
    BrainNetwork,
    BrainReadings,
    BrainSizes,
    BrainSources,
)
from icarus.contracts.coach import AutopilotStart, AutopilotStatus, Diagnosis
from icarus.contracts.context_usage import ContextRequest, ContextUsage
from icarus.contracts.copilot import (
    AttachmentInfo,
    AttachmentUpload,
    BuildIdea,
    BuildStatus,
    Conversation,
    IdeaRequest,
    IdeaSet,
    MixIdeas,
    ModelSettings,
    ModelSettingsPatch,
    SendMessage,
    SetAutonomy,
    TweakIdea,
)
from icarus.contracts.design import DesignReport
from icarus.contracts.errors import ApiError, ValidationErrorBody
from icarus.contracts.events import EngineEventEnvelope, TaskInfo
from icarus.contracts.health import HealthStatus
from icarus.contracts.library import LibraryCatalog
from icarus.contracts.operations import OperationBatch
from icarus.contracts.play import PlayBrainOption, PlayCommandEnvelope, PlayMessageEnvelope
from icarus.contracts.project import CreateProject, DuplicateProject, Project, ProjectState, ProjectSummary, Revision
from icarus.contracts.scene import SceneDescription
from icarus.contracts.skins import SkinImport, SkinImported, SkinInfo
from icarus.contracts.storage import ChangeDataFolder, DataFolderCheck, DataFolderChoice, DataFolderMove, StorageInfo
from icarus.contracts.training import (
    CheckpointInfo,
    MetricPoint,
    Rollout,
    RunConfig,
    RunEventEnvelope,
    RunGroup,
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
    PlayBrainOption,
    StartRun,
    RunConfig,
    RunStatus,
    RunGroup,
    MetricPoint,
    CheckpointInfo,
    Rollout,
    RunEventEnvelope,
    TrainingSettings,
    TrainingSettingsPatch,
    Conversation,
    SendMessage,
    SetAutonomy,
    ContextRequest,
    ContextUsage,
    IdeaRequest,
    IdeaSet,
    TweakIdea,
    MixIdeas,
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
    BrainNetwork,
    BrainActivations,
    BrainReadings,
    BrainBehaviors,
    BrainSizes,
    BrainSources,
    StorageInfo,
    DataFolderMove,
    DataFolderChoice,
    DataFolderCheck,
    ChangeDataFolder,
    SkinInfo,
    SkinImport,
    SkinImported,
)

__all__ = ["MODELS", "ApiError", "HealthStatus"]
