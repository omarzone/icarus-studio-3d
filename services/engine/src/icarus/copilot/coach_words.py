from icarus.copilot.language import Language

# What the coach and the autopilot write themselves, in the person's language.
COACH_TEXTS: dict[str, dict[Language, str]] = {
    "fallback": {
        "en": "The coach could not finish its diagnosis ({reason}). What the run shows: {facts}",
        "es": "El entrenador no pudo terminar su diagnóstico ({reason}). Lo que muestra el entrenamiento: {facts}",
    },
    "no_findings": {"en": "nothing unusual yet", "es": "nada fuera de lo normal todavía"},
    "watch_training": {"en": "Watch training", "es": "Ver el entrenamiento"},
    "train_again": {"en": "Train again from the best brain", "es": "Entrenar desde el mejor cerebro"},
    "train_again_message": {
        "en": "Train again, continuing from the best brain so far",
        "es": "Entrena otra vez, continuando desde el mejor cerebro hasta ahora",
    },
    "stop_autopilot": {"en": "Stop autopilot", "es": "Detener piloto automático"},
    "stop_autopilot_message": {"en": "Stop the autopilot", "es": "Detén el piloto automático"},
    "started": {
        "en": "Autopilot on: I train until {goal} of the evaluation episodes succeed, with at most {iterations} runs "
        "and {minutes} minutes.",
        "es": "Piloto automático activado: entreno hasta que tenga éxito el {goal} de los episodios de evaluación, "
        "con un máximo de {iterations} entrenamientos y {minutes} minutos.",
    },
    "run_zero": {
        "en": "Round {iteration}: {name} trains from zero.",
        "es": "Ronda {iteration}: {name} entrena desde cero.",
    },
    "run_warm": {
        "en": "Round {iteration}: {name} continues from the best brain of {source}.",
        "es": "Ronda {iteration}: {name} continúa desde el mejor cerebro de {source}.",
    },
    "flagged": {"en": "I stopped {name} because {why}.", "es": "Detuve {name} porque {why}."},
    "held": {"en": "{name} reached the goal and held it.", "es": "{name} alcanzó la meta y la mantuvo."},
    "applied": {
        "en": "I applied the coach's fix “{summary}” as revision {revision}.",
        "es": "Apliqué el arreglo del entrenador “{summary}” como revisión {revision}.",
    },
    "waiting": {
        "en": "The coach proposes “{summary}”. Apply it and I will continue training.",
        "es": "El entrenador propone “{summary}”. Aplícalo y seguiré entrenando.",
    },
    "discarded": {
        "en": "The proposal was not applied, so the autopilot stopped.",
        "es": "La propuesta no se aplicó, así que el piloto automático se detuvo.",
    },
    "no_fix": {
        "en": "The coach found no fix to try, so I keep training the same design.",
        "es": "El entrenador no encontró un arreglo para probar, así que sigo entrenando el mismo diseño.",
    },
    "compared": {
        "en": "{name} succeeded in {new} of the evaluation episodes and {previous} in {old}, on the same seeds; the "
        "best brain is {best}'s.",
        "es": "{name} tuvo éxito en el {new} de los episodios de evaluación y {previous} en el {old}, con las mismas "
        "semillas; el mejor cerebro es el de {best}.",
    },
    "done": {
        "en": "Done: {best} holds the goal with {success} of the episodes.",
        "es": "Listo: {best} mantiene la meta con el {success} de los episodios.",
    },
    "budget": {
        "en": "The autopilot used its budget ({why}). The best brain is {best}'s, with {success} of the episodes.",
        "es": "El piloto automático agotó su presupuesto ({why}). El mejor cerebro es el de {best}, con el {success} "
        "de los episodios.",
    },
    "budget_runs": {"en": "all its runs", "es": "todos sus entrenamientos"},
    "budget_minutes": {"en": "its minutes", "es": "sus minutos"},
    "nothing_best": {"en": "none yet", "es": "ninguno todavía"},
    "stopped": {"en": "The autopilot stopped.", "es": "El piloto automático se detuvo."},
    "failed": {"en": "The autopilot stopped: {reason}", "es": "El piloto automático se detuvo: {reason}"},
}

RULE_WORDS: dict[str, dict[Language, str]] = {
    "stalled": {"en": "it stopped improving", "es": "dejó de mejorar"},
    "reward_hacking": {
        "en": "it collects reward without succeeding at the task",
        "es": "acumula recompensa sin cumplir la tarea",
    },
    "instant_failures": {
        "en": "its episodes end in the first second",
        "es": "sus episodios terminan en el primer segundo",
    },
    "goal_held": {"en": "it held the goal", "es": "mantuvo la meta"},
}


def coach_said(key: str, language: Language, **values: object) -> str:
    return COACH_TEXTS[key][language].format(**values)


def percent(share: float | None, language: Language) -> str:
    if share is None:
        return "—"
    return f"{share * 100:.0f}%" if language == "en" else f"{share * 100:.0f} %"
