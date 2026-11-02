import multiprocessing as mp
from dataclasses import dataclass
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from typing import Any

from icarus.contracts.project import Project
from icarus.sim.env import ProjectEnv

# The loop each training copy runs in its own process. It mirrors Stable-Baselines3's subprocess worker but lives in a
# module that never imports torch, so the copies start in seconds instead of each loading the training stack.


def run_copy(remote: Connection, parent_remote: Connection, project_json: str) -> None:
    parent_remote.close()
    env = ProjectEnv(Project.model_validate_json(project_json), randomize=True)
    while True:
        try:
            command, data = remote.recv()
        except (EOFError, KeyboardInterrupt):
            return
        if command == "step":
            observation, reward, terminated, truncated, info = env.step(data)
            done = terminated or truncated
            info["TimeLimit.truncated"] = truncated and not terminated
            reset_info: dict[str, Any] = {}
            if done:
                info["terminal_observation"] = observation
                observation, reset_info = env.reset()
            remote.send((observation, reward, done, info, reset_info))
        elif command == "reset":
            options = {"options": data[1]} if data[1] else {}
            remote.send(env.reset(seed=data[0], **options))
        elif command == "get_spaces":
            remote.send((env.observation_space, env.action_space))
        elif command == "env_method":
            remote.send(env.get_wrapper_attr(data[0])(*data[1], **data[2]))
        elif command == "get_attr":
            remote.send(env.get_wrapper_attr(data))
        elif command == "has_attr":
            remote.send(hasattr(env, data))
        elif command == "set_attr":
            setattr(env, data[0], data[1])
            remote.send(None)
        elif command == "render":
            remote.send(None)
        elif command == "close":
            env.close()
            remote.close()
            return
        else:
            raise NotImplementedError(f"A training copy does not understand {command!r}")


@dataclass(frozen=True)
class StartedCopies:
    # Pipe ends; their class differs by platform (a PipeConnection on Windows).
    remotes: list[Any]
    processes: list[BaseProcess]


def start_copies(project: Project, copies: int) -> StartedCopies:
    """Start the copies' processes and return at once, so they boot while the worker loads torch."""
    context = mp.get_context("spawn")
    project_json = project.model_dump_json()
    remotes: list[Any] = []
    processes: list[BaseProcess] = []
    for _ in range(copies):
        remote, work_remote = context.Pipe()
        # daemon: a crashed worker never leaves copies behind.
        process = context.Process(target=run_copy, args=(work_remote, remote, project_json), daemon=True)
        process.start()
        work_remote.close()
        remotes.append(remote)
        processes.append(process)
    return StartedCopies(remotes, processes)
