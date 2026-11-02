from icarus.contracts.properties import ListValue, PropertyOption, PropertySchema
from icarus.contracts.specs import MAX_LAYERS, MAX_NEURONS, MAX_TRAINING_STEPS, MIN_NEURONS, MIN_TRAINING_STEPS
from icarus.contracts.training import MAX_COPIES
from icarus.library.properties import count, number, slider

# Ids are the fields of set_brain; "ppo." ones go in its ppo patch, "neurons" sizes every hidden layer.
BRAIN_SETTINGS: list[PropertySchema] = [
    number(
        "training_steps",
        "Steps",
        "steps",
        MIN_TRAINING_STEPS,
        MAX_TRAINING_STEPS,
        1_000_000,
        hint="Moments of practice in each run; left on auto, the task decides",
    ),
    slider(
        "copies",
        "Parallel copies",
        1,
        MAX_COPIES,
        1,
        16,
        hint="Copies of the world that practice at once; more finish sooner and use more of the computer",
    ),
    PropertySchema(
        id="algorithm",
        label="Method",
        type="list",
        options=[PropertyOption(value="ppo", label="PPO")],
        default=ListValue(type="list", value="ppo"),
        expert=True,
        hint="How the brain learns from its rewards",
    ),
    count("layers", "Hidden layers", 1, MAX_LAYERS, 2).model_copy(
        update={"expert": True, "hint": "Layers of neurons between what it senses and what it does"}
    ),
    slider(
        "neurons",
        "Neurons per layer",
        MIN_NEURONS,
        MAX_NEURONS,
        8,
        256,
        expert=True,
        hint="Bigger brains can learn more and train slower",
    ),
    number(
        "ppo.learning_rate",
        "Learning rate",
        "",
        1e-6,
        1e-2,
        3e-4,
        expert=True,
        hint="How far each update moves the brain; too high and learning jumps around",
    ),
    number(
        "ppo.n_steps",
        "Steps per update",
        "steps",
        64,
        8192,
        1024,
        expert=True,
        hint="Steps each copy practices before the brain updates",
    ),
    number(
        "ppo.batch_size",
        "Batch size",
        "steps",
        32,
        65_536,
        2048,
        expert=True,
        hint="Steps looked at together in each update; capped at what the copies collect",
    ),
    count("ppo.n_epochs", "Passes per update", 1, 50, 10).model_copy(
        update={"expert": True, "hint": "Times each update goes over what was collected"}
    ),
    number(
        "ppo.gamma",
        "Future discount",
        "",
        0.8,
        0.9999,
        0.99,
        expert=True,
        hint="How much later rewards count; closer to 1 plans further ahead",
    ),
    number(
        "ppo.gae_lambda",
        "Advantage smoothing",
        "",
        0.8,
        1.0,
        0.95,
        expert=True,
        hint="Trades steadier updates for less biased ones",
    ),
    number(
        "ppo.ent_coef",
        "Exploration bonus",
        "",
        0.0,
        0.1,
        0.0,
        expert=True,
        hint="Rewards trying varied actions; raise it when the brain settles too early",
    ),
]
