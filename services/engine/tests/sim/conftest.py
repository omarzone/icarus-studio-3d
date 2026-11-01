import pytest

from icarus.contracts.project import Project
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project


def project_from(template: str) -> Project:
    return apply_operations(empty_project("0123456789ab", "Test"), template_operations(template))


@pytest.fixture
def parking() -> Project:
    return project_from("parking_car")


@pytest.fixture
def walker() -> Project:
    return project_from("walker_robot")
