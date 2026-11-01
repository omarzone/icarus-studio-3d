from typing import Any

from icarus.copilot.agent.tools.base import Tool
from icarus.copilot.agent.tools.inspect import INSPECT_OBJECT, READ_RUN
from icarus.copilot.agent.tools.library import LIBRARY
from icarus.copilot.agent.tools.look import LOOK
from icarus.copilot.agent.tools.proposing import APPLY, PROPOSE
from icarus.copilot.agent.tools.training import TRAIN
from icarus.copilot.agent.tools.trying import TRY

REGISTRY: dict[str, Tool[Any]] = {
    tool.name: tool for tool in (INSPECT_OBJECT, READ_RUN, LIBRARY, LOOK, TRY, PROPOSE, APPLY, TRAIN)
}
