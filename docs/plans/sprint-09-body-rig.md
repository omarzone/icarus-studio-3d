# Sprint 9 · Body workspace: rig, import and auto-rig

**Goal:** any body can be edited bone by bone, and a character model someone brings (a `.glb` dancer, a robot description) becomes a physical body that compiles, stands and trains, with the imported mesh drawn as its skin. The copilot can do every step from a sentence ("here is my character, make it stand") and repairs a body whose checks fail.

**Spec:** `VISION.md` › Generated, but always physically real (the skin can look like anything, the body that trains is the physical one underneath); `docs/architecture.md` › Library, Objects and components, Design compilation and tests; `docs/design/screens.md` › `SCR-BODY`, `TAB-RIG-VIEW`, `TAB-MESH-VIEW`, `PNL-RIG-CHECK`, `MOD-IMPORT`, `MOD-AUTO-RIG`, `STA-BODY-CHECK-FAILED`; reference renders `docs/design/reference/SCR-BODY.png`, `MOD-IMPORT.png`, `MOD-AUTO-RIG.png`.

## What exists today

- **Engine.** Bodies are trees of objects built from parametric primitives (`Mesh.shape`: box, sphere, capsule, cylinder, plane) with `joint` (hinge, slide, ball, fixed; limits capped at ±180°), `motor` (position or torque, `max_force`, `gear`), `collider`, `physics_body` and sense components (`library/components.py`). `design/compiler.py` turns them into MJCF with inertias from geometry. `design/checks.py` runs structure, compiles, settles, actuators and sensors checks, and the store rejects any batch whose report fails. Templates include a walker and a humanoid with 12 position motors; every humanoid joint is a single hinge about Y, so arms only swing forward and back.
- **No meshes anywhere.** `SceneGeom.shape` is primitive only, `assets/` does not exist, the `asset` property type is declared but unused, and there is no file intake route for models.
- **Desktop.** `features/body-studio/` has the screen, the rig explorer (selecting a part drives the inspector: joint type, two-thumb range, damping, motor strength), `TAB-BODY-PARTS` and `TAB-RIG-CHECK` mapped from the real `DesignReport` (`body-engine.ts`: `getRigCheck`, `getParts`). Everything else in `body-port.ts` is `pending` (applyPose, fixProblems, weights, import, auto-rig). `rig-tab.tsx` and `mesh-tab.tsx` do not exist.

## Gaps against the design

| Design | Gap |
|---|---|
| `TAB-RIG-VIEW` see-through body with bones, joints and colliders; drag joint limits | No bone or collider overlay, no limit handles |
| `TAB-MESH-VIEW` shaded imported mesh, paint weights | No mesh assets, no skinning, no paint tool |
| Toolbar Import, Auto-rig, Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose | Only selection works; no tool modes emit operations |
| `MOD-IMPORT` file, preview (triangles, height, *Humanoid detected*), *Import as static mesh*, *Import and auto-rig* | No file picker, no reader, no shape detection, no routes |
| `MOD-AUTO-RIG` steps read, detect shape, place bones, estimate masses and motors, stand-up test | No pipeline, no background task |
| `PNL-RIG-CHECK` stands for 5 s, colliders, anatomical ranges; click to select the part | Only rest stability; a falling humanoid passes; checks carry no object id |
| `TAB-POSE-TEST` T-pose, A-pose, frame from video | No pose presets in the engine |
| `TAB-WEIGHTS` coverage per bone, auto-fix | No skin data |
| `STA-BODY-CHECK-FAILED` amber banner, *Fix both for me* | A failing body can never exist because the store rejects it |
| Inspector: motor speed, mass with *auto*, collider shape per bone | No velocity limit; no auto mass; collider shape lives on `Mesh` |
| Humanoid able to dance (Sprint 10 needs it) | 12 single-axis hinges; no shoulder, hip or spine twist |

## Decisions

1. **Physical body under a visual skin.** An imported mesh never collides or carries mass. Auto-rig builds a tree of library parts (capsules and boxes fitted to the mesh) with library joints and motors; the mesh is drawn on top, skinned to those parts. This keeps the vision rule and every existing check, compiler and trainer unchanged.
2. **A failing auto-rig is a candidate, not a revision.** The auto-rig task produces a proposal (the same blue preview the copilot uses, `STA-WORLD-PROPOSAL`) with its own `DesignReport`. `STA-BODY-CHECK-FAILED` shows that candidate. *Fix both for me* runs the copilot repair on the candidate; only a passing candidate is applied as a revision. The invariant "every revision passes the design tests" stays intact. Recorded as an ADR.
3. **glTF 2.0 first.** `.glb` and `.gltf` (with skins), `.obj` and `.stl` as static meshes. URDF and MJCF robots load through MuJoCo itself (`mujoco.MjSpec`), no extra parser. **FBX is not offered** in the first version: the only complete reader is Autodesk's proprietary FBX SDK, and Assimp needs a native build per platform. The dialog says FBX is not available yet and suggests exporting `.glb`.
4. **Auto-rig places bones from what the file already knows, then from sight.** If the file has a skeleton (most character exports do), bones are matched to the canonical humanoid by name and position. If it has none, the mesh is rendered offscreen from the front and side and the Sprint 10 pose estimator finds the 33 body landmarks on those renders; bones go between them. Non-humanoid meshes without a skeleton import as static meshes and the copilot says so.
5. **Dance-ready humanoid.** The humanoid template and auto-rig output use three hinges for shoulders and hips, two for the spine and neck, one for elbows, knees and ankles (about 24 motors). Ball joints stay unactuated because MuJoCo position actuators need a single axis.

## Building blocks

| Block | What it does | License | Size | New? |
|---|---|---|---|---|
| `trimesh` 5.x | Load GLB, glTF, OBJ, STL; triangles, bounds, volume, convex hull, sampling | MIT | 0.75 MB wheel, needs only numpy | **New** |
| `pygltflib` 1.16 | Read glTF skins (joints, inverse bind matrices, `JOINTS_0`/`WEIGHTS_0`) and write glTF (Sprint 10 export) | MIT | pure Python, small | **New** |
| `coacd` 1.0 | Approximate convex decomposition, only for static environment meshes imported into a world | MIT | 1.5 MB (Windows) to 3.4 MB (macOS arm) wheels | **New, optional** (environment import only; no macOS x86-64 wheel listed) |
| MuJoCo `MjSpec` | Read MJCF and URDF robots into a spec we convert to objects | Apache-2.0 | already installed | no |
| MuJoCo mesh geoms | Collide meshes through their convex hull; used for static world meshes | Apache-2.0 | already installed | no |
| three.js `GLTFLoader`, `SkinnedMesh` | Draw the skin in the renderer, bones driven by engine part poses | MIT | already in the desktop | no |
| Pose estimator (Sprint 10) | Landmarks on renders of a mesh without skeleton | see Sprint 10 | — | shared |

## Contract changes (land first, alone)

- `contracts/assets.py`: `ProjectAsset { id, kind: Literal["model", "environment", "robot"], file_name, sha256, bytes, triangles, height_m, detected: Literal["humanoid", "quadruped", "robot", "object", "unknown"], has_skeleton, bone_names }`. Assets live in `projects/<id>/assets/<asset-id>.<ext>`, immutable and content-addressed so a run that froze a revision can find its skin.
- `BodySpec.skin: SkinSpec | None` with `asset`, `bind: list[BoneBinding]` (`bone`, `object` id, 4×4 bind offset) and `source_note` ("from dancer.glb").
- `SceneGeom` gains optional `mesh_asset`; `SceneDescription.skins: list[SceneSkin]` (asset URL, bone to body index, bind offsets). The renderer only applies engine-computed part poses to bones.
- `motor.max_speed` (rad/s, expert) and `physics_body.auto_mass: switch`.
- `DesignCheck` gains `object_ids: list[str]` and new check ids `stands`, `colliders`, `ranges`.
- `AutoRigStatus { task id, file, percent, steps: list[ProgressStep], report: DesignReport | None, proposal id | None }`, served through the existing background task registry (`tasks.py`).
- `PosePreset { id, label, joint_targets }` for `TAB-POSE-TEST`.
- New `EditOperation`s: `attach_skin`, `detach_skin`, `mirror_part` (copies a limb to the other side with mirrored axes and limits). Everything else (add part, joint, motor, collider) already exists as `create_object`, `add_component`, `set_property`.

## Engine tasks, in order

1. **Asset intake** (`projects/assets.py`, `api/assets.py`): `POST /projects/{id}/assets` (multipart, 100 MB cap, extension and magic-byte check), `GET` metadata and file. Reading with trimesh and pygltflib happens here; nothing in the file is executed (glTF extensions with scripts are ignored).
2. **Shape detection** (`design/shape_detect.py`): height, up axis, symmetry plane, skeleton presence; humanoid when a skeleton matches the canonical names or when the landmark pass (step 4) finds a full body.
3. **Canonical humanoid and anatomical ranges** (`library/anatomy.py`): 15 to 19 bones, per-bone joint axes and ranges (knee 0° to 150°, elbow 0° to 145°, shoulder three axes…), density 1000 kg/m³ scaled to a target mass, motor strength from mass, lever arm and gravity with a safety factor. Upgrade the `humanoid` template to this layout.
4. **Bone placement** (`design/autorig.py`): name matching for skinned files; otherwise offscreen front and side renders with `sim/views.py` and the pose estimator, triangulated to 3D landmarks. Fit a capsule per bone to the vertices most weighted to it (PCA axis, radius from the 80th percentile distance).
5. **Auto-rig task**: steps read file, detect shape, place bones and joints, estimate masses and motors, stand-up test, each published as a task event; cancel is cooperative. Result: a proposal plus report.
6. **New checks** (`design/checks.py`): `stands` (hold the rest pose with position motors for 5 s; fails with the time of the fall and the part that touched first), `colliders` (parts at the ends of limbs have colliders), `ranges` (joint ranges within anatomical limits for humanoid bones). Items carry object ids.
7. **Skin weights** (`design/skin_weights.py`): coverage per bone from the file's weights; auto-fix recomputes weights for vertices with none from distance to bone segments. Painting is a later step.
8. **Robot import**: MJCF and URDF through `MjSpec` into objects: primitive geoms become parts, mesh geoms become a skin plus fitted capsules, joints and actuators map to library components within their ranges, and anything outside the library is reported as not imported. The Sprint 11 fly body arrives through this path.
9. **Environment import**: a static mesh into the world, decomposed with CoACD when concave, as static colliders.
10. **Copilot**: an `autorig` tool on an imported asset, body repair from a failing report (existing `try` → `propose`), and the chips *Add hand colliders*, *Make it lighter*, *Stiffer knees* as ordinary operations. A built-in skill "making an imported character physical".

## Desktop tasks, in order

1. `MOD-IMPORT`: file picker and drop zone through the main process, upload, preview from the asset metadata, kind switch, *Import as static mesh* and *Import and auto-rig*; FBX shown as not available yet.
2. `MOD-AUTO-RIG`: progress from task events, run in background, cancel, see result.
3. `TAB-RIG-VIEW` (`rig-tab.tsx`): see-through skin, bones as lines between part origins, joint markers, collider wireframes, limit arcs with drag handles that emit `set_property` on `joint.limits`.
4. `TAB-MESH-VIEW` (`mesh-tab.tsx`): the shaded skin; weights heat map per selected bone.
5. Toolbar modes Bone, Joint, Motor, Sensor, Mirror, Collider, Weights, Test pose, each emitting operations.
6. `STA-BODY-CHECK-FAILED` on the candidate's report: banner, *Fix both for me*, *Show me* (selects and frames the part from `object_ids`).
7. `TAB-POSE-TEST` and `TAB-WEIGHTS` on the engine; replace the `pending` entries in `body-port.ts`.

## Tests

- Engine: a tiny skinned glTF generated in the test with pygltflib (no downloaded fixture) imports, auto-rigs into a body that compiles and passes `stands`; a mesh with no skeleton and no person in its renders imports as static only; a humanoid with a reversed knee fails `ranges` with the knee's object id; a falling body fails `stands` with a time; MJCF import of a two-link arm round-trips joints and limits; asset intake rejects a file whose extension and content disagree.
- Desktop: import dialog states (loading, unsupported format, upload error, engine down); limit drag emits one operation per release; candidate banner appears only for a failing report.
- Slow: the upgraded humanoid trains to stand with PPO in a short run.

## Demo

Drop a rigged humanoid `.glb` on the Body workspace, choose *Import and auto-rig*, watch the five steps, see the check fail on hands without colliders, press *Fix both for me*, then press Play and watch it stand under physics with its own skin.

## Risks

- Character files vary wildly (scale in centimeters, Y-up versus Z-up, A-pose versus T-pose, extra bones). Mitigation: normalize units and axes from bounds, map bones by name with a position check, show what was not mapped.
- Capsule bodies under a detailed skin can look off where the skin is far from the capsule (skirts, hair). The skin follows bones only; the check list says what is decoration.
- Stand-up with 24 position motors needs tuned gains; gains come from mass and are checked by `stands`.
- Auto-rig without a skeleton depends on the Sprint 10 pose estimator and therefore on its approval.

## Needs the maintainer's approval

- New dependencies: `trimesh` (MIT), `pygltflib` (MIT), and optionally `coacd` (MIT) for environment import.
- Dropping FBX from the supported formats until a permissive reader exists.
- A rigged character for the demo: it must have a license that allows showing it (for example a CC0 or CC-BY model); files with redistribution limits stay out of the repo.
- The ADR for candidate bodies (decision 2).

## Sources

- trimesh on PyPI (MIT, numpy only, GLB/OBJ/STL loading): https://pypi.org/project/trimesh/
- pygltflib on PyPI (MIT): https://pypi.org/project/pygltflib/
- CoACD on PyPI (MIT, wheels and sizes): https://pypi.org/project/coacd/
- MuJoCo XML reference (mesh assets, convex hull collisions): https://mujoco.readthedocs.io/en/stable/XMLreference.html
