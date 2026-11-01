import re
from typing import Literal

from icarus.library.components import COMPONENTS
from icarus.library.rewards import REWARD_TERMS

type Language = Literal["en", "es"]

_SPANISH_MARKS = re.compile(r"[ñ¿¡áéíóú]", re.IGNORECASE)
_SPANISH_WORDS = frozenset(
    [
        "hola",
        "quiero",
        "que",
        "qué",
        "cómo",
        "como",
        "por",
        "para",
        "el",
        "la",
        "los",
        "las",
        "una",
        "un",
        "es",
        "está",
        "esta",
        "con",
        "mi",
        "tu",
        "ya",
        "muy",
        "pero",
        "también",
        "hazlo",
        "arréglalo",
        "arreglalo",
        "muéstrame",
        "muestrame",
        "dime",
        "puedes",
        "porque",
        "cuando",
        "donde",
        "dónde",
        "ahora",
        "entrena",
        "entrénalo",
        "entrenalo",
        "sí",
        "gracias",
        "otra",
        "vez",
        "del",
        "al",
        "se",
        "lo",
        "le",
        "nos",
        "más",
        "mas",
        "foto",
        "pista",
        "cae",
        "caer",
    ]
)
_ENGLISH_WORDS = frozenset(
    [
        "hi",
        "hello",
        "i",
        "want",
        "the",
        "a",
        "an",
        "is",
        "are",
        "it",
        "its",
        "with",
        "my",
        "your",
        "what",
        "how",
        "why",
        "can",
        "could",
        "please",
        "now",
        "train",
        "fix",
        "show",
        "me",
        "and",
        "but",
        "also",
        "this",
        "that",
        "when",
        "where",
        "yes",
        "thanks",
        "again",
        "more",
        "picture",
        "track",
        "falls",
        "fall",
    ]
)

TEXTS: dict[str, dict[Language, str]] = {
    "limit_steps": {
        "en": "I reached the limit of {count} steps for one message",
        "es": "Llegué al límite de {count} pasos para un mensaje",
    },
    "limit_tools": {
        "en": "I reached the limit of {count} tool calls for one message",
        "es": "Llegué al límite de {count} acciones para un mensaje",
    },
    "limit_time": {
        "en": "I am close to the time limit of {seconds} s for one message",
        "es": "Estoy cerca del límite de {seconds} s para un mensaje",
    },
    "limit_reading": {
        "en": "I used the reading budget for one message",
        "es": "Usé todo lo que puedo leer en un mensaje",
    },
    "repeated": {
        "en": "I repeated the same step without progress",
        "es": "Repetí el mismo paso sin avanzar",
    },
    "too_long": {
        "en": "The work for this message grew too long for the model",
        "es": "El trabajo de este mensaje creció demasiado para el modelo",
    },
    "empty": {"en": "The model answered with nothing", "es": "El modelo respondió vacío"},
    "format_twice": {
        "en": "My answer did not fit its format twice",
        "es": "Mi respuesta no tuvo el formato correcto dos veces",
    },
    "stopped": {
        "en": "{reason}, so I stopped before I could finish my answer.",
        "es": "{reason}, así que me detuve antes de terminar la respuesta.",
    },
    "proposal_kept": {
        "en": "The change I prepared is below: press Apply to add it.",
        "es": "El cambio que preparé está abajo: pulsa Aplicar para añadirlo.",
    },
    "unsupported": {
        "en": "I could not back that answer with data from this project, so I will not guess at the numbers.",
        "es": "No pude respaldar esa respuesta con datos de este proyecto, así que no voy a inventar números.",
    },
    "proposed_not_applied": {
        "en": "I have not changed the project yet: I proposed the change, and Apply adds it.",
        "es": "Todavía no cambié el proyecto: te propuse el cambio y Aplicar lo añade.",
    },
    "failed": {"en": "I could not finish: {failure}.", "es": "No pude terminar: {failure}."},
    "failed_after": {
        "en": "{done} Then I could not finish: {failure}.",
        "es": "{done} Después no pude terminar: {failure}.",
    },
    "apply": {"en": "Apply", "es": "Aplicar"},
    "discard": {"en": "Discard", "es": "Descartar"},
    "train_now": {"en": "Train now", "es": "Entrenar ahora"},
    "applied": {
        "en": "I applied “{summary}” as revision {revision}.",
        "es": "Apliqué “{summary}” como revisión {revision}.",
    },
    "train_no_task": {
        "en": "I did not start training: this project has no task to learn yet.",
        "es": "No empecé a entrenar: este proyecto todavía no tiene una tarea que aprender.",
    },
    "train_busy": {
        "en": "{name} is already training, so I did not start another run. Ask me to stop it first.",
        "es": "{name} ya está entrenando, así que no empecé otro. Pídeme que lo detenga primero.",
    },
    "train_refused": {"en": "I did not start training: {reason}.", "es": "No empecé a entrenar: {reason}."},
    "train_started": {
        "en": "I started {name}: {steps} steps with {copies} copies.",
        "es": "Empecé {name}: {steps} pasos con {copies} copias.",
    },
    "train_nothing": {
        "en": "No run of this project is training, so there was nothing to stop.",
        "es": "Ningún entrenamiento de este proyecto está en marcha, así que no había nada que detener.",
    },
    "train_stopping": {
        "en": "I asked {names} to stop; it keeps its best checkpoint.",
        "es": "Pedí a {names} que se detenga; conserva su mejor punto guardado.",
    },
}

# Codes the person should never read, in plain words: run states, task families, sensors and reward terms.
_CODE_WORDS: dict[str, dict[Language, str]] = {
    "starting": {"en": "starting", "es": "arrancando"},
    "running": {"en": "training", "es": "entrenando"},
    "stopping": {"en": "stopping", "es": "deteniéndose"},
    "done": {"en": "finished", "es": "terminado"},
    "stopped": {"en": "stopped", "es": "detenido"},
    "failed": {"en": "failed", "es": "falló"},
    "locomotion": {"en": "walking forward", "es": "caminar hacia adelante"},
    "navigation": {"en": "reaching a goal", "es": "llegar a una meta"},
    "distance_ray": {"en": "distance rays", "es": "rayos de distancia"},
    "balance": {"en": "balance sensor", "es": "sensor de equilibrio"},
    "touch": {"en": "touch sensor", "es": "sensor de tacto"},
    "reach_goal": {"en": "reach the goal", "es": "llegar a la meta"},
    "progress_to_goal": {"en": "progress to the goal", "es": "acercarse a la meta"},
    "heading_alignment": {"en": "face the goal", "es": "mirar hacia la meta"},
    "collision_penalty": {"en": "avoid collisions", "es": "evitar choques"},
    "time_penalty": {"en": "be quick", "es": "ser rápido"},
    "forward_progress": {"en": "move forward", "es": "avanzar"},
    "stay_upright": {"en": "stay upright", "es": "mantenerse de pie"},
    "energy_cost": {"en": "save energy", "es": "ahorrar energía"},
    "fall_penalty": {"en": "do not fall", "es": "no caerse"},
    "failure_rate": {"en": "failure rate", "es": "tasa de fallos"},
    "success_rate": {"en": "success rate", "es": "tasa de éxito"},
    "episode_length": {"en": "attempt length", "es": "duración del intento"},
    "episode_return": {"en": "score", "es": "puntuación"},
}
_CLAIMS = re.compile(
    r"\b(?:arreglé|cambié|apliqué|añadí|agregué|puse|modifiqué|corregí|quité|subí|bajé)\b"
    r"|\bI(?:'ve| have)?\s+(?:already\s+)?(?:applied|changed|fixed|added|updated|modified|removed)\b",
    re.IGNORECASE,
)
_ASKS_TO_FIX = re.compile(r"\b(?:arr[eé]gl|corr[ií]g|mej[oó]r|soluci[oó]n|fix|repair|improve|solve)", re.IGNORECASE)
_ASKS_TO_TRAIN = re.compile(r"\b(?:entren|train)", re.IGNORECASE)
_DESTINATION = re.compile(
    r"\b(?:race|racing|finish|reach|park|parking|goal|destination|obstacle course|carrera|meta|llegar|llegue|"
    r"aparc|estacion|destino|circuito|recorrido)",
    re.IGNORECASE,
)
_CODE = re.compile(r"`([a-z_]+)`|\b([a-z]+(?:_[a-z]+)+)\b")


def detect(text: str) -> Language:
    """Spanish or English from the person's own words; English when unsure."""
    words = re.findall(r"[a-záéíóúñü]+", text.lower())
    spanish = sum(word in _SPANISH_WORDS for word in words) + 2 * len(_SPANISH_MARKS.findall(text))
    english = sum(word in _ENGLISH_WORDS for word in words)
    return "es" if spanish > english else "en"


def claims_change(text: str) -> bool:
    """Whether the text says, in the first person, that the project was already changed."""
    return bool(_CLAIMS.search(text))


def asks_to_fix(text: str) -> bool:
    return bool(_ASKS_TO_FIX.search(text))


def asks_to_train(text: str) -> bool:
    return bool(_ASKS_TO_TRAIN.search(text))


def implies_destination(text: str) -> bool:
    """Whether the person's goal has a place to get to: a race, a finish line, parking, an obstacle course."""
    return bool(_DESTINATION.search(text))


def say(key: str, language: Language, **values: object) -> str:
    return TEXTS[key][language].format(**values)


def count(value: int, language: Language) -> str:
    """A whole number grouped the way the language writes it: 100,000 or 100.000."""
    grouped = f"{value:,}"
    return grouped.replace(",", ".") if language == "es" else grouped


def _plain(code: str, language: Language) -> str | None:
    if code in _CODE_WORDS:
        return _CODE_WORDS[code][language]
    if code in REWARD_TERMS:
        return REWARD_TERMS[code].label.lower()
    if code in COMPONENTS:
        return COMPONENTS[code].label.lower()
    return None


def plain_words(text: str, language: Language) -> str:
    """Library and run codes written in backticks or with underscores, replaced by words the person reads."""

    def replace(match: re.Match[str]) -> str:
        code = match.group(1) or match.group(2)
        return _plain(code, language) or match.group(0)

    return _CODE.sub(replace, text)
