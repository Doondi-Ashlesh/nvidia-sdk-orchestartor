"""NVIDIA service catalog — id → name + layer.

The set of services the planner may choose from, and the layer ordering the
visualizer uses (left→right). Mirrors data/nvidia.ts at the repo root.

NOTE (drift): this is hand-maintained from data/nvidia.ts for now. A build
step that generates this from the TS catalog is a follow-up so the two can't
drift. The visualizer reads data/nvidia.ts; the planner reads this; they must
agree on ids.
"""

from __future__ import annotations

# The 6 stack layers, in left→right visualization order.
LAYER_ORDER = ["access", "sdk", "framework", "agent", "serving", "enterprise"]

# id -> (display name, layer)
CATALOG: dict[str, tuple[str, str]] = {
    # access
    "build-nvidia": ("NVIDIA Build", "access"),
    "brev": ("NVIDIA Brev", "access"),
    "ngc": ("NGC Catalog", "access"),
    "dgx-cloud": ("NVIDIA DGX Cloud", "access"),
    # sdk
    "cuda": ("NVIDIA CUDA Toolkit", "sdk"),
    "cudnn": ("NVIDIA cuDNN", "sdk"),
    "tensorrt": ("NVIDIA TensorRT", "sdk"),
    "tensorrt-llm": ("NVIDIA TensorRT-LLM", "sdk"),
    "rapids": ("NVIDIA RAPIDS", "sdk"),
    "model-optimizer": ("NVIDIA Model Optimizer", "sdk"),
    "megatron-lm": ("Megatron-LM", "sdk"),
    # framework
    "nemo": ("NVIDIA NeMo", "framework"),
    "nemo-curator": ("NVIDIA NeMo Curator", "framework"),
    "nemo-retriever": ("NVIDIA NeMo Retriever", "framework"),
    "nemo-evaluator": ("NVIDIA NeMo Evaluator", "framework"),
    "nemo-gym": ("NVIDIA NeMo Gym", "framework"),
    "nemotron": ("NVIDIA Nemotron", "framework"),
    "ai-workbench": ("NVIDIA AI Workbench", "framework"),
    # agent
    "nemo-agent-toolkit": ("NeMo Agent Toolkit", "agent"),
    "nemo-guardrails": ("NVIDIA NeMo Guardrails", "agent"),
    "blueprints": ("NVIDIA AI Blueprints", "agent"),
    "cuopt": ("NVIDIA cuOpt", "agent"),
    # serving
    "triton": ("NVIDIA Dynamo-Triton", "serving"),
    "nim": ("NVIDIA NIM", "serving"),
    # enterprise
    "ai-enterprise": ("NVIDIA AI Enterprise", "enterprise"),
}


def is_valid(service_id: str) -> bool:
    return service_id in CATALOG


def layer_of(service_id: str) -> str:
    return CATALOG.get(service_id, ("", "framework"))[1]


def name_of(service_id: str) -> str:
    return CATALOG.get(service_id, (service_id, ""))[0]


def catalog_prompt_block() -> str:
    """Compact id: name (layer) list for injecting into the planner prompt."""
    return "\n".join(f"- {sid}: {name} ({layer})" for sid, (name, layer) in CATALOG.items())
