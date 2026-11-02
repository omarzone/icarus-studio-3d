import argparse
import functools
import sys
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Literal, TypedDict

import gymnasium

from icarus.contracts.project import Project
from icarus.contracts.specs import BrainSpec
from icarus.contracts.training import RunState
from icarus.sim.env import ProjectEnv
from icarus.training.copy_process import start_copies
from icarus.training.lifeline import watch_parent
from icarus.training.progress import RunProgress
from icarus.training.run_store import RunFolder

Device = Literal["cpu", "cuda"]
TRACEBACK_LINES = 8


def make_env(project: Project) -> ProjectEnv:
    return ProjectEnv(project, randomize=True)


def _failure_reason(error: BaseException, started: bool) -> str:
    if not started:
        return f"Training could not start: {error}."
    return "Training stopped because of an error in the worker."


class PpoArguments(TypedDict):
    learning_rate: float
    n_steps: int
    batch_size: int
    n_epochs: int
    gamma: float
    gae_lambda: float
    ent_coef: float


def ppo_arguments(brain: BrainSpec, copies: int) -> PpoArguments:
    """The brain's PPO knobs as Stable-Baselines3 takes them; a batch never holds more than one update collects."""
    ppo = brain.ppo
    return {
        "learning_rate": ppo.learning_rate,
        "n_steps": ppo.n_steps,
        "batch_size": min(ppo.batch_size, ppo.n_steps * copies),
        "n_epochs": ppo.n_epochs,
        "gamma": ppo.gamma,
        "gae_lambda": ppo.gae_lambda,
        "ent_coef": ppo.ent_coef,
    }


def train(run_dir: Path, device: Device = "cpu") -> RunState:
    """Train a run to its last step or until a stop request, with the brain settings frozen in its project."""
    folder = RunFolder(run_dir)
    progress = RunProgress(folder)
    config = progress.config
    env = None
    try:
        ProjectEnv(progress.project)
        progress.log(f"Starting {config.copies} cop{'y' if config.copies == 1 else 'ies'} of the world")
        started = start_copies(progress.project, config.copies) if config.copies > 1 else None
        import torch
        from stable_baselines3 import PPO
        from stable_baselines3.common.vec_env import DummyVecEnv, VecMonitor

        from icarus.training.callback import TrainingCallback
        from icarus.training.copy_envs import CopyProcesses

        torch.set_num_threads(config.threads)
        actual_device = "cuda" if device == "cuda" and torch.cuda.is_available() else "cpu"
        if started is not None:
            env = VecMonitor(CopyProcesses(started))
        else:
            factories: list[Callable[[], gymnasium.Env]] = [functools.partial(make_env, progress.project)]
            env = VecMonitor(DummyVecEnv(factories))
        if progress.folder.stop_requested():
            progress.log("Stop requested before training started")
            progress.finish("stopped", 0)
            return "stopped"
        geoms = ProjectEnv(progress.project).moving_geoms
        brain = progress.project.brain
        arguments = ppo_arguments(brain, config.copies)
        warm = config.warm_start
        if warm is not None:
            source = RunFolder(run_dir.parent / warm.run_id)
            # Loading with the new copies checks that they see and act the way the saved brain does.
            # The network keeps the saved shape; warm_start_problem refuses one that differs from the brain's layers.
            model = PPO.load(source.checkpoint_path(warm.step), env=env, device=actual_device, **arguments)
            model.set_random_seed(config.seed)
            progress.log(f"Continuing from {source.stored_status().name} at step {warm.step:,}")
        else:
            layers = list(brain.layers)
            model = PPO(
                "MlpPolicy",
                env,
                **arguments,
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
        progress.log("Testing the untrained brain: checkpoint 0 is the baseline every later one is compared with")
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
