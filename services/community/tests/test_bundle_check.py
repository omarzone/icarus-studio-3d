import pytest

from icarus_community.bundle_check import BundleRejected, check_bundle
from tests.conftest import project_bundle

LIMIT = 1024 * 1024


def test_a_project_bundle_of_plain_data_is_accepted_with_a_stable_checksum():
    first = check_bundle(project_bundle(), LIMIT)
    reordered = dict(reversed(list(project_bundle().items())))

    assert first.envelope.project["name"] == "Parking car"
    assert check_bundle(reordered, LIMIT).sha256 == first.sha256


def test_descriptions_may_mention_data_and_metadata():
    bundle = project_bundle()
    bundle["project"]["description"] = "Training data: 4M steps. metadata: none"

    check_bundle(bundle, LIMIT)


@pytest.mark.parametrize(
    "text",
    [
        "<script>alert(1)</script>",
        "javascript:fetch('x')",
        "data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA",
        "#!/bin/sh\nrm -rf /",
    ],
    ids=["html script", "javascript url", "embedded program", "shell script"],
)
def test_strings_that_carry_code_are_refused(text):
    bundle = project_bundle()
    bundle["project"]["world"]["note"] = text

    with pytest.raises(BundleRejected, match="code"):
        check_bundle(bundle, LIMIT)


def test_fields_outside_the_project_shape_are_refused():
    bundle = project_bundle()
    bundle["project"]["install_script"] = "pip install something"
    with pytest.raises(BundleRejected, match="install_script"):
        check_bundle(bundle, LIMIT)

    envelope = project_bundle()
    envelope["executable"] = True
    with pytest.raises(BundleRejected, match="bundle shape"):
        check_bundle(envelope, LIMIT)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda b: b.update(format="zip"), "format"),
        (lambda b: b.update(kind="plugin"), "whole projects"),
        (lambda b: b["project"].update(schema_version=99), "project version"),
        (lambda b: b["project"].pop("brain"), "missing brain"),
        (lambda b: b["project"].update(bodies={"car": {}}), "bodies must be a list"),
    ],
    ids=["unknown format", "unknown kind", "future schema", "missing section", "wrong section type"],
)
def test_bundles_that_are_not_a_known_project_are_refused(change, message):
    bundle = project_bundle()
    change(bundle)

    with pytest.raises(BundleRejected, match=message):
        check_bundle(bundle, LIMIT)


def test_deep_nesting_long_blobs_and_size_are_bounded():
    deep = project_bundle()
    node: dict = deep["project"]["world"]
    for _ in range(60):
        node["child"] = {}
        node = node["child"]
    with pytest.raises(BundleRejected, match="nested"):
        check_bundle(deep, LIMIT)

    blob = project_bundle()
    blob["project"]["world"]["mesh"] = "A" * 30_000
    with pytest.raises(BundleRejected, match="too long"):
        check_bundle(blob, LIMIT)

    with pytest.raises(BundleRejected, match="larger than"):
        check_bundle(project_bundle(), 100)
