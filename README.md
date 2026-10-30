<div align="center">

# Icarus Studio 3D

**Describe a creature or a robot. Watch it learn to move in real physics. Take it into the real world.**

![Meta Global AI Developer Hackathon](https://img.shields.io/badge/Meta-Global%20AI%20Developer%20Hackathon-0467DF?style=for-the-badge&logo=meta&logoColor=white)
[![Copilot powered by Muse Spark](https://img.shields.io/badge/Copilot-Muse%20Spark-0467DF?style=for-the-badge&logo=meta&logoColor=white)](#the-ai-copilot)

![Status](https://img.shields.io/badge/status-in%20development-F0A63A?style=flat-square)
![Platforms](https://img.shields.io/badge/platforms-Windows%20·%20macOS%20·%20Linux-262626?style=flat-square)
![Physics](https://img.shields.io/badge/physics-MuJoCo-262626?style=flat-square)
![Training](https://img.shields.io/badge/training-PPO%20on%20CPU-262626?style=flat-square)
![Desktop](https://img.shields.io/badge/desktop-Electron%20%2B%20React%20Three%20Fiber-262626?style=flat-square)

</div>

> [!NOTE]
> **Built for the Meta Global AI Developer Hackathon (Indie track).** I am a solo developer, and I am thrilled to take part and to build in the open alongside developers from all over the world.
> I hope Icarus Studio 3D shows that teaching a body to move, once a job for robotics labs, can start with a single sentence and a curious mind.
> If it sparks one person to build, train and share their first robot brain, it has done its job.

## What is Icarus Studio 3D?

Icarus Studio 3D is a desktop studio for **embodied AI**: brains that control bodies. You describe an idea, such as *"a little car that learns to park itself"*, and an AI copilot builds a real 3D world, a physical body with sensors and motors, a goal and a brain. Then you watch that brain learn to move through reinforcement learning, in a real physics simulation, on your own computer.

It owns exactly one loop: **idea → world → body → brain → trained behavior**, created, tested, explained and shared as one living project.

- **For beginners**, it works by talking. You never need to know physics or machine learning to get a result.
- **For experts**, every joint, sensor, reward term and network setting is open and editable in a full 3D editor.
- **For everyone**, nothing is faked. Every curve, score and replay on screen comes from a real simulation.

## How it works

1. **Describe it.** Type an idea. The copilot shows three different ways to build it as real 3D previews, with honest training estimates. Pick one, mix them or tweak them.
2. **See it built.** The world and the body appear, and every design is compiled to MuJoCo and physically tested before you see it: it must stand, move its motors and read its sensors.
3. **Play with it.** Press Play at any time. Push it, move things in its way, change the light, and watch what it senses and decides. Nothing you do in Play changes the project.
4. **Train it and watch it learn.** Training runs locally on the CPU, with many copies of the world in parallel. A timeline records real episodes from the first random moves to the final skill, ready to replay as a timelapse.
5. **Understand failures.** The copilot watches test runs with vision, groups the failures ("it scrapes the parked car on tight left turns"), explains why and proposes a fix. You approve it, and it becomes a new revision that trains again.
6. **Take it out.** Publish it to the community, export the brain (ONNX), export motion as animation for game engines, or run it on real hardware with a parts list and a calibration flow.

## What you can make

| Idea | What Icarus does |
|---|---|
| A car that learns to park | Builds a parking lot, a car with distance sensors and a reward for parking without touching other cars, then trains it in 16 lots at once |
| A character that dances like a video | Tracks the dancer's pose frame by frame, maps it onto a physical humanoid and trains it to keep its balance while copying the moves |
| A fruit fly driven by its real brain | Loads a published fly connectome into a physics model of the fly, with no training at all, and compares its behavior to recordings of real flies |
| Your own robot or model | Imports it, rigs it with bones, joints, masses and motors, checks that it can stand, and lets you train it like anything else |

## Features

- **An AI copilot at every step.** It designs worlds, bodies, sensors, rewards and brains, coaches training, diagnoses failures and explains anything on screen. Every change it proposes is previewed and applied only with your approval.
- **A real 3D editor.** Viewport, explorer and inspector, in the tradition of game and simulation studios. Everything is an object made of components, and every property uses one of 12 consistent controls, so a car, a creature and an imported robot arm are all edited the same way.
- **Physics you can trust.** MuJoCo is the only physical truth. The renderer replays what the engine computed and never invents motion.
- **Play mode.** A live playground for any project, with tools that adapt to what the body can sense.
- **Learning you can watch.** Parallel training, live metrics, checkpoint comparisons on the same seed, and a cinematic timelapse of how it learned.
- **Motion from video.** Teach a character to copy a reference video under real physics, then export the animation.
- **Brains from learning or from nature.** Train a neural network, or run a real connectome inside its body.
- **From simulation to reality.** Hardware profiles with real parts, randomized physics for robust brains, and export to a small runtime for single-board computers.
- **Create, share, remix.** A community to publish creations, watch how they learned and remix them. Shared projects carry data only, never executable code.
- **Reproducible by default.** Every run is tied to the exact project revision, seed and versions that produced it.

## The AI copilot

The copilot is the product, not a feature. It works through the same validated **edit operations** as the editor, so everything it does is visible, undoable and editable by hand. It never runs code and never touches the simulator directly: **the copilot proposes, validation decides**.

Inside the product, the copilot runs on **Meta's Muse Spark** models, connected through an OpenAI-compatible interface and configured per capability:

| Capability | Used for |
|---|---|
| Reasoning | Conversation, design, coaching, explanations |
| Vision | Watching rendered episodes to diagnose failures |
| Image | Skins, textures and thumbnails |
| Pose | Reading body pose from reference videos |

## Architecture

```
┌─────────────────────────── Desktop app (Electron) ───────────────────────────┐
│  React · TypeScript · React Three Fiber · Tailwind · shadcn/ui              │
│  Workspaces: World · Body · Motion · Brain · Train · Results · Build · Play │
└───────────────▲──────────────────────────────────────────────┬──────────────┘
                │ HTTP + SSE + WebSocket (typed contract)        │
┌───────────────┴──────────────── Local engine (Python) ────────▼──────────────┐
│  FastAPI · Pydantic · project revisions and edit operations                 │
│  Design compiler → MuJoCo · physics tests · Gymnasium environments          │
│  Training worker (Stable-Baselines3 PPO, CPU) · run store · rollouts        │
│  Copilot client (Muse Spark, per capability) · motion · hardware export    │
└─────────────────────────────────────────────────────────────────────────────┘
                │ bundles (data only)
┌───────────────▼──────────── Community service (online) ─────────────────────┐
│  Accounts · catalog · bundle storage · lineage · moderation                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

One contract is defined in Python with Pydantic and generated into TypeScript, so the engine and the desktop app can never disagree about a project. The desktop app starts and supervises the engine itself: users open one application, never a server. More in [`docs/architecture.md`](./docs/architecture.md).

## Tech stack

| Layer | Technology |
|---|---|
| Desktop | Electron, electron-vite, React, TypeScript (strict), React Three Fiber, drei, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Recharts |
| Engine | Python 3.12 (uv), FastAPI, Pydantic v2, MuJoCo, Gymnasium, Stable-Baselines3 (PPO), ONNX |
| AI | Muse Spark through an OpenAI-compatible client, one connection per capability |
| Quality | Biome, Vitest, ruff, pyright, pytest, one `pnpm check` for the whole repository |

## Status

Icarus Studio 3D is in active development. The product, the architecture and the complete interface design are defined, and the code is landing zone by zone on top of them. This README is updated as each part becomes real; anything not built yet is described as a goal, never shown as a result.

**Now real:** the foundation. The desktop app starts, supervises and restarts the local engine; the engine and the app share one generated contract; the interface is built from the design tokens; and every screen is checked against its design and its catalog entry by automated tests. A first measurement shows a car learning to park on a desktop CPU in under 4 minutes ([ADR 001](./docs/decisions/001-cpu-training-budget.md)).

## Development

Requirements: Node.js 22+, pnpm, [uv](https://docs.astral.sh/uv/) and Git. No GPU is needed; training runs on the CPU.

```bash
pnpm install && pnpm engine:sync   # install the app and the engine
pnpm dev                           # run the desktop app and the engine
pnpm check                         # lint, types and tests for everything
```

These commands become available as the first application code lands.

## Repository

```
apps/desktop/        Electron desktop studio
services/engine/     Local Python engine: design, simulation, training, copilot
services/community/  Online community service
packages/contracts/  TypeScript types generated from the engine contract
packages/ui-tokens/  Design tokens shared by the interface and the 3D scene
docs/                Architecture, design system and plans
```

## Documentation

| Document | What it covers |
|---|---|
| [`VISION.md`](./VISION.md) | What Icarus Studio 3D is for, and the decisions behind it |
| [`docs/architecture.md`](./docs/architecture.md) | How it is built: engine, contract, copilot, training, desktop |
| [`docs/design/screens.md`](./docs/design/screens.md) | Every screen, dialog, panel and tab, with its purpose and actions |
| [`docs/design/STYLEGUIDE.md`](./docs/design/STYLEGUIDE.md) | How the interface looks, behaves and reads |
| [`docs/design/tokens.md`](./docs/design/tokens.md) | Colors, type, spacing and every other design value |
| [`AGENTS.md`](./AGENTS.md) | Rules for contributors and coding agents |

<div align="center">

Made with curiosity for the Meta Global AI Developer Hackathon.

</div>
