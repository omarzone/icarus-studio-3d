from typing import Any

from icarus.copilot.agent.tools.agents import ADD_AGENT
from icarus.copilot.agent.tools.base import Tool
from icarus.copilot.agent.tools.behavior_testing import BEHAVIOR_TEST
from icarus.copilot.agent.tools.building import EDIT_GROUP, EDIT_MATCHING, PATTERN
from icarus.copilot.agent.tools.cloning import BUILD_OBJECT, REFERENCE_SCENE
from icarus.copilot.agent.tools.coaching import COACH
from icarus.copilot.agent.tools.exporting import CHECK_HARDWARE, EXPORT_ROBOT
from icarus.copilot.agent.tools.finding import FIND_OBJECTS
from icarus.copilot.agent.tools.inspect import INSPECT_OBJECT, READ_RUN
from icarus.copilot.agent.tools.layout import LAYOUT
from icarus.copilot.agent.tools.library import LIBRARY
from icarus.copilot.agent.tools.look import LOOK
from icarus.copilot.agent.tools.proposing import APPLY, PROPOSE
from icarus.copilot.agent.tools.rigging import AUTO_RIG, FIX_BODY, IMITATE_CLIP, IMPORT_ROBOT
from icarus.copilot.agent.tools.training import TRAIN
from icarus.copilot.agent.tools.trying import TRY

REGISTRY: dict[str, Tool[Any]] = {
    tool.name: tool
    for tool in (
        INSPECT_OBJECT,
        READ_RUN,
        LIBRARY,
        FIND_OBJECTS,
        LOOK,
        TRY,
        LAYOUT,
        ADD_AGENT,
        PATTERN,
        EDIT_GROUP,
        EDIT_MATCHING,
        BUILD_OBJECT,
        REFERENCE_SCENE,
        PROPOSE,
        APPLY,
        TRAIN,
        COACH,
        BEHAVIOR_TEST,
        CHECK_HARDWARE,
        EXPORT_ROBOT,
        AUTO_RIG,
        IMPORT_ROBOT,
        FIX_BODY,
        IMITATE_CLIP,
    )
}
