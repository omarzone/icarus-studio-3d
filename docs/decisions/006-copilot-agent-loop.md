# 006 · Copilot agent loop

**Context.** The chat copilot answered in one structured call: it could not look at the scene, check a change before proposing it, or read details it did not already have, so placement mistakes and invented values reached the person.

**Decision.** Chat turns run as an agent loop in `copilot/agent/`. Each step is one model call with native tools whose arguments are validated with Pydantic; invalid calls go back to the model as tool results. Tools are engine code: inspect, read runs and the library, render the scene with MuJoCo, try operations on a copy with the design tests, propose, apply, train. The autonomy mode decides what may write: ask mode proposes and offers a Train button, autopilot may apply and train. Budgets bound every turn, and the turn ends on a grounded `answer`. Roles that return one structured output keep `response_format`, and services that refuse tools get the single structured reply.

**Consequences.** Every proposal has passed a try, and the steps and renders behind an answer are stored on the message. A turn costs up to ten model calls and about 150 s at most. Starting training in ask mode becomes a button press. Live progress needs a later contract change.
