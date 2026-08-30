"""Data models for ChangeGuard pipeline outputs.

All models map 1-to-1 to the JSON schemas in docs/changeguard_instructions.md
§10, §11, §17, §21.  Use `to_dict()` / `dataclasses.asdict` for serialization;
`GraphEdge.to_dict()` handles the `from` keyword clash.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# §10 — Ticket model
# ---------------------------------------------------------------------------


@dataclass
class TicketSource:
    path: str
    type: str  # "md" | "txt" | "pdf" | "docx"

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class TicketModel:
    schemaVersion: str
    id: str
    title: str
    source: TicketSource
    summary: str
    requirements: list[str] = field(default_factory=list)
    acceptanceCriteria: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# §11 — Relevance analysis
# ---------------------------------------------------------------------------


@dataclass
class LikelyFile:
    path: str
    confidence: float
    reason: str

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class RelevantSymbol:
    name: str
    path: str

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class RelevanceAnalysis:
    schemaVersion: str
    ticketId: str
    likelyModules: list[str] = field(default_factory=list)
    likelyFiles: list[LikelyFile] = field(default_factory=list)
    relevantSymbols: list[RelevantSymbol] = field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# §17 — Pair / relationship analysis
# ---------------------------------------------------------------------------


@dataclass
class LogicalDependency:
    exists: bool
    confidence: float
    evidence: list[str] = field(default_factory=list)
    prerequisite: str | None = None
    dependent: str | None = None

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class ChangeCollision:
    exists: bool
    confidence: float
    sharedFiles: list[str] = field(default_factory=list)
    sharedModules: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class PairAnalysis:
    schemaVersion: str
    tickets: list[str]  # exactly 2, stable-sorted
    logicalDependency: LogicalDependency
    changeCollision: ChangeCollision
    independent: bool

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


# ---------------------------------------------------------------------------
# §21 — Change Conflict Graph
# ---------------------------------------------------------------------------


@dataclass
class GraphNode:
    id: str
    title: str

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclass
class GraphEdge:
    """An edge in the Change Conflict Graph.

    For ``type == "logical_dependency"`` set ``from_`` and ``to``.
    For ``type == "change_collision"`` set ``tickets``.
    ``from_`` serializes as ``"from"`` in JSON (``from`` is a Python keyword).
    """

    type: str  # "logical_dependency" | "change_collision"
    confidence: float
    from_: str | None = None          # logical_dependency only
    to: str | None = None             # logical_dependency only
    tickets: list[str] = field(default_factory=list)  # change_collision only

    def to_dict(self) -> dict:
        d: dict = {}
        d["type"] = self.type
        if self.type == "logical_dependency":
            d["from"] = self.from_
            d["to"] = self.to
        else:
            d["tickets"] = list(self.tickets)
        d["confidence"] = self.confidence
        return d


@dataclass
class ChangeGraph:
    schemaVersion: str
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)
    independentTickets: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "schemaVersion": self.schemaVersion,
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "independentTickets": list(self.independentTickets),
        }
