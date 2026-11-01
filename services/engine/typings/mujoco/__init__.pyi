# MuJoCo is a native module without type stubs; its attributes are untyped here.
from typing import Any

def __getattr__(name: str) -> Any: ...
