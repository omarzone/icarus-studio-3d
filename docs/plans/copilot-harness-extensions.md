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

## 6. Extensions without code

Community extension is declarative so that sharing never runs foreign code:

| Extension kind | What it carries | Validated against |
|---|---|---|
| Skill | Markdown procedure + front matter | skill schema, tool names |
| Template | a project as edit operations | library + contract versions |
| Library piece | a preset object (components with values) | library components and ranges |
| Look pack | palettes, sky presets, materials | sky and material schemas |
| Reward recipe | a named composition of existing reward terms with weights | reward term catalog |
| Event hook | "when event X with condition Y, post this skill-driven suggestion" | event kinds, skills |

All ship inside the existing bundle format (`BundleManifest`), validated on import, versioned, removable. New physics, new reward term implementations or new sensors stay engine code reviewed in this repository; an extension can only combine what the library already defines. Code plugins are out of scope: they would need a sandbox and would break the bundle invariant.

## 7. Build order

1. Contract task: `EngineEventEnvelope` + `EngineEvent` union, `TaskInfo`.
2. Event bus and `/events` SSE; copilot, tasks, training and projects publish; the desktop shows live steps.
3. Task registry; autopilot, diagnosis, ideas and builds become tasks; `tasks` tool.
4. Skills: loader, validation, `use_skill`, prompt catalog, checklists; the first eight built-in skills written and tested with the fake provider, then measured with the real model on the beginner scenarios (walker, race, parking).
5. Memory and `remember`/`recall`; comparison tools.
6. Extension kinds in bundles (with the community sprint).

## 8. Testing

Every event kind has a test that the owning module publishes it; the SSE endpoint is tested with the existing TestClient streaming pattern; skills are tested by loading every built-in skill and by fake-provider turns that call `use_skill` and follow its checklist; memory is tested for scoping, sources and deletion. No test touches the network.
