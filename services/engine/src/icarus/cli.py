import argparse
import os
import sys
import threading
from dataclasses import dataclass
from pathlib import Path


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


def _exit_when_stdin_closes() -> None:
    sys.stdin.buffer.read()
    os._exit(0)


def main(argv: list[str] | None = None) -> None:
    import uvicorn

    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.projects_dir is not None:
        os.environ["ICARUS_PROJECTS_DIR"] = str(args.projects_dir)
    if args.exit_with_stdin:
        # Native imports (MuJoCo) hang on Windows while another thread blocks reading stdin, so import first.
        import icarus.api.app  # noqa: F401

        threading.Thread(target=_exit_when_stdin_closes, name="parent-watch", daemon=True).start()
    uvicorn.run("icarus.api.app:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
