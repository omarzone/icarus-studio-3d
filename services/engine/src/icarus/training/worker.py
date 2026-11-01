import argparse
import functools
import sys
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import gymnasium

from icarus.contracts.project import Project
from icarus.contracts.training import RunState
from icarus.sim.env import ProjectEnv
from icarus.training.lifeline import watch_parent
from icarus.training.progress import RunProgress
from icarus.training.run_store import RunFolder

Device = Literal["cpu", "cuda"]
TRACEBACK_LINES = 8


@dataclass(frozen=True)
class PpoSettings:
    """PPO hyperparameters known to train navigation on CPU (ADR 001)."""

    n_steps: int = 1024
    batch_size: int = 2048
    n_epochs: int = 10
    learning_rate: float = 3e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    layers: tuple[int, ...] = (256, 256)


def make_env(project: Project) -> ProjectEnv:
    return ProjectEnv(project, randomize=True)


def _failure_reason(error: BaseException, started: bool) -> str:
    if not started:
        return f"Training could not start: {error}."
    return "Training stopped because of an error in the worker."


DEFAULT_PPO = PpoSettings()


def train(run_dir: Path, ppo: PpoSettings = DEFAULT_PPO, device: Device = "cpu") -> RunState:
    """Train a run to its last step or until a stop request, writing everything into its folder."""
    folder = RunFolder(run_dir)
    progress = RunProgress(folder)
    config = progress.config
    env = None
    try:
        ProjectEnv(progress.project)
        import torch
        from stable_baselines3 import PPO
        from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecMonitor

        from icarus.training.callback import TrainingCallback

        torch.set_num_threads(config.threads)
        actual_device = "cuda" if device == "cuda" and torch.cuda.is_available() else "cpu"
        factories: list[Callable[[], gymnasium.Env]] = [
            functools.partial(make_env, progress.project) for _ in range(config.copies)
        ]
        env = VecMonitor(SubprocVecEnv(factories) if config.copies > 1 else DummyVecEnv(factories))
        if progress.folder.stop_requested():
            progress.log("Stop requested before training started")
            progress.finish("stopped", 0)
            return "stopped"
        geoms = ProjectEnv(progress.project).moving_geoms
        layers = list(ppo.layers)
        model = PPO(
            "MlpPolicy",
            env,
            learning_rate=ppo.learning_rate,
            n_steps=ppo.n_steps,
            batch_size=min(ppo.batch_size, ppo.n_steps * config.copies),
            n_epochs=ppo.n_epochs,
            gamma=ppo.gamma,
            gae_lambda=ppo.gae_lambda,
            policy_kwargs={"net_arch": {"pi": layers, "vf": layers}, "activation_fn": torch.nn.Tanh},
            seed=config.seed,
            device=actual_device,
            verbose=0,
        )
        progress.log(
            f"Training {config.total_steps:,} steps with {config.copies} "
            f"cop{'y' if config.copies == 1 else 'ies'} on the {actual_device.upper()}, {config.threads} threads"
        )
        progress.write_status(progress.state, 0)
        progress.checkpoint(model, 0, 0)
        progress.stopping = progress.folder.stop_requested()
        if not progress.stopping:
            model.learn(total_timesteps=config.total_steps, callback=TrainingCallback(progress, geoms))
        step = model.num_timesteps
        final = step if progress.stopping else config.total_steps
        if not progress.has_checkpoint(final):
            progress.checkpoint(model, final, step)
        state: RunState = "stopped" if progress.stopping else "done"
        progress.log(f"Training stopped at step {step:,}" if progress.stopping else "Training finished")
        progress.finish(state, step)
        return state
    except Exception as error:  # noqa: BLE001 - any failure becomes a readable failed status
        details = traceback.format_exception(error)[-TRACEBACK_LINES:]
        lines = [line.rstrip() for chunk in details for line in chunk.splitlines() if line.strip()]
        progress.fail(_failure_reason(error, progress.has_checkpoint(0)), lines)
        return "failed"
    finally:
        if env is not None:
            env.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="icarus.training.worker", description="Train one run in its folder.")
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument(
        "--exit-with-stdin",
        action="store_true",
        help="Stop training when stdin closes, so it never outlives the engine.",
    )
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if args.exit_with_stdin:
        watch_parent(RunFolder(args.run_dir))
    state = train(args.run_dir, device=args.device)
    return 1 if state == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
