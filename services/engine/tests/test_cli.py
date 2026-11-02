import io
import sys

from icarus import cli
from icarus.cli import exit_when_stdin_closes, parse_args
from icarus.contracts.training import StartRun
from icarus.training.run_store import RunStore
from icarus.training.supervisor import Supervisor
from tests.training.conftest import state_of
from tests.training.test_supervisor import FAKE_WORKER, state_is, wait_for


def test_cli_defaults_to_localhost():
    args = parse_args(["--port", "9100"])
    assert (args.host, args.port, args.reload) == ("127.0.0.1", 9100, False)


def test_cli_takes_a_projects_directory(tmp_path):
    assert parse_args(["--port", "9100", "--projects-dir", str(tmp_path)]).projects_dir == tmp_path
    assert parse_args(["--port", "9100"]).projects_dir is None


def test_the_engine_picks_a_rendering_backend_before_it_loads_the_app(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(cli, "prepare_rendering", lambda: calls.append("prepare"))
    monkeypatch.setattr("uvicorn.run", lambda *_args, **_kwargs: calls.append("serve"))
    cli.main(["--port", "9100"])
    assert calls == ["prepare", "serve"]


def test_the_engine_stops_its_training_run_before_exiting_when_its_parent_closes_stdin(tmp_path, monkeypatch):
    store = RunStore(tmp_path)
    command = lambda run_dir, use_graphics_card: [sys.executable, str(FAKE_WORKER), str(run_dir), "obey"]  # noqa: E731
    supervisor = Supervisor(store, command=command)
    run = supervisor.start(state_of("parking_car"), StartRun(total_steps=10_000, copies=1), 1, False)
    wait_for(state_is(store, run.run_id, "running"))
    exits: list[int] = []
    monkeypatch.setattr("os._exit", exits.append)

    exit_when_stdin_closes(io.BytesIO(b""), supervisor)

    assert exits == [0]
    assert store.folder(run.run_id).status().state == "stopped"
    assert supervisor.active_run() is None
