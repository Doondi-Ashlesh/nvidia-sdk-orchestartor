"""Hosted-NIM clients — embeddings + chat over the OpenAI-compatible API.

Per decision D5, generation runs on hosted NIM (build.nvidia.com) free tier,
not self-hosted compute. NIM exposes the OpenAI API shape, so we use the
standard `openai` client pointed at the NIM base URL.

Env vars (see ../.env.example at repo root):
  NVIDIA_NIM_API_KEY   — required; key from build.nvidia.com
  NIM_BASE_URL         — default https://integrate.api.nvidia.com/v1
  NIM_EMBED_MODEL      — default nvidia/nv-embedqa-e5-v5
  NIM_RERANK_MODEL     — default nvidia/nv-rerankqa-mistral-4b-v3
  NIM_REASONER_MODEL   — default nvidia/nemotron-3-super-120b-a12b
"""

from __future__ import annotations

import os
from functools import lru_cache

from openai import OpenAI

# Auto-load service/.env (or any parent .env) so NVIDIA_NIM_API_KEY persists
# across shell sessions — no need to `set`/`export` every time. Guarded so the
# service still works if python-dotenv isn't installed.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"
DEFAULT_REASONER_MODEL = "nvidia/nemotron-3-super-120b-a12b"


def _require_key() -> str:
    key = os.environ.get("NVIDIA_NIM_API_KEY")
    if not key:
        raise RuntimeError(
            "NVIDIA_NIM_API_KEY is not set. Get a free key at build.nvidia.com "
            "and export it (see .env.example)."
        )
    return key


@lru_cache(maxsize=1)
def client() -> OpenAI:
    """Singleton OpenAI-compatible client pointed at hosted NIM."""
    return OpenAI(
        base_url=os.environ.get("NIM_BASE_URL", DEFAULT_BASE_URL),
        api_key=_require_key(),
    )


def embed(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Embed a batch of texts via the NIM embedding model.

    Returns one vector per input text, order preserved.
    """
    model = model or os.environ.get("NIM_EMBED_MODEL", DEFAULT_EMBED_MODEL)
    # NIM's embedqa models distinguish passage vs query; "passage" for corpus
    # ingestion. The input_type extra is accepted by the NIM embeddings API.
    resp = client().embeddings.create(
        model=model,
        input=texts,
        extra_body={"input_type": "passage", "truncate": "END"},
    )
    return [d.embedding for d in resp.data]


def embed_query(text: str, model: str | None = None) -> list[float]:
    """Embed a single query string (input_type=query for asymmetric retrieval)."""
    model = model or os.environ.get("NIM_EMBED_MODEL", DEFAULT_EMBED_MODEL)
    resp = client().embeddings.create(
        model=model,
        input=[text],
        extra_body={"input_type": "query", "truncate": "END"},
    )
    return resp.data[0].embedding


def chat(
    messages: list[dict],
    *,
    model: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 4096,
    json_mode: bool = False,
    thinking: bool = False,
) -> str:
    """Chat completion via the NIM reasoner model (Nemotron).

    json_mode=True requests strict JSON output (constrained decoding) so we
    don't post-hoc parse/repair — used for structured outputs like the plan.

    thinking=False (default) disables Nemotron's chain-of-thought. Structured
    generation (the plan) doesn't need CoT and it's much faster without it —
    CoT can add 1-3 min of "thinking" tokens before the answer on the 120B
    model. Set thinking=True only where extended reasoning genuinely helps.
    """
    model = model or os.environ.get("NIM_REASONER_MODEL", DEFAULT_REASONER_MODEL)
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        # Nemotron reasoning toggle, off by default for speed on structured tasks.
        "extra_body": {"chat_template_kwargs": {"enable_thinking": thinking}},
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client().chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""
