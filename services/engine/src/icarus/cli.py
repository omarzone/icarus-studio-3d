import argparse
import os
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, BinaryIO

if TYPE_CHECKING:
    from icarus.training.supervisor import Supervisor


@dataclass(frozen=True)
class EngineArgs:
    host: str
    port: int
    reload: bool
    exit_with_stdin: bool
    projects_dir: Path | None


def parse_args(argv: list[str]) -> EngineArgs:
    parser = argparse.ArgumentParser(prog="icarus-engine", description="Run the local Icarus engine.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--reload", action="store_true")
    parser.add_argument(
        "--exit-with-stdin",
        action="store_true",
        help="Exit when stdin closes, so the engine never outlives the app that started it.",
    )
    parser.add_argument("--projects-dir", type=Path, default=None, help="Where projects are stored.")
    ns = parser.parse_args(argv)
    return EngineArgs(
        host=ns.host, port=ns.port, reload=ns.reload, exit_with_stdin=ns.exit_with_stdin, projects_dir=ns.projects_dir
    )


def exit_when_stdin_closes(stdin: BinaryIO, supervisor: "Supervisor | None") -> None:
    """Exit once the parent closes stdin, first stopping the run in training so no worker outlives the engine."""
    stdin.read()
    if supervisor is not None:
        supervisor.shutdown()
    os._exit(0)


def main(argv: list[str] | None = None) -> None:
    import uvicorn

    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.projects_dir is not None:
        os.environ["ICARUS_PROJECTS_DIR"] = str(args.projects_dir)
    if not args.exit_with_stdin:
        uvicorn.run("icarus.api.app:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)
        return
    # Native imports (MuJoCo) hang on Windows while another thread blocks reading stdin, so import first.
    from icarus.api.app import create_app

    # With reload the app lives in a child process this one cannot reach.
    app = None if args.reload else create_app()
    supervisor = app.state.supervisor if app is not None else None
    watch = threading.Thread(
        target=exit_when_stdin_closes, args=(sys.stdin.buffer, supervisor), name="parent-watch", daemon=True
    )
    watch.start()
    if app is None:
        uvicorn.run("icarus.api.app:create_app", factory=True, host=args.host, port=args.port, reload=True)
    else:
        uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
