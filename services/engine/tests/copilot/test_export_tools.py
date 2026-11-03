import json
import zipfile

import pytest

from icarus.contracts.copilot import SendMessage
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.exporting import CheckHardwareArgs, check_hardware
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor
from tests.copilot.agent_script import answering, script, tool_step


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def project_id(store) -> str:
    return store.create("Walker", "walker_robot").project.id


def test_export_my_robot_as_urdf_writes_a_zip_with_the_robot_and_says_where(tmp_path, store, project_id, monkeypatch):
    runs = RunStore(tmp_path / "runs")
    training = TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects")
    trainer = ChatTrainer(store, runs, Supervisor(runs), training)
    settings = ModelSettingsStore(tmp_path)
    projects = tmp_path / "projects"
    copilot = Copilot(store, runs, ConversationStore(projects), settings, trainer, AttachmentStore(projects))
    export = tool_step("export_robot", format="urdf", options=["parts"])
    script(monkeypatch, tmp_path, default=[export, answering("Your robot is exported.")])

    answer = copilot.send(project_id, SendMessage(text="export my robot as URDF", workspace="Build")).messages[-1]

    assert [(step.tool, step.ok) for step in answer.steps] == [("export", True)]
    assert answer.steps[0].summary == "Exported URDF: 2 files"
    (exported,) = (tmp_path / "exports" / project_id).glob("*.zip")
    with zipfile.ZipFile(exported) as archive:
        assert {name.split("/", 1)[1] for name in archive.namelist()} == {"robot.urdf", "parts.csv"}


def test_the_hardware_tool_reports_a_verdict_per_part_and_refuses_unknown_kits(tmp_path, store, project_id):
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    scope = TurnScope(project_id, store.state(project_id), "ask", services)
    facts = json.loads(check_hardware(scope, CheckHardwareArgs(kit="servo_humanoid")).text)
    assert facts["kit"]["id"] == "servo_humanoid" and facts["verdict"] == "fail"
    assert facts["measured_from"].startswith("not measured")
    assert all(row["status"] in ("pass", "warn", "fail") for row in facts["rows"])
    missing = check_hardware(scope, CheckHardwareArgs(kit="spaceship"))
    assert not missing.ok and "servo_humanoid" in missing.text
