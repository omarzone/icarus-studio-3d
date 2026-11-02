# Sprint 11 · A real fly brain in a fly body

**Goal:** a project can use a published wiring map of a real nervous system as its brain. The fruit fly's whole-brain connectome runs as a spiking network inside a MuJoCo fly body, with no training: its sensory neurons receive the body's senses, its descending and motor neurons drive the body, Icarus says exactly which neurons it could map and which stay silent, shows them firing live in Play, names the behaviors that come out, and compares them with recordings of real flies.

**Spec:** `VISION.md` › Brains that are learned, and brains copied from nature; `docs/architecture.md` › Library (connectomes), Brains (connectome), Play mode, Comparison with real behavior; `docs/design/screens.md` › `MOD-BRAIN-SOURCE`, `STA-BRAIN-CONNECTOME`, `PNL-BRAIN-ACTIVITY`, `SCR-PLAY` (artboard *PlayFly*), `STA-RESULTS-REFERENCE`, `PNL-REFERENCE-TESTS`, `PNL-REFERENCE-VIEW`, `PNL-REFERENCE-MATCH`; reference renders `STA-BRAIN-CONNECTOME.png`, `MOD-BRAIN-SOURCE.png`, `STA-RESULTS-REFERENCE.png`.

**Depends on:** Sprint 9's MJCF robot import (the fly body is an MJCF model with meshes).

## What exists today

- **Engine.** `BrainSpec` is `template`, `copies`, `seed`; every brain is a PPO policy or random actions (`sim/policy.py`, `Policy.act(observation)`). Play runs one brain in the API process at about 30 frames per second. No connectome data, no spiking simulator, no fly body, no taste or looming sense, no `BehaviorTest` or `ReferenceRecording` in the contract.
- **Desktop.** `features/brain-studio/source-dialog.tsx`, the brain activity panel and the reference results render from `fly-brain.fixture.ts` and `arena-walks.fixture.ts` in the prototype only. `brainPort.getSource`, `loadSource`, `getActivity`, `getBehaviors`, `getWiring` and `getReadings` are `pending` (Sprints 8 and 11).

## Gaps against the design

| Design | Gap |
|---|---|
| `MOD-BRAIN-SOURCE` learn, connectome (dataset card: 139,255 neurons, ~50 million synapses, open data, *Fits the fly body*), community; *How it connects* with matched share | No brain kinds, no connectome library entry, no mapping report, no operation to attach one |
| Explorer: body parts (legs, wings, eyes) and brain regions (visual system, central complex, descending neurons, motor map) | No fly body, no region objects |
| Inspector: neurons, synapses, model *leaky integrate & fire*, time step 0.1 ms, *Training: None · real wiring* | No connectome spec, no simulator settings |
| *Firing right now* card (looming detectors, turn left · DNa02, walking rhythm, grooming) with a plain caption | No simulator, no region activity stream |
| `TAB-BRAIN-ACTIVITY` neuron groups lit by activity, live | Same |
| `TAB-BEHAVIORS` walk, turn, groom with times | No behavior detection |
| `TAB-WIRING` senses map, motor map, fix unmatched | No mapping |
| Play tools Shadow and Scent, sugar in the world | Shadow and Scent exist as sense-derived tools; no taste sense, no food object, no looming feature |
| `STA-RESULTS-REFERENCE` open arena walk, looming shadow, grooming; recorded versus simulated, *close* or *off* | No `BehaviorTest`, no recordings, no runner |
| Chat: "Walks to sugar with a tripod gait", "Turns away from a looming shadow" | No copilot tools for connectome brains |

## The honest shape of the problem

- **The FlyWire whole-brain connectome (FAFB) covers the brain, not the ventral nerve cord.** The neurons that move the legs live in the nerve cord. The brain talks to it through about a thousand descending neurons, and it also holds some real motor neurons (proboscis, antennae, neck). So "motor neurons drive the leg joints" is not what the data supports. What Icarus does instead, and says on screen:
  - Descending neurons with known roles become **commands**: forward walking (P9, oDN1), backward walking (MDN), turning (left-right difference of DNa02), grooming (antennal grooming descending neurons), feeding (the proboscis motor neuron MN9, a real motor neuron in the brain).
  - A library **gait generator** (a tripod central pattern generator, untrained and fixed, in the style of NeuroMechFly v2's descending interface) turns those commands into leg joint targets. Grooming and proboscis extension are fixed motor programs triggered by their commands.
  - The Wiring tab and *How it connects* say exactly this: "the brain decides walk, turn, stop, groom and feed through N descending neurons; leg rhythm comes from the gait generator". The design's line "Motor neurons drive the leg and wing joints · 92% matched" is replaced by the real counts.
- **Sensory inputs are mapped at the level the body can compute**, and labelled as such: sugar on the legs and proboscis drives the sugar-sensing gustatory receptor neurons; a looming dark object in the eye cameras drives the looming-detector visual projection neurons (LC4, LPLC2), computed as an expansion feature, not from simulated photoreceptors; touch on the antennae drives Johnston's organ neurons. Everything else stays silent and is counted.
- **Nothing is trained.** The brain is the wiring with the published neuron model; the gait generator and the sense features are fixed library code with documented parameters.
- **A full brain-and-cord connectome (BANC, 2026) exists**; using it to replace the gait generator with real nerve-cord circuits is a later step, after its data license is confirmed and after it is shown to produce walking.

## Building blocks

| Block | What it is | License | Size | Use |
|---|---|---|---|---|
| **FlyWire FAFB v783** (Zenodo 10676866) | 139,255 proofread neurons; `proofread_connections_783.feather` (neuron pairs per neuropil with synapse counts and neurotransmitter predictions) | CC BY 4.0 (attribution required) | connections file 852 MB; full synapse table 9.5 GB (not needed) | Source of the wiring |
| **Shiu et al. model inputs** (`Completeness_783.csv`, `Connectivity_783.parquet`) | The neuron list and signed, weighted connectivity used by the published whole-brain LIF model (Nature, 2024) | Code MIT; data derived from FlyWire (CC BY 4.0) | 3.2 MB and 97 MB | Preferred preprocessing source: same weights the paper validated |
| **FlyWire annotations** (Schlegel et al., 2024) | Super class, cell class, cell type, side per neuron | CC BY 4.0 (supplement record) | tens of MB | Finding sensory, descending and motor neurons by type |
| **flybody** (MuJoCo fruit fly) | Anatomically detailed fly body: `fruitfly.xml`, meshes, adhesion actuators, eye cameras; its walking task has a 59-dimensional action | Apache-2.0 | a few MB of model and mesh assets | **Chosen body.** Only the MJCF and meshes are vendored; its training stack (dm_control, TensorFlow, Acme, Ray) is not used |
| NeuroMechFly v2 / FlyGym | Fly body with vision (ommatidia), olfaction, descending interface and CPG controllers; FlyGym 2.x (2026) | Apache-2.0 | package plus assets | Reference design for the gait generator and the descending interface; not a dependency |
| Spiking simulator | Leaky integrate-and-fire with the Shiu et al. parameters (membrane, threshold, reset, refractory period, synaptic time constant, delay, weight per synapse), event-driven sparse updates | ours | — | Written on `torch` sparse tensors (already installed through Stable-Baselines3) or numpy; Brian 2 is not added (CeCILL license, code generation at runtime) |

Preprocessing runs once on the maintainer's machine with a documented script and produces a compact library asset: `connectomes/flywire-783/` with `neurons.json` (id, region, class, type, side, neurotransmitter), `weights.npz` (CSR indices and signed float32 weights, roughly 30 to 60 MB) and `ATTRIBUTION.md`. The engine reads only that asset; it never parses the raw dataset. Reading feather or parquet happens only in the script (`pyarrow`, used outside the engine environment).

## Contract changes (land first, alone)

- `BrainSpec.kind: Literal["learned", "connectome"]` (default `learned`) and `BrainSpec.connectome: ConnectomeBrainSpec | None` (`dataset`, `version`, `time_step_ms`, `region_focus: list[str] | None`, `mapping_overrides`).
- `contracts/connectome.py`: `ConnectomeInfo` (library entry: name, species, neurons, synapses, license, citation, body it fits), `NeuronGroup` (region or class with counts), `MappingReport { senses: list[SenseMap], commands: list[CommandMap], motor: list[MotorMap], unmapped_by_class, matched_share }`, `BrainActivityFrame { t, regions: list[RegionActivity], top: list[NeuronRate], commands: dict[str, float] }`, `BehaviorEvent { kind: walk|turn|stop|groom|feed|escape, start, end, detail }`.
- `PlayFrame.brain: BrainActivityFrame | None`, sent only while a brain activity view subscribes.
- `contracts/reference.py`: `ReferenceRecording { id, title, species, measures: list[RecordedMeasure], source, license }`, `BehaviorTest { id, scenario, measure, recording }`, `BehaviorResult { test, recorded, simulated, verdict: close|off|not_run }`.
- Library components: `taste` (sense), `food` (world object with a sugar concentration), `gait_generator` (body controller with frequency and stride ranges).
- Edit operations `set_brain_source` and `map_neuron_group`.

## Engine tasks, in order

1. **Speed measurement first** (a one-day check recorded as an ADR): run the LIF on the full brain on this CPU with `dt = 0.1 ms` and report seconds of compute per simulated second. Play needs that number to choose between real time, slowed time (Play's *Slow* tool, shown honestly) or a region focus that simulates only neurons within a few synapses of mapped inputs and commands.
2. **Library asset** `connectomes/flywire-783` from the preprocessing script, with checksum, attribution and the neuron model parameters next to their citation.
3. **Simulator** (`sim/connectome.py`): state vectors for 139,255 neurons, spike queue for the synaptic delay, Poisson drive for stimulated sensory neurons, firing rates per neuron and per region over a sliding window. Deterministic with a seed.
4. **Correctness against the paper**: activating the sugar gustatory neurons makes MN9 fire, as Shiu et al. report. This is a regular test.
5. **Fly body**: vendor `flybody`'s `fruitfly.xml` and meshes with its license, import through Sprint 9's MJCF path as the library body "Fruit fly", check its time step and stability under our compiler and checks. Wings stay folded (flight needs fluid forces, not in this sprint) and the explorer says so.
6. **Senses**: `taste` from contacts with `food` objects on tarsi and proboscis; looming from the eye cameras rendered offscreen (expansion rate of dark regions, left and right); antennal touch from contacts.
7. **Gait generator** (`sim/gait.py`): tripod CPG with forward, turn and backward commands, joint targets for flybody's leg joints, plus fixed grooming and proboscis programs; parameters documented and unit tested.
8. **Mapping** (`library/connectome_mapping.py`): neuron types to senses and commands, the report with matched and unmapped counts by class.
9. **Connectome brain in Play**: a `ConnectomeBrain` stepping the network between control ticks; it runs in its own process next to the API (like the training worker) so a heavy simulation never blocks requests; frames carry `BrainActivityFrame`.
10. **Behavior detection** (`sim/behaviors.py`): walk, turn, stop, groom, feed from body state and commands, as `BehaviorEvent`s.
11. **Behavior tests**: scripted scenarios (open arena walk, looming shadow, sugar placed far away, antennal touch for grooming) measured against `ReferenceRecording`s; a test without a recording is *not run*.
12. **Copilot**: `inspect_brain` for connectome brains (mapping report, current activity, behaviors), *Play with it*, *Compare with real flies*, *Wire the antennas* as `map_neuron_group`. A built-in skill "running a connectome brain".

## Desktop tasks, in order

1. `MOD-BRAIN-SOURCE` on the engine: options from the library, dataset card with real counts and license, *How it connects* from the mapping report, *Load into the fly*.
2. `STA-BRAIN-CONNECTOME`: explorer with body parts and regions, inspector with wiring facts and simulation settings, *Training: None · real wiring*, toolbar Neurons, Connections, Regions, Senses map, Motor map.
3. `PNL-BRAIN-ACTIVITY`: regions as dot clusters lit by real rates, *● live* only while frames arrive; Behaviors and Wiring tabs.
4. Play (*PlayFly*): brain activity panel, Shadow and Scent tools on the fly's senses, place sugar.
5. `STA-RESULTS-REFERENCE` with the behavior tests, the side-by-side view and the match table; *not run* where no recording exists.
6. Replace the `pending` entries in `brain-port.ts` for Sprint 11 keys.

## Tests

- Simulator: a three-neuron chain fires in order with the configured delay; inhibition silences a target; same seed gives the same spikes; rates per region add up to the per-neuron rates.
- Correctness: sugar neuron stimulation activates MN9 on the real asset (marked `slow` if it takes longer than the default suite allows).
- Mapping: every command neuron type named in the library exists in the asset; the report counts match the asset.
- Gait: forward command produces a tripod phase pattern; turn command produces a yaw rate with the right sign in MuJoCo.
- Contract: a project with `kind: connectome` cannot start a training run; the API says why.
- Desktop: every connectome view in loading, empty, error and engine-down states.

## Demo

Open the Fruit fly project, choose *Load a connectome*, read how it connects (what is mapped, what stays silent), press Play, drop sugar away from the fly and watch it walk there while the descending neurons light up, cast a shadow from the right and watch it turn away, then open *Compare with real flies* and read which behaviors are close and which are off.

## Risks

- **Speed.** A full-brain LIF at 0.1 ms steps may run far slower than real time on CPU. Task 1 measures it before anything else; the fallback is slowed time or a region focus, both shown on screen.
- **Behavior may not appear.** The published model reproduces feeding and grooming circuit responses; walking toward food in a closed loop through a gait generator is not a published result. If the fly does not walk to sugar, the app shows what the neurons did and says it did not walk; nothing is scripted to make it look right.
- **Neuron identities.** Command neuron roles come from the literature (P9, oDN1, MDN, DNa02, MN9); each mapping is checked against the annotations by type before use, and uncertain ones are listed as unmapped.
- **Fly scale and stiffness.** A millimeter-scale body needs a small time step; flybody's own settings are kept and the cost is measured.
- **Recordings.** Behavior tests need real data with a license that allows redistribution of the derived numbers; without it the tests say *not run*.

## Needs the maintainer's approval

- Downloading FlyWire v783 data (the 97 MB Shiu et al. connectivity file and the 3.2 MB neuron list, or the 852 MB Zenodo connections file) and the annotations, once, for preprocessing.
- Shipping the derived connectome asset (about 30 to 60 MB) in the repository or installer, or downloading it on first use with a checksum; either way with CC BY 4.0 attribution visible in the app and in `assets/`.
- Vendoring flybody's model and meshes (Apache-2.0) under `assets/library/` with their license and notice.
- `pyarrow` for the preprocessing script only, kept out of the engine runtime.
- The ADR for the descending interface and gait generator (a fixed, untrained library controller between the brain and the legs) and for running the connectome brain in its own process.
- Which published recordings to use for behavior tests.

## Sources

- FlyWire Codex datasets and counts (FAFB v783: 139,255 neurons, 3,732,460 connections; BANC; MANC): https://codex.flywire.ai/api/download
- FlyWire v783 connectivity on Zenodo (CC BY 4.0, file sizes): https://zenodo.org/records/10676866
- Schlegel et al. supplemental files (CC BY 4.0): https://zenodo.org/records/10877326 and annotations https://github.com/flyconnectome/flywire_annotations
- Shiu et al., "A Drosophila computational brain model reveals sensorimotor processing", Nature 634, 2024: https://ideas.repec.org/a/nat/nature/v634y2024i8032d10.1038_s41586-024-07763-9.html; code (MIT, Brian 2, data files): https://github.com/philshiu/Drosophila_brain_model
- Reimplementation with PyTorch and other backends (data sizes for v783): https://github.com/eonsystemspbc/fly-brain
- flybody (Apache-2.0, MuJoCo fly, 59-dimensional walking action): https://github.com/TuragaLab/flybody; Vaxenburg et al., "Whole-body physics simulation of fruit fly locomotion", Nature 643, 2025: https://www.nature.com/nature-index/article/10.1038/s41586-025-09029-4
- NeuroMechFly v2 / FlyGym (Apache-2.0, descending interface, CPGs): https://github.com/NeLy-EPFL/flygym; Wang-Chen et al., Nature Methods 21, 2024: https://pubmed.ncbi.nlm.nih.gov/39533006/
- BANC brain and nerve cord connectome: https://blog.flywire.ai/?p=1823
- A connectome-driven fly body demonstration (FlyWire LIF model in a MuJoCo body): https://theinnermostloop.substack.com/p/the-first-multi-behavior-brain-upload
