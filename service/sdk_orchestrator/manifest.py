"""The agent↔visualizer contract, Python side.

Mirrors types/manifest.ts exactly. The agent builds an ArchitectureManifest
and serializes it to JSON; the Next.js visualizer deserializes the same shape.
Keep this in lockstep with types/manifest.ts — it is THE contract (D3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

VerificationStatus = Literal[
    "passed",
    "passed_with_stubs",
    "requires_gpu",
    "unresolved",
    "not_run",
]


class ManifestService(BaseModel):
    id: str                       # canonical id from data/nvidia.ts
    name: str
    role: str                     # role IN THIS tailored solution
    layer: str                    # stack layer (Layer in ecosystem.ts)
    cell_refs: list[int] = Field(default_factory=list, alias="cellRefs")
    verification: VerificationStatus = "not_run"

    model_config = {"populate_by_name": True}


class ManifestConnection(BaseModel):
    from_: str = Field(alias="from")
    to: str
    data: str
    implementing_cell: int | None = Field(default=None, alias="implementingCell")

    model_config = {"populate_by_name": True}


class ManifestProvenance(BaseModel):
    use_case: str = Field(alias="useCase")
    blueprint_id: str | None = Field(alias="blueprintId")
    model: str
    agent_run_id: str = Field(alias="agentRunId")
    generated_at: str = Field(alias="generatedAt")
    total_cells: int = Field(alias="totalCells")

    model_config = {"populate_by_name": True}


class VerificationSummary(BaseModel):
    code_cells: int = Field(alias="codeCells")
    passed: int
    requires_gpu: int = Field(alias="requiresGpu")
    external_required: int = Field(alias="externalRequired")
    unresolved: int

    model_config = {"populate_by_name": True}


class ArchitectureManifest(BaseModel):
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    provenance: ManifestProvenance
    services: list[ManifestService]
    connections: list[ManifestConnection]
    verification_summary: VerificationSummary = Field(alias="verificationSummary")

    model_config = {"populate_by_name": True}

    def to_visualizer_json(self) -> str:
        """Serialize using the camelCase aliases the Next.js visualizer expects."""
        return self.model_dump_json(by_alias=True, indent=2)


def summarize(services: list[ManifestService], total_code_cells: int) -> VerificationSummary:
    """Derive the headline verification summary from per-service statuses."""
    passed = sum(1 for s in services if s.verification == "passed")
    requires_gpu = sum(1 for s in services if s.verification == "requires_gpu")
    external = sum(1 for s in services if s.verification == "passed_with_stubs")
    unresolved = sum(1 for s in services if s.verification == "unresolved")
    return VerificationSummary(
        codeCells=total_code_cells,
        passed=passed,
        requiresGpu=requires_gpu,
        externalRequired=external,
        unresolved=unresolved,
    )
