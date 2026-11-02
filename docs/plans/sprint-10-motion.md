# Sprint 10 · Motion from a reference video

**Goal:** a person brings a dance video, Icarus tracks the dancer frame by frame, maps the pose onto a physical humanoid, trains it to reproduce the motion under physics with the same PPO trainer, shows honestly how close it gets (match per moment and per body part), and exports the physics result as an animation.

**Spec:** `VISION.md` › Motion from reference; `docs/architecture.md` › Motion (pose capability → retarget → imitation task family → export), Simulation (task families), Copilot (capabilities); `docs/design/screens.md` › `SCR-MOTION`, `PNL-MOTION-COMPARE`, `PNL-CLIP-TIMELINE`, `MOD-MOTION-VIDEO`, `MOD-MOTION-TRACKING`, `MOD-MOTION-TRAIN`, `STA-MOTION-TRAINING`, `MOD-EXPORT-ANIMATION`; reference renders with the same names in `docs/design/reference/`.

**Depends on:** Sprint 9's dance-ready humanoid (three-axis shoulders and hips) and its skin and glTF writing.

## What exists today

- **Engine.** No `icarus/motion/` package. `Capability` already lists `pose`, but nothing calls it. `TaskFamily` is `none | navigation | locomotion`; there is no imitation family, no tracking reward terms and no clip in the project document. The humanoid has 12 single-axis hinges. Chat attachments already accept video as still frames sampled by the desktop (`features/copilot/attachment-reading.ts`, `video-frames.ts`) and stored per project.
- **Desktop.** `features/motion-studio/` renders every dialog and panel from fixtures; every method of `motion-port.ts` is `pending` (Sprint 10). The Motion workspace tab appears only for character projects with clips.

## Gaps against the design

| Design | Gap |
|---|---|
| `MOD-MOTION-VIDEO` upload, link, webcam, file facts, *people found*, trim, who to copy, copy onto | No intake, no person detection, no multi-person choice, no target body choice |
| "The video stays on your computer, only the pose is used" | True only with a local pose estimator; false if frames go to a model provider |
| `MOD-MOTION-TRACKING` live frame with skeleton, steps find, track, map, physics check | No pose pipeline, no retargeting, no events |
| `PNL-MOTION-COMPARE` reference with skeleton beside the physics character, overlay | No video playback with keypoints, no imitation rollouts |
| `PNL-CLIP-TIMELINE` pose strip, match curve, weakest moment, range selection | No per-frame tracking error |
| `TAB-MATCH-SCORE` match per body part | No per-joint error |
| `MOD-MOTION-TRAIN` steps, copies, focus on the weakest moment, estimate | No imitation family, no segment-weighted starts |
| `STA-MOTION-TRAINING` match before and now, hard moment | No imitation evaluation at checkpoints |
| `MOD-EXPORT-ANIMATION` glTF, FBX, BVH, physics result, root motion, loop, target rig | No exporter |

## Building blocks

### Pose estimation (the `pose` capability)

| Option | Output | License | Size and runtime | Fit |
|---|---|---|---|---|
| **MediaPipe Pose Landmarker** (`mediapipe` Python package) | 33 landmarks per person, image coordinates **and 3D world coordinates in meters** centered on the hips, visibility per landmark; video mode tracks between frames; `num_poses` for several people | Apache-2.0 (package and BlazePose GHUM 3D models) | Wheel 24.5 MB on Windows (42.7 MB Linux, 39 MB macOS arm); pulls `opencv-contrib-python`, `matplotlib`, `sounddevice`; models lite, full, heavy (heavy about 26 to 29 MB) downloaded once | **Chosen.** 3D world landmarks remove the hardest step (lifting 2D to 3D) and run on CPU. No macOS x86-64 wheel is listed. |
| RTMPose / RTMW3D through `rtmlib` | 17, 26 or 133 2D keypoints; RTMW3D adds 3D | Apache-2.0 | `onnxruntime` plus OpenCV; needs a separate person detector (YOLOX or RTMDet); models downloaded at runtime from OpenMMLab or Hugging Face | Fallback if MediaPipe cannot ship on a platform; two models and 2D-first output make retargeting harder |
| MoveNet | 17 2D keypoints, one or several people | Apache-2.0 | TensorFlow Lite runtime | Not chosen: 2D only, no world coordinates |
| OpenAI-compatible vision model through `client.py` | Text answers about the frame | per provider | one call per frame, network latency, frames leave the computer | Not used for keypoints: general vision-language models outline a body roughly but do not localize keypoints precisely or consistently from frame to frame. Used for what they are good at: describing the people found ("person on the left leaves at 0:08"), naming the dance, and reading the comparison frames for the coach. |

**Decision:** the `pose` capability gets a built-in **local** provider (MediaPipe) next to the OpenAI-compatible connection kind, still called only through `copilot/client.py`. This keeps "all model calls go through the client" and makes the privacy note true. Recorded as an ADR; architecture › Open decisions item 2 closes with it.

### Video frames

Frames are sampled by the desktop the way chat attachments already are (the renderer seeks the video element and encodes each still as a 640 px JPEG), at the clip rate (30 fps, up to 20 s, trimmed first), and uploaded in batches. The engine needs no video decoder. Webcam recording uses the renderer's `MediaRecorder`; the recorded file then goes through the same sampler. **Paste a link** downloads only direct video file URLs (no site scraping); see approvals.

### Retargeting (no SMPL)

SMPL and SMPL-X body models are not used: their licenses restrict commercial use, and they are not needed. Retargeting is joint-angle based on the target MuJoCo body:

1. **Clean the track:** drop low-visibility landmarks, fill short gaps by interpolation, smooth with a One-Euro filter (numpy, a few lines).
2. **Scale:** bone lengths from the track's world landmarks are scaled to the target body's segment lengths (inspector *Body height 1.72 m → 1.72 m*).
3. **Solve joint angles per frame** with damped least-squares inverse kinematics on the compiled MuJoCo model: sites on the body (shoulders, elbows, wrists, hips, knees, ankles, head) are pulled toward the scaled landmarks using `mujoco.mj_jacSite`, joint limits clamp the result, the previous frame warm-starts the next. No new dependency; `mink` (Apache-2.0) is a documented alternative if constraints grow.
4. **Root:** height from the lowest foot on the floor (*Feet on floor* switch), yaw from the hip line, horizontal motion from the hip midpoint in the image scaled by body height (*Include root motion*).
5. **Kinematic check:** replay the clip without physics and report joint-limit clamps, self-intersections and foot sliding; this is the "physics check" step of `MOD-MOTION-TRACKING`.

### Imitation (DeepMimic-style, same PPO trainer)

- New task family `imitation` in the library. Observation: the body's sensors and joint state plus the clip phase (sine, cosine) and the next reference pose. Action: position-motor targets as offsets added to the reference joint angles, which lets PPO start from "follow the clip" instead of from random flailing.
- Reward terms (library, each with weight ranges and a version), following DeepMimic (Peng et al., SIGGRAPH 2018): `track_pose` (exp of joint angle error, default weight 0.65), `track_velocity` (0.1), `track_end_effectors` (hands and feet positions, 0.15), `track_root` (center of mass, 0.1).
- **Reference state initialization:** every episode starts at a random moment of the clip in the reference pose; *Focus on the weakest moment* weights those starts toward the selected range. **Early termination** when the body falls or drifts too far from the reference.
- **Balance help** (Low, Medium, High) widens the termination tolerance and adds a curriculum on clip speed; no hidden forces act on the body, so the exported motion is always pure physics.
- **Match score:** per frame, `100 × exp(−k × mean joint angle error)` from deterministic evaluation episodes at each checkpoint; per part from that part's joints; the weakest moment is the lowest-match window. All from real rollouts in `runs/`.

### Export

- **glTF** (`.glb`) with the body's skeleton and one animation, written with `pygltflib` (MIT, added in Sprint 9); the imported skin is included when the body has one.
- **BVH**: plain text, written directly.
- **FBX is not offered**: no permissive writer exists (Autodesk's SDK is proprietary). The format tab says not available yet.
- *Use the physics result* exports the best checkpoint's evaluation rollout; off exports the retargeted clip. *Loop* blends the last half second into the first. Named target rigs (for example game-platform skeletons) come after the first version; the first version exports the Icarus skeleton with standard bone names.

## Contract changes (land first, alone)

- `contracts/motion.py`: `MotionVideo { id, file_name, duration_s, fps, width, height, frames, trim }`, `PersonTrack { person, frames: list[PoseFrame] }` with `PoseFrame { t, landmarks: list[Landmark], world: list[Landmark], visibility }`, `PeopleFound`, `RetargetSettings { match_height, arms: auto|manual, feet_on_floor, root_motion }`, `MotionClip { id, video, person, body, fps, joint_names, frames: list[list[float]], root: list[RootPose], confidence: list[float], kinematic_issues }`, `TrackingStatus` (task progress with the current frame index and its landmarks), `ImitationMetrics { match, match_by_frame, match_by_part, weakest: FrameRange }`, `AnimationExportRequest { format: glb|bvh, physics: bool, root_motion: bool, loop: bool }`.
- `TaskFamily` adds `imitation`; `TaskSpec.motion: MotionTaskSpec | None` (`clip` id, `focus: FrameRange | None`, `balance_help`).
- Edit operations `set_motion_clip`, `set_motion_focus`, `set_retarget_setting`. Clips are immutable and content-addressed under `projects/<id>/motion/`; a run copies its clip into `runs/<id>/clip.json` so it stays reproducible.
- `MetricPoint` carries `ImitationMetrics` for imitation runs.
- `CapabilityConnection` gains `kind: Literal["openai", "local"]` (local only allowed for `pose`).

## Engine tasks, in order

1. `motion/video.py` and `api/motion.py`: create a video, upload frame batches, trim, list people (first-frame detection with `num_poses` up to 4, plus a short description from the vision capability when configured).
2. `copilot/client.py` local pose provider: lazy import of MediaPipe at the point of use, model file resolved from the user data folder with a checksum, clear error when it is missing.
3. `motion/tracking.py`: background task over all frames, publishing progress with the current landmarks for the live preview; keeps the chosen person by identity across frames.
4. `motion/retarget.py`: cleaning, scaling, IK per frame, root, kinematic check → `MotionClip`.
5. Library `imitation` family, the four tracking terms, reference state initialization and early termination in `sim/` (reference pose at reset, phase in the observation, residual actions).
6. `training/`: imitation evaluation at checkpoints producing `ImitationMetrics`; focus range weighting; warm start between focus runs.
7. `motion/export.py`: glTF and BVH from a rollout or a clip; `GET /projects/{id}/motion/clips/{clip}/export`.
8. Copilot: a `motion` tool (track a video attachment onto a body, report found people and kinematic issues), imitation diagnosis in the coach (weakest moment, failing parts from `match_by_part`), chips *Train the spin* (focus range), *Slow it down* (retime operation), *Loop it* (export option). A built-in skill "copying a motion from video".

## Desktop tasks, in order

1. `MOD-MOTION-VIDEO`: upload and webcam on the engine, trim handles, who to copy from `PeopleFound`, copy onto the humanoid or an imported character (Sprint 9).
2. `MOD-MOTION-TRACKING`: live frame with landmarks, steps, background and see result.
3. `PNL-MOTION-COMPARE`: the reference frames with the drawn skeleton beside the physics character replaying the best rollout from the engine; overlay with the camera from the track; speed 0.5× and 1× on a shared clock.
4. `PNL-CLIP-TIMELINE` and `TAB-MATCH-SCORE` from `ImitationMetrics`; range selection emits `set_motion_focus`.
5. `MOD-MOTION-TRAIN` and `STA-MOTION-TRAINING` on the existing run API with the imitation family; *Train copy* in the header.
6. `MOD-EXPORT-ANIMATION` with glTF and BVH, FBX shown as not available yet, save dialog through the main process.
7. Replace every `pending` in `motion-port.ts`.

## Tests

- Engine, offline and deterministic: a synthetic `PersonTrack` generated from the humanoid's own forward kinematics retargets back to the same joint angles within tolerance; smoothing keeps a step response bounded; the kinematic check flags a pose beyond a joint limit; the imitation env passes `check_env` and its reward peaks when the body follows the reference exactly; export round-trips (a written glb reloads with the same frame count and bone names; BVH parses back to the same channels). The local pose provider is replaced by a fixture provider in tests; a `live` test runs MediaPipe on one bundled frame only if the model file is present, and is reported as not run otherwise.
- Slow: a two-second arm-wave clip trains to a match above the untrained baseline in a short run.
- Desktop: dialogs in loading, empty, error and engine-down states; timeline range selection emits one operation.

## Demo

Drop a short dance clip, pick the person on the left, watch the skeleton track every frame and land on the humanoid, see the first match on the timeline, train focusing on the weakest moment, watch the match rise checkpoint by checkpoint, export a `.glb` and open it in a 3D tool.

## Risks

- **Training time on CPU.** DeepMimic-style imitation of dynamic motions usually needs tens of millions of steps. Residual actions, reference state initialization, short clips (5 to 12 s) and focus runs are the mitigations; the estimate shown before training comes from measured throughput on this machine, and the match is reported as it is, never rounded up.
- **Monocular depth.** World landmarks are estimated; spins and occlusions produce wrong limb depth. The kinematic check flags frames, and the confidence per frame lowers their weight in the reward.
- **Root motion from one camera** is approximate; *Include root motion* can be turned off.
- **Platform coverage.** No MediaPipe wheel for macOS on Intel; those machines need the RTMPose fallback or cannot track locally, and the dialog says so.
- **MediaPipe pulls OpenCV and matplotlib** into the engine environment (tens of MB).

## Needs the maintainer's approval

- New dependency `mediapipe` (Apache-2.0) and its transitive `opencv-contrib-python`, `matplotlib`, `sounddevice`; pin a release older than the dependency age policy (1.2.0 was published on 2026-10-27; 1.1.1 on 2026-10-14).
- Downloading the pose model file (lite or full, a few MB; heavy about 26 to 29 MB) on first use from Google's model storage, or shipping it with the installer.
- The ADR for a local provider kind on the `pose` capability.
- *Paste a link*: limited to direct video file URLs, or removed; downloading from video sites raises terms-of-service and copyright questions.
- Dropping FBX export and named target rigs from the first version.
- A demo video the maintainer has the rights to show.

## Sources

- MediaPipe Pose Landmarker (33 landmarks, world coordinates in meters, video mode, `num_poses`): https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker and https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/python
- `mediapipe` on PyPI (Apache-2.0, versions, wheel sizes, platforms): https://pypi.org/project/mediapipe/
- BlazePose GHUM 3D model card (Apache-2.0, heavy about 26 MB): https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- rtmlib (Apache-2.0, RTMPose, RTMW3D, runtime model downloads): https://github.com/Tau-J/rtmlib
- Vision-language models and keypoints: GPT-4o image generation report (coarse pose, no precise keypoint localization), https://arxiv.org/pdf/2505.05501; LLaVA-Pose, https://arxiv.org/abs/2506.21317
- DeepMimic (Peng et al., ACM TOG / SIGGRAPH 2018): https://xbpeng.github.io/projects/DeepMimic/index.html
- mink, differential IK on MuJoCo (Apache-2.0): https://github.com/kevinzakka/mink
