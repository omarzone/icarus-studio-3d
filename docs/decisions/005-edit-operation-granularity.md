# 005 · Edit operation granularity

**Context.** Every change to a project, by hand or by the copilot, goes through edit operations, and the editor, the copilot and undo all depend on how fine they are. Operations named after each design idea (`set_joint_limits`, `set_surface_friction`, …) would multiply with every new library component.

**Decision.** Operations are generic over the object model: create, delete, rename and reparent an object; add and remove a component; set one property; add and remove a body; rename the project; set the task family, a reward term or the brain settings. Library schemas carry what each property means and its valid range, so new components need no new operations. One batch of operations is one revision: it is applied to a copy, validated, compiled and physically tested as a whole, and nothing is stored unless every check passes. A copilot proposal is one batch, so reverting it is one undo.

**Consequences.** The editor and the copilot speak the same small vocabulary, and the library grows without touching the contract. Rejection is all or nothing per batch, with the property path of every problem. Undo and redo move a head pointer over an append-only log; editing after an undo starts a new branch, and earlier revisions stay in the history.
