from pathlib import Path
import json
from datetime import datetime, timezone

from changeguard.models import ChangeGraph, GraphNode, GraphEdge
from changeguard.config import Config


def build_graph(pairs_dir: Path, requests_dir: Path, config: Config) -> ChangeGraph:
    # Load ticket titles from requests JSON files
    ticket_titles: dict = {}
    if requests_dir.exists():
        for req_file in requests_dir.glob("*.json"):
            try:
                data = json.loads(req_file.read_text(encoding="utf-8"))
                tid = data.get("id", req_file.stem)
                ticket_titles[tid] = data.get("title", tid)
            except Exception:
                pass

    dep_thresh = config.analysis.dependency_confidence_threshold
    col_thresh = config.analysis.collision_confidence_threshold

    nodes_set: set = set()
    edges: list = []

    if pairs_dir.exists():
        for pair_file in sorted(pairs_dir.glob("*.json")):
            try:
                data = json.loads(pair_file.read_text(encoding="utf-8"))
            except Exception:
                continue

            tickets = data.get("tickets", [])
            for t in tickets:
                nodes_set.add(t)

            ld = data.get("logicalDependency", {})
            if ld.get("exists") and ld.get("confidence", 0) >= dep_thresh:
                edges.append(
                    GraphEdge(
                        type="logical_dependency",
                        from_=ld.get("prerequisite"),
                        to=ld.get("dependent"),
                        confidence=ld.get("confidence", 1.0),
                        tickets=[],
                    )
                )

            cc = data.get("changeCollision", {})
            if cc.get("exists") and cc.get("confidence", 0) >= col_thresh:
                edges.append(
                    GraphEdge(
                        type="change_collision",
                        from_=None,
                        to=None,
                        confidence=cc.get("confidence", 1.0),
                        tickets=list(tickets),
                    )
                )

    # Tickets that appear in any edge
    connected: set = set()
    for edge in edges:
        if edge.type == "logical_dependency":
            if edge.from_:
                connected.add(edge.from_)
            if edge.to:
                connected.add(edge.to)
        elif edge.type == "change_collision":
            connected.update(edge.tickets)

    independent_tickets = sorted(nodes_set - connected)

    nodes = [
        GraphNode(id=tid, title=ticket_titles.get(tid, tid))
        for tid in sorted(nodes_set)
    ]

    return ChangeGraph(
        schemaVersion="1.0",
        nodes=nodes,
        edges=edges,
        independentTickets=independent_tickets,
    )


def _mermaid_id(ticket_id: str) -> str:
    """Convert CG-101 → CG101 for Mermaid node IDs."""
    return ticket_id.replace("-", "")
