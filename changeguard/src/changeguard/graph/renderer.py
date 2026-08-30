from pathlib import Path
import json
from datetime import datetime, timezone

from changeguard.models import ChangeGraph


def _mermaid_id(ticket_id: str) -> str:
    """Convert CG-101 → CG101 for Mermaid node IDs."""
    return ticket_id.replace("-", "")


def render_json(graph: ChangeGraph, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(graph.to_dict(), indent=2), encoding="utf-8"
    )


def render_markdown(graph: ChangeGraph, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines: list = []
    lines.append("# ChangeGuard Analysis\n")
    lines.append(f"Generated: {now}\n")

    # Logical Dependencies
    dep_edges = [e for e in graph.edges if e.type == "logical_dependency"]
    lines.append("## Logical Dependencies\n")
    if dep_edges:
        for edge in dep_edges:
            lines.append(f"### {edge.from_} → {edge.to}\n")
            lines.append(f"**Confidence:** {edge.confidence:.0%}\n")
            # Pull evidence from stored pair data if we can, else use label
            lines.append("")
    else:
        lines.append("_No logical dependencies detected above threshold._\n")

    # Change Collisions
    col_edges = [e for e in graph.edges if e.type == "change_collision"]
    lines.append("## Change Collisions\n")
    if col_edges:
        for edge in col_edges:
            a, b = edge.tickets[0], edge.tickets[1] if len(edge.tickets) > 1 else ("?", "?")
            lines.append(f"### {a} ↔ {b}\n")
            lines.append(f"**Confidence:** {edge.confidence:.0%}\n")
            lines.append("")
    else:
        lines.append("_No change collisions detected above threshold._\n")

    # Independent Changes
    lines.append("## Independent Changes\n")
    if graph.independentTickets:
        node_map = {n.id: n.title for n in graph.nodes}
        for tid in graph.independentTickets:
            title = node_map.get(tid, tid)
            lines.append(f"- **{tid}** — {title}")
        lines.append("")
    else:
        lines.append("_All tickets have at least one dependency or collision relationship._\n")

    # Mermaid graph
    lines.append("## Graph\n")
    lines.append("```mermaid")
    lines.append("graph TD\n")
    node_map = {n.id: n.title for n in graph.nodes}
    for node in graph.nodes:
        # Strip characters that break Mermaid: em dash, quotes, brackets
        safe_title = (
            node.title
            .replace("—", "-")
            .replace('"', "")
            .replace("[", "")
            .replace("]", "")
            .replace("(", "")
            .replace(")", "")
        )
        lines.append(f'{_mermaid_id(node.id)}["{node.id} - {safe_title}"]')
    lines.append("")
    for edge in dep_edges:
        lines.append(
            f'{_mermaid_id(edge.from_)} -->|dependency| {_mermaid_id(edge.to)}'
        )
    for edge in col_edges:
        if len(edge.tickets) >= 2:
            lines.append(
                f'{_mermaid_id(edge.tickets[0])} -. collision .- {_mermaid_id(edge.tickets[1])}'
            )
    lines.append("```")

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
