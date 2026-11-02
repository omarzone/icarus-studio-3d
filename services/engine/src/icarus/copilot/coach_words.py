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
    "moves": {"en": "The body moves", "es": "El cuerpo se mueve"},
    "still": {"en": "The body barely moves", "es": "El cuerpo apenas se mueve"},
    "ends_early": {"en": "Episodes end early", "es": "Los episodios terminan antes de tiempo"},
    "runs_full": {"en": "Episodes run their full time", "es": "Los episodios duran todo su tiempo"},
    "reward_ok": {"en": "The reward pays for the task", "es": "La recompensa paga por la tarea"},
    "looked": {
        "en": "Looked at {count} episode sheet(s) of step {step} with the vision model",
        "es": "Miré {count} hoja(s) de episodios del paso {step} con el modelo de visión",
    },
    "read_facts": {
        "en": "Read the facts of step {step} (no vision model connected)",
        "es": "Leí los datos del paso {step} (no hay modelo de visión conectado)",
    },
    "no_summary": {"en": "Nothing to add from this look.", "es": "Nada que añadir de esta revisión."},
    "fixing": {
        "en": "This blocks learning, so I am preparing a tested fix now instead of waiting.",
        "es": "Esto impide aprender, así que preparo ya un arreglo probado en vez de esperar.",
    },
    "early_title": {"en": "Early check · step {step}", "es": "Revisión temprana · paso {step}"},
    "look_title": {"en": "Coach look · step {step}", "es": "Revisión del entrenador · paso {step}"},
    "trial_start": {
        "en": "Short trial {letter}: {name} trains {steps} steps from the same brain ({what}).",
        "es": "Prueba corta {letter}: {name} entrena {steps} pasos desde el mismo cerebro ({what}).",
    },
    "trial_cold_start": {
        "en": "Short trial {letter}: {name} trains {steps} steps from zero ({what}).",
        "es": "Prueba corta {letter}: {name} entrena {steps} pasos desde cero ({what}).",
    },
    "trial_cold": {
        "en": "The fix changes what the body senses or drives, so the current brain cannot continue with it: {why} "
        "Both trials train from zero on the same seed, so the two designs are compared fairly.",
        "es": "El arreglo cambia lo que el cuerpo percibe o mueve, así que el cerebro actual no puede seguir con él: "
        "{why} Las dos pruebas entrenan desde cero con la misma semilla, para comparar los dos diseños con justicia.",
    },
    "trial_same": {"en": "same design, more steps", "es": "mismo diseño, más pasos"},
    "trial_same_cold": {"en": "the current design", "es": "el diseño actual"},
    "trial_fix": {"en": "with the fix “{summary}”", "es": "con el arreglo “{summary}”"},
    "trial_result": {
        "en": "Trial comparison on the same evaluation seeds:\n{table}\nI keep {winner}.",
        "es": "Comparación de las pruebas con las mismas semillas de evaluación:\n{table}\nMe quedo con {winner}.",
    },
    "trial_restored_cold": {
        "en": "The current design learned better from zero than the fix, so I restored revision {revision}.",
        "es": "El diseño actual aprendió mejor desde cero que el arreglo, así que restauré la revisión {revision}.",
    },
    "trial_restored": {
        "en": "More steps beat the fix, so I restored revision {revision} and keep training it.",
        "es": "Más pasos ganaron al arreglo, así que restauré la revisión {revision} y sigo entrenándola.",
    },
    "trend_improving": {
        "en": "The curve is still rising: more steps should help.",
        "es": "La curva sigue subiendo: más pasos deberían ayudar.",
    },
    "trend_flat": {
        "en": "The curve is flat: more steps alone are unlikely to help; a fix should.",
        "es": "La curva está plana: más pasos solos difícilmente ayudarán; un arreglo sí.",
    },
    "trial_same_name": {"en": "more steps", "es": "más pasos"},
    "trial_fix_name": {"en": "the fix", "es": "el arreglo"},
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
    "design_blocker": {
        "en": "the coach's early look found a design problem",
        "es": "la revisión temprana del entrenador encontró un problema de diseño",
    },
}


def coach_said(key: str, language: Language, **values: object) -> str:
    return COACH_TEXTS[key][language].format(**values)


def percent(share: float | None, language: Language) -> str:
    if share is None:
        return "—"
    return f"{share * 100:.0f}%" if language == "en" else f"{share * 100:.0f} %"
