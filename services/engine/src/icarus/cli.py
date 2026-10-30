import argparse
from dataclasses import dataclass


@dataclass(frozen=True)
class EngineArgs:
    host: str
    port: int
    reload: bool


def parse_args(argv: list[str]) -> EngineArgs:
    parser = argparse.ArgumentParser(prog="icarus-engine", description="Run the local Icarus engine.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--reload", action="store_true")
    ns = parser.parse_args(argv)
    return EngineArgs(host=ns.host, port=ns.port, reload=ns.reload)


def main(argv: list[str] | None = None) -> None:
    import sys

    import uvicorn

    args = parse_args(sys.argv[1:] if argv is None else argv)
    uvicorn.run("icarus.api.app:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
