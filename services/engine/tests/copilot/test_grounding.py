from icarus.copilot.grounding import unsupported_numbers

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
