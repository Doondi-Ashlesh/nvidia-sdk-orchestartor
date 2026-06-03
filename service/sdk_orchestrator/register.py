"""NAT function registration — the thin wrapper layer (Increment 1B).

Registers the orchestrator's tools with NeMo Agent Toolkit. Imports verified
against nvidia-nat 1.7.0:
    nat.cli.register_workflow.register_function
    nat.builder.function_info.FunctionInfo
    nat.data_models.function.FunctionBaseConfig

All business logic lives in the framework-agnostic modules (select.py, etc.);
these wrappers just expose it to the agent. nat discovers this module via the
`nat.components` entry point in pyproject.toml.

Pattern (per NVIDIA docs): an async factory `(config, builder)` that yields a
FunctionInfo wrapping the inner async tool function. If 1.7.0 expects `return`
instead of `yield`, the first `nat run` surfaces it — one-line fix here only.
"""

from __future__ import annotations

import json

from pydantic import Field

from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from sdk_orchestrator.select import select_blueprint


class SelectBlueprintConfig(FunctionBaseConfig, name="select_blueprint"):
    """Config for the blueprint-selection tool (populated from config.yaml)."""

    top_k: int = Field(3, description="How many candidate blueprints to rank", ge=1, le=10)


@register_function(config_type=SelectBlueprintConfig)
async def select_blueprint_function(config: SelectBlueprintConfig, builder):
    """Factory: returns the runnable blueprint-selection tool."""

    async def _select(use_case: str) -> str:
        """Select the best-matching NVIDIA AI Blueprint for a use case.

        Use this FIRST, before tailoring. Given the user's use case, returns
        ranked blueprint candidates with similarity scores and the best match
        (or null if none is a good fit, in which case generate from scratch).
        """
        result = select_blueprint(use_case, top_k=config.top_k)
        return json.dumps(result, indent=2)

    yield FunctionInfo.from_fn(_select, description=_select.__doc__)
