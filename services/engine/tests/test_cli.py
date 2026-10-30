from icarus.cli import parse_args


def test_cli_defaults_to_localhost():
    args = parse_args(["--port", "9100"])
    assert (args.host, args.port, args.reload) == ("127.0.0.1", 9100, False)
