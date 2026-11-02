# Copilot harness extensions: events, tasks, skills, memory and extensions

Builds on `docs/plans/copilot-agent-harness.md` (the agent loop, ADR 006). The loop already has steps, tools, budgets, compaction and permissions. This document adds what makes it a platform: everything emits an event, long work runs as background tasks, the copilot follows written skills, remembers what it learned per project, and the community can extend it later without shipping code.

Invariants that shape every choice here: the copilot proposes and validation decides; bundles carry data, never code; real or nothing; one edit model.

## 1. Event bus (`icarus/events.py`)

Every meaningful thing the engine does publishes one typed event. The bus is in-process, synchronous to publish, and fan-out to subscribers that never block the publisher (each subscriber has a bounded queue; a slow one drops its oldest events and records that it dropped).

- **Contract** (its own task, landed first): `EngineEvent` is a discriminated union carried in an `EngineEventEnvelope {id, time, project_id | null, event}`. First kinds:
  - copilot: `turn_started`, `step` (the same `AgentStep` the message stores, emitted live), `view_taken` (attachment id), `proposal_created`, `proposal_applied`, `turn_finished`;
  - tasks: `task_started`, `task_progress` (0–1 and a sentence), `task_finished` (done, stopped, failed with a reason);
  - training: the existing `RunEvent`s re-published, plus `diagnosis_created`;
  - project: `revision_created` (author, summary).
- **Transport:** `GET /events?project=<id>` streams envelopes as server-sent events (same format as run events). The desktop subscribes once per open project; this replaces "Working…" with live steps, and lets every panel refresh from events instead of polling.
- **Subscribers inside the engine:** the conversation store (live steps), the task registry, a rotating JSONL event log under the engine data folder (debugging and the timelapse), and, later, declarative extension hooks (§6).
- Rule: new features publish events from the module that owns the change, never from the API layer.

## 2. Background tasks (`icarus/tasks.py`)

Long work is a task with an id, kind, state, progress and events, owned by a registry in the API process (which never trains: training tasks drive the supervisor).

- Kinds: `training_run` (wraps a run), `autopilot`, `diagnosis`, `ideas`, `build`, `agent_turn` (a chat turn that outlives its request).
- API: `GET /tasks?project=<id>` (contract `TaskInfo`), `DELETE /tasks/{id}` to cancel. Cancelling is cooperative and always ends in a final event.
- The copilot gets a `tasks` tool (list, status, cancel) so it can say "the autopilot is on iteration 2" or stop what it started, and chat turns can hand long work to a task and answer at once ("I started it; I will tell you when it finishes"), with the task posting a copilot message when it ends.
- Tasks do not survive an engine restart; on start the registry marks unfinished ones stopped (runs already do this).

## 3. Skills (`icarus/copilot/skills/`)

A skill is a written procedure the copilot follows for a kind of job: what to check, in what order, which tools, which pitfalls, what "done" means. Skills are Markdown files with front matter — data, never code.

```markdown
---
name: walking-robot
title: Design a robot that learns to walk
when: The person wants legs, a walker, a quadruped or any body that moves by stepping.
tools: [library, inspect_object, try, look, propose, train]
version: 1
---
1. Body: torso mass 4–8 kg, legs with hip and knee hinges ...
2. Sensors: balance on the torso, touch on each foot ...
3. Rewards: forward_progress, stay_upright, fall_penalty; never alignment terms ...
4. Check: try, then look from the side at the feet on the ground ...
5. Train: recommend 2M steps; if it falls in the first second after 250k, diagnose ...
```

- **Progressive disclosure:** the prompt lists only each skill's `name`, `title` and `when` (a few lines); the copilot calls `use_skill(name)` to read the body, which is added as a pinned observation that compaction keeps. A turn may use several skills.
- **Sources, in priority order:** built-in skills shipped with the engine (`copilot/skills/builtin/*.md`), then community skills installed from bundles (§6). A skill is validated on load: known front-matter fields, tool names that exist, size limit; an invalid skill is reported and skipped.
- **Checklists:** numbered steps of a skill become the turn's task list (the existing `steps` show progress against it), so the person can see "step 3 of 5: checking the feet".
- **First built-in skills:** parking and navigation tasks; walking robots; races and obstacle courses; reward design and reward hacking; diagnosing a brain that does not learn; curriculum and warm starts; environment look (palette, sky, props with roles); sensors for a task.
- Skills are versioned; a proposal records which skills shaped it, so a later run can be traced to the procedure that produced it.

## 4. Memory (`icarus/copilot/memory.py`)

The copilot remembers facts that are expensive to rediscover, scoped and with their source.

- **Project memory** (`<projects>/.copilot/memory/<project_id>.jsonl`): facts such as "warm start from run 3 cut training in half", "the walker falls forward when hip torque is above 40", "the person prefers a desert look". Each fact has a source (run id + step, revision, or the person's message) and a time.
- **Person memory** (engine data folder): preferences that hold across projects (language, level of detail, autonomy habits). Never personal data beyond what the person said in the chat.
- **Tools:** `remember(fact, source)` and `recall(query)`; the prompt includes the few most relevant project facts each turn. Numbers in memory are never grounding sources by themselves: a remembered number must still come from a run or revision the copilot can read.
- The person can see and delete memory (a small list in project settings, later).

## 5. Comparison

A first-class tool rather than prose: `compare(run_a, run_b)` evaluates both best brains on the same evaluation seeds (the coach's comparison) and returns a table of success, failure, return, episode length and per-term rewards with differences, plus `compare_revisions(a, b)` (what changed in the project). The coach and the chat use the same tool; Results shows the same table.

## 6. Subagents

The copilot can hand a self-contained job to a subagent that works in the background while the conversation goes on, and both the copilot and the person can talk to it.

- **A subagent is an `agent_turn` task** (§2) running the same loop with its own budget, its own context (the brief, the project state, the skills it was given) and a scoped tool set (a design subagent gets `library`, `inspect_object`, `try`, `look`, `propose`; a training-watch subagent gets `read_run`, `look_episode`, `compare`; none gets `apply` unless the conversation is in autopilot).
- **Spawning:** the copilot's `delegate(brief, skills, tools, budget)` tool starts one and returns its task id at once. Typical uses: design the environment while another subagent designs the body; watch a run and report at each checkpoint; try three reward variants on copies and compare.
- **Talking to it:** `message_task(task_id, text)` from the copilot, and from the person through the chat (a subagent shows as a thread under the message that started it, with its live steps from the event bus). A message is queued and read at the subagent's next step. `task_result(task_id)` returns its final answer and proposal ids.
- **Results come back as events** (`task_finished` with its summary and proposal ids); the copilot is told on its next turn and can merge the work (proposals stay ordinary proposals, applied through the one edit model).
- **Limits:** at most 3 subagents per project at once, each with a step and time budget; subagents cannot spawn subagents; all writes still go through propose/apply and the autonomy mode of the conversation.

## 7. Compaction everywhere

The loop's compaction (in-turn pruning of old tool results and pictures, rolling summary of older messages with an identifier check, project state rebuilt live every turn) applies to every long-running agent:

- **Subagents** compact their own context with the same rules and keep their brief and skill bodies pinned.
- **Background tasks** that run for a long time (autopilot, training watch) keep a short running log of decisions instead of the full history; each iteration starts from live state (runs, revisions, diagnoses) plus that log.
- **Summaries are never sources:** a number in a summary or log must still be read from a run or revision before it is cited.
- Thresholds stay configurable per connection (context window learned from overflow errors).

**Sized to the window, so large windows are used, not wasted.** A 1M-token model should keep weeks of a project's conversation verbatim; a 64k model should compact early. Every threshold is a share of the connection's window, never a fixed token count:

| Window | Reserve for the answer | Prune old tool results at | Summarize history at | Recent history kept verbatim |
|---|---|---|---|---|
| ≤ 64k | 15% | 60% | 75% | 25% |
| 64k–256k | 10% | 70% | 82% | 35% |
| 256k–1M+ | 6% | 80% | 90% | 50% |

- **Prompt-cache friendly order:** a stable prefix (system rules, skill catalog, library reference, pinned skill bodies) never changes between steps; the conversation is appended in order; live project state goes last. Providers that cache prefixes then reuse most of a long prompt, so a large context stays fast and cheap; compaction rewrites only the middle of the prompt, never the prefix.
- **Layered, not destructive:** pruning first shortens old tool results and drops old pictures (kept as their attachment ids, re-readable with tools); only then are the oldest messages folded into a summary, and later summaries fold into the previous one. Each layer is stored, so a summary can be expanded again with a `recall_history(range)` tool when the window allows.
- **Measured, not guessed:** prompt size comes from the provider's reported usage of the previous call plus an estimate of what was added since; the learned window shrinks after an overflow and the next call retries once after compacting.
- **Per-connection setting:** the person can set the window in Settings › AI models; the default stays conservative until a connection reports it.

## 8. Hooks

Hooks let the engine and, later, extensions react at fixed points of the copilot's life, the way established agent harnesses do.

- **Points:** `turn_start` (before the model sees a message), `before_tool` (a call about to run, with its validated arguments), `after_tool` (its result), `before_propose`, `before_apply`, `turn_end`, `before_compact`, `task_finished`.
- **Engine hooks** are Python callables registered by engine modules (reviewed code in this repository). The design checks, the placement checks, grounding and the ask-mode permission rule move onto these points so they are explicit and ordered instead of scattered through the loop.
- **Declarative hooks** (data, shippable in bundles) can only do a fixed set of actions: add context to the turn (a note or a skill to load), block a tool call with a reason the model sees, require the person's approval for a call, post a suggestion or button, or run one of the engine's built-in checks. They match on the hook point, tool name and simple conditions over the event (for example "before_apply when the change removes a reward term → require approval"). They never run code or reach the network.
- **Order and failures:** engine hooks run first, then declarative ones in install order; a hook that fails is skipped and reported as a step, never a crash; a block from any hook wins.
- Every hook decision is published as an event, so the person can see why something was blocked or added.

## 9. Extensions without code

Community extension is declarative so that sharing never runs foreign code:

| Extension kind | What it carries | Validated against |
|---|---|---|
| Skill | Markdown procedure + front matter | skill schema, tool names |
| Template | a project as edit operations | library + contract versions |
| Library piece | a preset object (components with values) | library components and ranges |
| Look pack | palettes, sky presets, materials | sky and material schemas |
| Reward recipe | a named composition of existing reward terms with weights | reward term catalog |
| Hook | a declarative hook (§8): point, match, action | hook points, tools, actions |

All ship inside the existing bundle format (`BundleManifest`), validated on import, versioned, removable. New physics, new reward term implementations or new sensors stay engine code reviewed in this repository; an extension can only combine what the library already defines. Code plugins are out of scope: they would need a sandbox and would break the bundle invariant.

## 10. Build order

1. Contract task: `EngineEventEnvelope` + `EngineEvent` union, `TaskInfo`.
2. Event bus and `/events` SSE; copilot, tasks, training and projects publish; the desktop shows live steps.
3. Task registry; autopilot, diagnosis, ideas and builds become tasks; `tasks` tool.
4. Hooks: engine hooks for the existing checks, then declarative hooks.
5. Skills: loader, validation, `use_skill`, prompt catalog, checklists; the first eight built-in skills written and tested with the fake provider, then measured with the real model on the beginner scenarios (walker, race, parking).
6. Subagents: `delegate`, `message_task`, `task_result`, chat threads.
7. Memory and `remember`/`recall`; comparison tools.
8. Extension kinds in bundles (with the community sprint).

## 11. Testing

Every event kind has a test that the owning module publishes it; the SSE endpoint is tested with the existing TestClient streaming pattern; skills are tested by loading every built-in skill and by fake-provider turns that call `use_skill` and follow its checklist; memory is tested for scoping, sources and deletion. No test touches the network.
