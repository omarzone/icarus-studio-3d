from pydantic import BaseModel

from icarus.contracts.design import DesignReport
from icarus.contracts.errors import ApiError, ValidationErrorBody
from icarus.contracts.health import HealthStatus
from icarus.contracts.library import LibraryCatalog
from icarus.contracts.operations import OperationBatch
from icarus.contracts.play import PlayCommandEnvelope, PlayMessageEnvelope
from icarus.contracts.project import CreateProject, DuplicateProject, Project, ProjectState, ProjectSummary, Revision
from icarus.contracts.scene import SceneDescription

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
)

__all__ = ["MODELS", "ApiError", "HealthStatus"]
