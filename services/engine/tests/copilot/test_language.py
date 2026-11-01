from icarus.copilot.language import count, detect, plain_words


def test_the_conversation_language_comes_from_the_persons_own_words():
    assert detect("arréglalo tú") == "es"
    assert detect("muéstrame una foto") == "es"
    assert detect("ya terminó. por que se cae") == "es"
    assert detect("show me a picture of the track") == "en"
    assert detect("ok") == "en"


def test_codes_become_plain_words_in_the_persons_language():
    text = "Estado: `starting`. Tiene `balance` pero no distance_ray, y su tarea es `locomotion`; `walker_body` sigue."
    assert plain_words(text, "es") == (
        "Estado: arrancando. Tiene sensor de equilibrio pero no rayos de distancia, y su tarea es caminar hacia "
        "adelante; `walker_body` sigue."
    )
    assert plain_words("It is `running` with stay_upright.", "en") == "It is training with stay upright."


def test_counts_are_grouped_the_way_the_language_writes_them():
    assert (count(100_000, "es"), count(100_000, "en")) == ("100.000", "100,000")
