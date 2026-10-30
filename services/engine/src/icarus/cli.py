import argparse
import os
import sys
import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class EngineArgs:
    host: str
    port: int
    reload: bool
    exit_with_stdin: bool


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
    ns = parser.parse_args(argv)
    return EngineArgs(host=ns.host, port=ns.port, reload=ns.reload, exit_with_stdin=ns.exit_with_stdin)


def _exit_when_stdin_closes() -> None:
    sys.stdin.buffer.read()
    os._exit(0)


def main(argv: list[str] | None = None) -> None:
    import uvicorn

    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.exit_with_stdin:
        threading.Thread(target=_exit_when_stdin_closes, name="parent-watch", daemon=True).start()
    uvicorn.run("icarus.api.app:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
