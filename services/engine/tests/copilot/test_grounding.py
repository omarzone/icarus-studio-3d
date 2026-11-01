from icarus.copilot.grounding import unsupported_numbers, without_unbacked

CONTEXT = '{"car": {"mass": 900.0, "length": 4.0}, "latest_run": {"success_rate": 0.4166, "step": 300000}}'


def test_numbers_present_in_the_context_or_the_question_are_supported():
    answer = "The car weighs 900 kg, parks 42% of the time after 300,000 steps, and 1,200 kg is what you asked about."
    assert unsupported_numbers(answer, [CONTEXT, "Should it weigh 1200 kg?"]) == []


def test_numbers_are_compared_at_the_precision_they_are_shown():
    assert unsupported_numbers("Success is about 0.4 now.", [CONTEXT]) == []
    assert unsupported_numbers("Success is 0.45 now.", [CONTEXT]) == ["0.45"]


def test_small_whole_numbers_need_no_source():
    assert unsupported_numbers("Try 3 changes on the 2 rear wheels.", [CONTEXT]) == []


def test_invented_numbers_are_listed():
    answer = "It reached 73% success and drives at 12.5 m/s."
    assert unsupported_numbers(answer, [CONTEXT]) == ["73%", "12.5"]


def test_numbers_inside_names_are_not_citations():
    assert unsupported_numbers("Run run-20261101T120000Z-ab12 used model gpt4x.", [CONTEXT]) == []


def test_negative_numbers_are_checked_by_their_size():
    assert unsupported_numbers("Limits go from -35 to 35 degrees.", ['{"limits":[-35,35]}']) == []
    assert unsupported_numbers("It can go to -40 degrees.", ['{"limits":[-35,35]}']) == ["40"]


def test_percentages_need_run_facts_or_the_person_and_not_library_ranges():
    library = '{"steer_left": {"limits": [-35, 35]}, "latest_run": null}'
    run = '{"success_rate": 0.4166}'
    assert unsupported_numbers("It parks 35% of the time.", [library], percent_sources=[]) == ["35%"]
    assert unsupported_numbers("It parks 42% of the time.", [library], percent_sources=[run]) == []
    assert unsupported_numbers("Is 35% enough?", [library], percent_sources=["I want 35% success"]) == []
    assert unsupported_numbers("Steering goes to 35 degrees.", [library], percent_sources=[]) == []


def test_numbers_rounded_to_two_or_three_significant_figures_are_supported():
    facts = ['{"step": 123456, "episode_return": -48.731}']
    assert unsupported_numbers("About 123,000 steps, or 120,000, with a return near -48.7 or -49.", facts) == []
    assert unsupported_numbers("About 124,000 steps.", facts) == ["124,000"]


RUN = '{"step": 100000, "total_steps": 100000, "recommended_steps": 2000000, "failure_rate": 1.0, "return": 0.35}'


def test_spanish_thousands_separators_and_decimal_commas_are_read_as_the_same_numbers():
    answer = "Lleva 100.000 de 2.000.000 pasos, con un retorno de 0,35 y una tasa de caídas del 100%."
    assert unsupported_numbers(answer, [RUN]) == []
    assert unsupported_numbers("Lleva 150.000 pasos y un retorno de 0,45.", [RUN]) == ["150.000", "0,45"]


def test_rounded_step_counts_with_k_and_m_suffixes_are_supported():
    assert unsupported_numbers("Hizo 100k de los 2M recomendados.", [RUN]) == []
    assert unsupported_numbers("Hizo 300k pasos.", [RUN]) == ["300k"]


def test_only_the_sentences_with_unbacked_numbers_are_removed():
    answer = "Se cae siempre.\n- Lleva 100.000 pasos.\n- Corre a 12,5 m/s. Va mejorando.\n¿Quieres entrenar más?"
    kept = without_unbacked(answer, [RUN])
    assert kept == "Se cae siempre.\n- Lleva 100.000 pasos.\n- Va mejorando.\n¿Quieres entrenar más?"
