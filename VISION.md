# Vision

Icarus Studio 3D exists so that anyone, with or without a background in physics or machine learning, can imagine a creature or a robot, watch it learn to move in a real physics simulation, and take it into the real world.
It serves curious beginners who only want to describe an idea, and experts who want full control over every joint, sensor and reward, in the same studio.
It owns exactly one thing: the loop from an idea to a world, a body, a task and a trained brain, created, refined and shared as one living project.

## AI does the heavy lifting at every step

Icarus is built around an AI copilot that is present from the first sentence to the final export, not a feature bolted onto an editor.
The copilot designs worlds, bodies, sensors, rewards and brains from a conversation, then keeps refining them as you talk.
It watches training, looks at what the agent actually does, explains what went wrong and fixes it.
If removing the copilot would leave Icarus just as useful, the product has failed.
Changes that turn the copilot into decoration, or that require users to understand physics or reinforcement learning before they can get a result, work against the product.

## One studio for beginners and experts

Icarus is a full 3D editor with a viewport, a hierarchy, a properties panel and a play button, in the tradition of game and simulation studios.
The copilot works through the same edit operations as the editor, so everything it does is visible, undoable and editable by hand.
A beginner can build an entire experiment by talking; an expert can open any joint, actuator, sensor, reward term or network setting and change it directly.
Neither path is a simplified copy of the other.
Everything in a project, built-in or imported, is an object made of components with typed properties, so a car, a creature or a robot arm someone imported are all edited the same way.

## Play before you train

Any project can be played at any moment: the current brain runs live in its world and you can poke it, move things around, change the light, drop an object in its way and watch how it reacts and what it senses.
Play is the playground for someone who just wants to see a creature behave, and the quick test for someone tuning a design.
Nothing done in Play changes the project; what you learn there becomes a change only through the copilot or the editor.

## Generated, but always physically real

Icarus generates worlds, bodies, sensors, rewards and brains instead of asking users to model them.
Before building, it shows a few different ideas as real 3D previews with honest training estimates, so users choose by seeing rather than by reading.
Generated designs are assembled from a library of physical building blocks: rigid parts, joints, actuators, sensors, surfaces, reward terms and network templates.
Every design is compiled into a physics model and tested in simulation before it is shown: it must compile, stand still without exploding and respond to its actuators.
When a test fails, the copilot receives the failure and repairs the design.
A visual skin can make a creature look like anything, but the body that trains is always the physical one underneath.

## Learning is something you can watch

Every training run records real evaluation episodes at checkpoints, from the first random policy to the latest one.
The Training Timeline lets you scrub across those stages, play them back as a timelapse and compare any two of them in the same scene.
Every metric, curve and behavior on screen comes from a real simulation or training run, and nothing is animated by hand to look like learning.
When an agent fails to learn, Icarus shows that honestly and helps fix it.

## The copilot coaches, physics decides, the algorithm learns

The copilot can see: it reviews rendered episodes and learning curves, recognizes failures such as falling, spinning in place or exploiting the reward, and proposes concrete changes.
Its changes become a new revision of the project, which is validated, retrained and compared against the previous one.
Users choose whether the copilot iterates on its own within a budget or asks before every change.
The physics engine is the only source of physical truth, and the learning algorithm is the only thing that trains the brain.
The copilot never runs arbitrary code and never touches the simulator outside validated edit operations.

## Brains that are learned, and brains copied from nature

Most brains in Icarus are learned through practice.
A brain can also be a published wiring map of a real nervous system, such as a fruit fly's, placed in a physics model of its body and run without any training.
Icarus maps its sensory and motor neurons onto the body, says which ones it could not map, and measures the resulting behavior against recordings of the real animal.

## Motion from reference

Icarus can watch a reference video, extract the motion frame by frame and teach a physically simulated body to reproduce it.
The result is a motion that obeys physics, ready to be exported as an animation for games, engines and 3D tools.

## From simulation to the real world

Bodies can be designed against hardware profiles: real servos, motors, sensors and dimensions, or complete commercial robots.
Training varies physical properties, delays and sensor noise so that brains do not depend on a perfect simulation.
A project can be exported as a robot description, a portable trained policy, a parts list and a runtime that drives real hardware.
Icarus is honest about what is buildable and about the gap between simulation and reality.

## Create, share, remix

Icarus Community is where people publish worlds, bodies, brains, motions and complete projects, browse what others made and download it into their own studio.
Anything downloaded can be retrained, improved and published again, and every creation keeps its lineage.
A published project carries everything needed to reproduce it, and never carries executable code.
Creating and training work fully offline; the community is an online place to share, not a requirement to use Icarus.

## Reproducible by default

A project keeps the full history of its revisions, and every run is tied to the exact revision, seed and library versions that produced it.
Any result on screen can be traced back to the run that produced it.
Changing a reward or an environment creates a new revision instead of silently altering old results.

## Current decisions

The copilot designs through typed edit operations on the project rather than by writing files or code, because one edit model for humans and AI keeps every change visible, undoable and safe.
Generated designs are compiled to MuJoCo and tested before the user sees them, because a design that only looks right would break the promise that what you see is what trains.
Bodies are built from parametric rigid parts and joints rather than arbitrary meshes, because physics needs mass, inertia and articulation that a generated mesh does not have.
Policies are trained with PPO first, and motion imitation uses the same trainer with a tracking reward, because one robust algorithm across tasks keeps results predictable.
Rewards are composed from a library of tested reward terms with weights rather than free-form code, because composed rewards can be validated, explained and edited by hand.
The engine runs locally as a Python service with training in a separate process, because simulation, training and validation share one model of the world while the editor must stay responsive.
Models are configured by capability (reasoning, vision, image generation, pose estimation) behind an OpenAI-compatible connection, because the copilot's roles should not be tied to one model's quirks.
The desktop app starts and supervises the engine itself, because users should open one application, not manage a server.

This file records current product truth rather than a decision log, and Git history preserves decisions that are later replaced.

## Scope

Icarus Studio 3D is not a game engine for shipping games, a general CAD tool or a robot firmware toolkit, although its creations export to all three worlds.
It does not promise that every simulated brain will work on a physical robot, and it says when a design is not buildable.
Technical documents explain mechanics, but this file is authoritative when product direction conflicts with an older plan.
A change aligns when it lets the copilot do more of the hard work, makes experiments more real or more understandable, serves beginners and experts in the same flow, or makes creations easier to build and share.
A change should be resisted when it fakes or hides results, lets the copilot act outside validated operations, forces users to learn physics or machine learning to get started, or adds capability that does not belong to a world, a body, a brain or a project.
