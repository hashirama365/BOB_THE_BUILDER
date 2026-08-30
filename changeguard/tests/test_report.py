"""Tests for the ChangeGuard report module.

All 16 test cases from §21. No LLM calls — context builder is tested
against synthetic fixture data; renderer tests use a mock generator.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from changeguard.report.context import (
    build_report_context,
    MissingTicketError,
    MissingRelevanceError,
    MissingGraphError,
    _derive_status,
    READY,
    PREREQUISITES_PRESENT,
    COORDINATION_REQUIRED,
    PREREQUISITES_AND_COORDINATION,
)
from changeguard.report.renderer import render_markdown, render_json


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _write_request(root: Path, ticket_id: str, title: str = "", summary: str = "") -> None:
    (root / "requests").mkdir(parents=True, exist_ok=True)
    data = {
        "schemaVersion": "1.0",
        "id": ticket_id,
        "title": title or f"Title of {ticket_id}",
        "source": {"path": f"{ticket_id}.md", "type": "md"},
        "summary": summary or f"Summary of {ticket_id}",
        "requirements": [f"Req 1 for {ticket_id}"],
        "acceptanceCriteria": [f"AC 1 for {ticket_id}"],
        "references": [],
    }
    (root / "requests" / f"{ticket_id}.json").write_text(json.dumps(data), encoding="utf-8")


def _write_relevance(root: Path, ticket_id: str, files: list[str] | None = None) -> None:
    (root / "analysis" / "tickets").mkdir(parents=True, exist_ok=True)
    data = {
        "schemaVersion": "1.0",
        "ticketId": ticket_id,
        "likelyModules": ["src/core"],
        "likelyFiles": [{"path": f, "confidence": 0.9, "reason": "test"} for f in (files or [])],
        "relevantSymbols": [],
    }
    (root / "analysis" / "tickets" / f"{ticket_id}.json").write_text(json.dumps(data), encoding="utf-8")


def _write_graph(root: Path, nodes: list[dict], edges: list[dict]) -> None:
    data = {
        "schemaVersion": "1.0",
        "nodes": nodes,
        "edges": edges,
        "independentTickets": [],
    }
    (root / "change-graph.json").write_text(json.dumps(data), encoding="utf-8")


def _write_pair(
    root: Path,
    a: str,
    b: str,
    dep: bool = False,
    dep_from: str | None = None,
    dep_to: str | None = None,
    col: bool = False,
    shared_files: list[str] | None = None,
    evidence: list[str] | None = None,
) -> None:
    (root / "analysis" / "pairs").mkdir(parents=True, exist_ok=True)
    ta, tb = sorted([a, b])
    data = {
        "schemaVersion": "1.0",
        "tickets": [ta, tb],
        "logicalDependency": {
            "exists": dep,
            "prerequisite": dep_from,
            "dependent": dep_to,
            "confidence": 0.92 if dep else 0.0,
            "evidence": [],
        },
        "changeCollision": {
            "exists": col,
            "confidence": 0.90 if col else 0.0,
            "sharedFiles": shared_files or [],
            "sharedModules": [],
            "evidence": evidence or [],
        },
        "independent": not dep and not col,
    }
    (root / "analysis" / "pairs" / f"{ta}__{tb}.json").write_text(json.dumps(data), encoding="utf-8")


def _setup_basic(root: Path, ticket_id: str) -> None:
    """Minimal valid setup for a ticket with no relationships."""
    _write_request(root, ticket_id)
    _write_relevance(root, ticket_id)
    _write_graph(
        root,
        nodes=[{"id": ticket_id, "title": f"Title of {ticket_id}"}],
        edges=[],
    )


# ---------------------------------------------------------------------------
# Test 1 — ticket with no relationships → READY
# ---------------------------------------------------------------------------

def test_no_relationships_ready():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _setup_basic(root, "CG-201")
        ctx = build_report_context("CG-201", root)

        assert ctx.status == READY
        assert ctx.dependencyContext.directPrerequisites == []
        assert ctx.dependencyContext.allPrerequisites == []
        assert ctx.dependencyContext.directDependents == []
        assert ctx.dependencyContext.allDependents == []
        assert ctx.collisions == []
        assert ctx.graphWarnings == []


# ---------------------------------------------------------------------------
# Test 2 — direct prerequisite detection
# ---------------------------------------------------------------------------

def test_direct_prerequisite_detection():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[{"id": "CG-101", "title": "A"}, {"id": "CG-102", "title": "B"}],
            edges=[{"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95}],
        )

        ctx = build_report_context("CG-102", root)

        assert ctx.dependencyContext.directPrerequisites == ["CG-101"]
        assert ctx.dependencyContext.allPrerequisites == ["CG-101"]


# ---------------------------------------------------------------------------
# Test 3 — transitive prerequisite traversal
# ---------------------------------------------------------------------------

def test_transitive_prerequisite_traversal():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102", "CG-103"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[
                {"id": "CG-101", "title": "A"},
                {"id": "CG-102", "title": "B"},
                {"id": "CG-103", "title": "C"},
            ],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
                {"type": "logical_dependency", "from": "CG-102", "to": "CG-103", "confidence": 0.95},
            ],
        )

        ctx = build_report_context("CG-103", root)

        assert "CG-102" in ctx.dependencyContext.directPrerequisites
        assert "CG-101" in ctx.dependencyContext.allPrerequisites
        assert "CG-102" in ctx.dependencyContext.allPrerequisites


# ---------------------------------------------------------------------------
# Test 4 — direct dependent detection
# ---------------------------------------------------------------------------

def test_direct_dependent_detection():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[{"id": "CG-101", "title": "A"}, {"id": "CG-102", "title": "B"}],
            edges=[{"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95}],
        )

        ctx = build_report_context("CG-101", root)

        assert ctx.dependencyContext.directDependents == ["CG-102"]
        assert ctx.dependencyContext.allDependents == ["CG-102"]


# ---------------------------------------------------------------------------
# Test 5 — transitive dependent traversal
# ---------------------------------------------------------------------------

def test_transitive_dependent_traversal():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102", "CG-103"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[
                {"id": "CG-101", "title": "A"},
                {"id": "CG-102", "title": "B"},
                {"id": "CG-103", "title": "C"},
            ],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
                {"type": "logical_dependency", "from": "CG-102", "to": "CG-103", "confidence": 0.95},
            ],
        )

        ctx = build_report_context("CG-101", root)

        assert "CG-102" in ctx.dependencyContext.directDependents
        assert "CG-103" in ctx.dependencyContext.allDependents


# ---------------------------------------------------------------------------
# Test 6 — collision aggregation from pair files
# ---------------------------------------------------------------------------

def test_collision_aggregation():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102", "CG-103"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[
                {"id": "CG-101", "title": "A"},
                {"id": "CG-102", "title": "B"},
                {"id": "CG-103", "title": "C"},
            ],
            edges=[
                {"type": "change_collision", "tickets": ["CG-101", "CG-102"], "confidence": 0.90},
                {"type": "change_collision", "tickets": ["CG-102", "CG-103"], "confidence": 0.85},
            ],
        )
        _write_pair(root, "CG-101", "CG-102", col=True, shared_files=["src/foo.ts"])
        _write_pair(root, "CG-102", "CG-103", col=True, shared_files=["src/bar.ts"])

        ctx = build_report_context("CG-102", root)

        collision_ids = {c.ticketId for c in ctx.collisions}
        assert "CG-101" in collision_ids
        assert "CG-103" in collision_ids
        assert len(ctx.collisions) == 2


# ---------------------------------------------------------------------------
# Test 7 — dependency + collision → PREREQUISITES_AND_COORDINATION
# ---------------------------------------------------------------------------

def test_dep_and_collision_status():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[{"id": "CG-101", "title": "A"}, {"id": "CG-102", "title": "B"}],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
                {"type": "change_collision", "tickets": ["CG-101", "CG-102"], "confidence": 0.90},
            ],
        )
        _write_pair(root, "CG-101", "CG-102", dep=True, dep_from="CG-101", dep_to="CG-102", col=True)

        ctx = build_report_context("CG-102", root)

        assert ctx.status == PREREQUISITES_AND_COORDINATION
        assert ctx.dependencyContext.directPrerequisites == ["CG-101"]
        assert len(ctx.collisions) == 1


# ---------------------------------------------------------------------------
# Test 8 — unrelated ticket detection
# ---------------------------------------------------------------------------

def test_unrelated_ticket_detection():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102", "CG-104"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[
                {"id": "CG-101", "title": "A"},
                {"id": "CG-102", "title": "B"},
                {"id": "CG-104", "title": "D"},
            ],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
            ],
        )
        _write_pair(root, "CG-101", "CG-104", col=False)

        ctx = build_report_context("CG-102", root)

        assert "CG-104" in ctx.unrelatedTickets
        assert "CG-101" not in ctx.unrelatedTickets


# ---------------------------------------------------------------------------
# Test 9 — correct status derivation for all four variants
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("prereqs,collisions,expected", [
    (False, False, READY),
    (True,  False, PREREQUISITES_PRESENT),
    (False, True,  COORDINATION_REQUIRED),
    (True,  True,  PREREQUISITES_AND_COORDINATION),
])
def test_status_derivation(prereqs, collisions, expected):
    assert _derive_status(prereqs, collisions) == expected


# ---------------------------------------------------------------------------
# Test 10 — Markdown generation (via renderer)
# ---------------------------------------------------------------------------

def test_markdown_renderer_writes_file():
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "CG-102.md"
        render_markdown("# ChangeGuard Brief — CG-102\n\nSome content.", out)
        assert out.exists()
        content = out.read_text(encoding="utf-8")
        assert "CG-102" in content


# ---------------------------------------------------------------------------
# Test 11 — JSON generation matches §16 schema
# ---------------------------------------------------------------------------

def test_json_renderer_schema():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _setup_basic(root, "CG-201")
        ctx = build_report_context("CG-201", root)

        out = Path(tmp) / "CG-201.json"
        render_json(ctx, out)

        assert out.exists()
        data = json.loads(out.read_text(encoding="utf-8"))

        assert data["schemaVersion"] == "1.0"
        assert data["ticketId"] == "CG-201"
        assert "status" in data
        assert "dependencyContext" in data
        assert "repositoryRelevance" in data
        assert "collisions" in data
        assert "unrelatedTickets" in data
        # Confirm §16 sub-keys
        dc = data["dependencyContext"]
        assert "directPrerequisites" in dc
        assert "allPrerequisites" in dc
        assert "dependencyPaths" in dc
        assert "directDependents" in dc
        assert "allDependents" in dc


# ---------------------------------------------------------------------------
# Test 12 — missing relevance analysis → clear error
# ---------------------------------------------------------------------------

def test_missing_relevance_raises():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_request(root, "CG-201")
        # Deliberately skip _write_relevance
        _write_graph(
            root,
            nodes=[{"id": "CG-201", "title": "T"}],
            edges=[],
        )

        with pytest.raises(MissingRelevanceError):
            build_report_context("CG-201", root)


# ---------------------------------------------------------------------------
# Test 13 — missing pair analysis → graceful degradation (no crash)
# ---------------------------------------------------------------------------

def test_missing_pair_files_graceful():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        _write_graph(
            root,
            nodes=[{"id": "CG-101", "title": "A"}, {"id": "CG-102", "title": "B"}],
            edges=[{"type": "change_collision", "tickets": ["CG-101", "CG-102"], "confidence": 0.90}],
        )
        # No pair files written — pairs_dir doesn't even exist

        # Should not crash; collisions come from pairs dir, which is absent
        ctx = build_report_context("CG-102", root)
        assert ctx.collisions == []  # No pair files → no collisions surfaced


# ---------------------------------------------------------------------------
# Test 14 — cyclic dependency protection
# ---------------------------------------------------------------------------

def test_cyclic_dependency_no_infinite_loop():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        # Introduce a cycle: CG-101 → CG-102 → CG-101
        _write_graph(
            root,
            nodes=[{"id": "CG-101", "title": "A"}, {"id": "CG-102", "title": "B"}],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
                {"type": "logical_dependency", "from": "CG-102", "to": "CG-101", "confidence": 0.95},
            ],
        )

        # Must not hang or raise — should return with warnings
        ctx = build_report_context("CG-102", root)
        assert len(ctx.graphWarnings) > 0
        cycle_warning = ctx.graphWarnings[0].lower()
        assert "cycle" in cycle_warning


# ---------------------------------------------------------------------------
# Test 15 — non-existent ticket → clear error
# ---------------------------------------------------------------------------

def test_nonexistent_ticket_raises():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_graph(root, nodes=[], edges=[])
        (root / "requests").mkdir(parents=True, exist_ok=True)
        (root / "analysis" / "tickets").mkdir(parents=True, exist_ok=True)

        with pytest.raises(MissingTicketError):
            build_report_context("CG-999", root)


# ---------------------------------------------------------------------------
# Test 16 — multiple dependency paths in graph
# ---------------------------------------------------------------------------

def test_multiple_dependency_paths():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for tid in ["CG-101", "CG-102", "CG-105"]:
            _write_request(root, tid)
            _write_relevance(root, tid)
        # CG-105 → CG-101 → CG-102
        # CG-105 → CG-102 (direct too)
        _write_graph(
            root,
            nodes=[
                {"id": "CG-101", "title": "A"},
                {"id": "CG-102", "title": "B"},
                {"id": "CG-105", "title": "E"},
            ],
            edges=[
                {"type": "logical_dependency", "from": "CG-101", "to": "CG-102", "confidence": 0.95},
                {"type": "logical_dependency", "from": "CG-105", "to": "CG-101", "confidence": 0.95},
                {"type": "logical_dependency", "from": "CG-105", "to": "CG-102", "confidence": 0.95},
            ],
        )

        ctx = build_report_context("CG-102", root)

        assert "CG-101" in ctx.dependencyContext.directPrerequisites
        assert "CG-105" in ctx.dependencyContext.directPrerequisites
        assert "CG-105" in ctx.dependencyContext.allPrerequisites
        # Should find the transitive path CG-105 → CG-101 → CG-102
        assert any(
            len(path) >= 3 and path[0] == "CG-105" and path[-1] == "CG-102"
            for path in ctx.dependencyContext.dependencyPaths
        )


# ---------------------------------------------------------------------------
# Test 17 — shorthand and case-insensitive ticket ID resolution
# ---------------------------------------------------------------------------

def test_shorthand_ticket_id_resolution():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _setup_basic(root, "CG-104")

        # Numeric shorthand: 104 -> CG-104
        ctx_num = build_report_context("104", root)
        assert ctx_num.ticketId == "CG-104"

        # Case-insensitive shorthand: cg-104 -> CG-104
        ctx_case = build_report_context("cg-104", root)
        assert ctx_case.ticketId == "CG-104"

