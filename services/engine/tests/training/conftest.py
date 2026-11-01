from datetime import UTC, datetime

import pytest

from icarus.contracts.project import Project, ProjectState, Revision
from icarus.design.checks import design_report
from tests.sim.conftest import project_from


def state_of(template: str, project_id: str = "0123456789ab", revision: int = 1) -> ProjectState:
    project = project_from(template).model_copy(update={"id": project_id})
    report, _ = design_report(project)
    return ProjectState(
        project=project,
        revision=Revision(
            number=revision,
            parent=None,
            author="user",
            summary="Created",
            operations=[],
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        ),
        report=report,
        can_undo=False,
        can_redo=False,
    )


@pytest.fixture
def parking_state() -> ProjectState:
    return state_of("parking_car")


@pytest.fixture
def parking() -> Project:
    return project_from("parking_car")
