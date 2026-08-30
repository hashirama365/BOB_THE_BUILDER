"""Test graph builder logic (no LLM calls — uses fixture JSON files)."""
import json
import tempfile
from pathlib import Path
from dataclasses import dataclass

from changeguard.graph.builder import build_graph


@dataclass
class _FakeAnalysis:
    dependency_confidence_threshold: float = 0.70
    collision_confidence_threshold: float = 0.70


@dataclass
class _FakeConfig:
    analysis: _FakeAnalysis = None

    def __post_init__(self):
        if self.analysis is None:
            self.analysis = _FakeAnalysis()


def _write_pair(pairs_dir: Path, a: str, b: str, dep: bool, col: bool):
    data = {
        "schemaVersion": "1.0",
        "tickets": [a, b],
        "logicalDependency": {
            "exists": dep,
            "prerequisite": a if dep else None,
            "dependent": b if dep else None,
            "confidence": 0.92 if dep else 0.0,
            "evidence": [],
        },
        "changeCollision": {
            "exists": col,
            "confidence": 0.85 if col else 0.0,
            "sharedFiles": [],
            "sharedModules": [],
            "evidence": [],
        },
        "independent": not dep and not col,
    }
    (pairs_dir / f"{a}__{b}.json").write_text(json.dumps(data), encoding="utf-8")


def _write_request(requests_dir: Path, ticket_id: str, title: str):
    data = {"id": ticket_id, "title": title}
    (requests_dir / f"{ticket_id}.json").write_text(json.dumps(data), encoding="utf-8")


def test_graph_builder_produces_correct_nodes_and_edges():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs_dir = Path(tmpdir) / "pairs"
        requests_dir = Path(tmpdir) / "requests"
        pairs_dir.mkdir()
        requests_dir.mkdir()

        # CG-101/CG-102: dep=Yes, col=Yes
        _write_pair(pairs_dir, "CG-101", "CG-102", dep=True, col=True)
        # CG-101/CG-103: dep=Yes, col=No
        _write_pair(pairs_dir, "CG-101", "CG-103", dep=True, col=False)
        # CG-101/CG-104: dep=No, col=No (independent)
        _write_pair(pairs_dir, "CG-101", "CG-104", dep=False, col=False)
        # CG-101/CG-105: dep=No, col=Yes
        _write_pair(pairs_dir, "CG-101", "CG-105", dep=False, col=True)

        for tid in ["CG-101", "CG-102", "CG-103", "CG-104", "CG-105"]:
            _write_request(requests_dir, tid, f"Title of {tid}")

        config = _FakeConfig()
        config.analysis.dependency_confidence_threshold = 0.70
        config.analysis.collision_confidence_threshold = 0.70

        graph = build_graph(pairs_dir, requests_dir, config)

        node_ids = {n.id for n in graph.nodes}
        assert {"CG-101", "CG-102", "CG-103", "CG-104", "CG-105"} == node_ids

        dep_edges = [e for e in graph.edges if e.type == "logical_dependency"]
        col_edges = [e for e in graph.edges if e.type == "change_collision"]

        assert len(dep_edges) == 2, f"Expected 2 dep edges, got {len(dep_edges)}"
        assert len(col_edges) == 2, f"Expected 2 col edges, got {len(col_edges)}"

        # CG-104 is the only independent ticket
        assert graph.independentTickets == ["CG-104"]
