"""Report Context Builder — deterministic, no LLM.

Reads existing ChangeGuard artifacts and assembles a TicketReportContext
that the report generator sends to the LLM in one shot.
"""
from __future__ import annotations

import json
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class MissingTicketError(FileNotFoundError):
    """Raised when requests/<ticket-id>.json does not exist."""


class MissingRelevanceError(FileNotFoundError):
    """Raised when analysis/tickets/<ticket-id>.json does not exist."""


class MissingGraphError(FileNotFoundError):
    """Raised when change-graph.json does not exist."""


# ---------------------------------------------------------------------------
# Report status
# ---------------------------------------------------------------------------

READY = "READY"
PREREQUISITES_PRESENT = "PREREQUISITES_PRESENT"
COORDINATION_REQUIRED = "COORDINATION_REQUIRED"
PREREQUISITES_AND_COORDINATION = "PREREQUISITES_AND_COORDINATION"


def _derive_status(has_prerequisites: bool, has_collisions: bool) -> str:
    if has_prerequisites and has_collisions:
        return PREREQUISITES_AND_COORDINATION
    if has_prerequisites:
        return PREREQUISITES_PRESENT
    if has_collisions:
        return COORDINATION_REQUIRED
    return READY


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class CollisionEntry:
    ticketId: str
    title: str
    confidence: float
    sharedFiles: list[str] = field(default_factory=list)
    sharedModules: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ticketId": self.ticketId,
            "title": self.title,
            "confidence": self.confidence,
            "sharedFiles": self.sharedFiles,
            "sharedModules": self.sharedModules,
            "evidence": self.evidence,
        }


@dataclass
class DependencyContext:
    directPrerequisites: list[str] = field(default_factory=list)
    allPrerequisites: list[str] = field(default_factory=list)
    dependencyPaths: list[list[str]] = field(default_factory=list)
    directDependents: list[str] = field(default_factory=list)
    allDependents: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "directPrerequisites": self.directPrerequisites,
            "allPrerequisites": self.allPrerequisites,
            "dependencyPaths": self.dependencyPaths,
            "directDependents": self.directDependents,
            "allDependents": self.allDependents,
        }


@dataclass
class RepositoryRelevance:
    likelyModules: list[str] = field(default_factory=list)
    likelyFiles: list[dict] = field(default_factory=list)
    relevantSymbols: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "likelyModules": self.likelyModules,
            "likelyFiles": self.likelyFiles,
            "relevantSymbols": self.relevantSymbols,
        }


@dataclass
class TicketReportContext:
    ticketId: str
    title: str
    summary: str
    requirements: list[str]
    acceptanceCriteria: list[str]
    repositoryRelevance: RepositoryRelevance
    dependencyContext: DependencyContext
    collisions: list[CollisionEntry]
    unrelatedTickets: list[str]
    status: str
    graphWarnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ticketId": self.ticketId,
            "title": self.title,
            "summary": self.summary,
            "requirements": self.requirements,
            "acceptanceCriteria": self.acceptanceCriteria,
            "repositoryRelevance": self.repositoryRelevance.to_dict(),
            "dependencyContext": self.dependencyContext.to_dict(),
            "collisions": [c.to_dict() for c in self.collisions],
            "unrelatedTickets": self.unrelatedTickets,
            "status": self.status,
            "graphWarnings": self.graphWarnings,
        }


# ---------------------------------------------------------------------------
# Graph traversal helpers
# ---------------------------------------------------------------------------


def _build_adjacency(edges: list[dict]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Build upstream (prerequisites) and downstream (dependents) adjacency maps.

    Returns (upstream, downstream) where:
        upstream[X]   = list of tickets that X depends on (X's prerequisites)
        downstream[X] = list of tickets that depend on X
    """
    upstream: dict[str, list[str]] = defaultdict(list)
    downstream: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        if edge.get("type") == "logical_dependency":
            frm = edge.get("from")
            to = edge.get("to")
            if frm and to:
                # frm is the prerequisite of `to`
                upstream[to].append(frm)
                downstream[frm].append(to)

    return dict(upstream), dict(downstream)


def _bfs_upstream(ticket_id: str, upstream: dict[str, list[str]]) -> tuple[list[str], list[str], list[str]]:
    """BFS to find all upstream (prerequisite) tickets.

    Returns (direct_prerequisites, all_prerequisites, graph_warnings).
    Cycle detection via visited set.
    """
    warnings: list[str] = []
    direct = list(upstream.get(ticket_id, []))

    visited: set[str] = {ticket_id}
    queue: deque[str] = deque(direct)
    all_prereqs: list[str] = []

    # Track which are direct vs transitive
    for d in direct:
        visited.add(d)

    while queue:
        current = queue.popleft()
        if current not in all_prereqs:
            all_prereqs.append(current)
        for parent in upstream.get(current, []):
            if parent == ticket_id:
                warnings.append(
                    f"Cycle detected: {parent} → ... → {ticket_id} → {parent}. "
                    "Traversal stopped at this edge."
                )
                continue
            if parent not in visited:
                visited.add(parent)
                queue.append(parent)

    return sorted(direct), sorted(all_prereqs), warnings


def _bfs_downstream(ticket_id: str, downstream: dict[str, list[str]]) -> tuple[list[str], list[str], list[str]]:
    """BFS to find all downstream (dependent) tickets.

    Returns (direct_dependents, all_dependents, graph_warnings).
    """
    warnings: list[str] = []
    direct = list(downstream.get(ticket_id, []))

    visited: set[str] = {ticket_id}
    queue: deque[str] = deque(direct)
    all_deps: list[str] = []

    for d in direct:
        visited.add(d)

    while queue:
        current = queue.popleft()
        if current not in all_deps:
            all_deps.append(current)
        for child in downstream.get(current, []):
            if child == ticket_id:
                warnings.append(
                    f"Cycle detected: {ticket_id} → ... → {current} → {ticket_id}. "
                    "Traversal stopped at this edge."
                )
                continue
            if child not in visited:
                visited.add(child)
                queue.append(child)

    return sorted(direct), sorted(all_deps), warnings


def _find_dependency_paths(
    ticket_id: str,
    upstream: dict[str, list[str]],
    all_prereqs: list[str],
) -> list[list[str]]:
    """Find meaningful dependency paths that end at ticket_id.

    A path is a chain of nodes leading up to ticket_id through prerequisite
    edges, e.g. ["CG-105", "CG-101", "CG-102"]. Only paths with 2 or more
    hops (len >= 3 including ticket_id) are included.

    upstream[X] = list of X's direct prerequisites (nodes X depends on).
    """
    # Build a forward map: for each node in all_prereqs, what nodes does it
    # feed into (i.e., what are its dependents within the prereq closure)?
    # forward[A] = [B, ...] means A is a prerequisite of B.
    forward: dict[str, list[str]] = {}
    all_nodes = all_prereqs + [ticket_id]

    for node in all_nodes:
        for prereq in upstream.get(node, []):
            if prereq in all_nodes:
                forward.setdefault(prereq, []).append(node)

    # Roots: prereqs that have no further prerequisites within the prereq closure
    # (i.e., nothing upstream feeds into them from within the set)
    prereq_set = set(all_prereqs)
    roots = [
        p for p in all_prereqs
        if not any(pr in prereq_set for pr in upstream.get(p, []))
    ]

    paths: list[list[str]] = []

    def dfs(current: str, path: list[str], visited: set[str]) -> None:
        if current == ticket_id:
            if len(path) >= 3:  # at least one transitive hop
                paths.append(list(path))
            return
        for child in forward.get(current, []):
            if child not in visited:
                visited.add(child)
                path.append(child)
                dfs(child, path, visited)
                path.pop()
                visited.discard(child)

    for root in roots:
        dfs(root, [root], {root})

    return paths


# ---------------------------------------------------------------------------
# Collision helpers
# ---------------------------------------------------------------------------


def _collect_collisions(
    ticket_id: str,
    pairs_dir: Path,
    node_titles: dict[str, str],
) -> list[CollisionEntry]:
    """Scan all pair files involving ticket_id and collect collision entries."""
    collisions: list[CollisionEntry] = []

    if not pairs_dir.exists():
        return collisions

    for pair_file in sorted(pairs_dir.glob("*.json")):
        try:
            data = json.loads(pair_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        tickets = data.get("tickets", [])
        if ticket_id not in tickets:
            continue

        cc = data.get("changeCollision", {})
        if not cc.get("exists", False):
            continue

        other_id = next((t for t in tickets if t != ticket_id), None)
        if not other_id:
            continue

        collisions.append(
            CollisionEntry(
                ticketId=other_id,
                title=node_titles.get(other_id, other_id),
                confidence=cc.get("confidence", 0.0),
                sharedFiles=cc.get("sharedFiles", []),
                sharedModules=cc.get("sharedModules", []),
                evidence=cc.get("evidence", []),
            )
        )

    # Sort by confidence descending so the most critical appears first
    collisions.sort(key=lambda c: c.confidence, reverse=True)
    return collisions


# ---------------------------------------------------------------------------
# Unrelated ticket detection
# ---------------------------------------------------------------------------


def _find_unrelated_tickets(
    ticket_id: str,
    all_node_ids: list[str],
    all_prereqs: list[str],
    all_dependents: list[str],
    collision_ids: list[str],
) -> list[str]:
    """Return tickets with no dependency relationship and no collision."""
    related: set[str] = set(all_prereqs) | set(all_dependents) | set(collision_ids) | {ticket_id}
    return sorted(nid for nid in all_node_ids if nid not in related)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_report_context(ticket_id: str, output_root: Path) -> TicketReportContext:
    """Assemble a TicketReportContext for the given ticket.

    Reads from:
        output_root/requests/<ticket_id>.json
        output_root/analysis/tickets/<ticket_id>.json
        output_root/change-graph.json
        output_root/analysis/pairs/*.json

    Raises:
        MissingTicketError      — if the requests JSON is absent
        MissingRelevanceError   — if the relevance analysis JSON is absent
        MissingGraphError       — if change-graph.json is absent
    """
    requests_dir = output_root / "requests"
    relevance_dir = output_root / "analysis" / "tickets"
    pairs_dir = output_root / "analysis" / "pairs"
    graph_path = output_root / "change-graph.json"

    # ── 1. Resolve & Load ticket request ─────────────────────────────────────
    normalized_id = ticket_id.strip()
    request_path = requests_dir / f"{normalized_id}.json"

    if not request_path.exists():
        candidates = [
            normalized_id.upper(),
            f"CG-{normalized_id}" if normalized_id.isdigit() else f"CG-{normalized_id.upper()}",
        ]
        for cand in candidates:
            if (requests_dir / f"{cand}.json").exists():
                normalized_id = cand
                request_path = requests_dir / f"{cand}.json"
                break
        else:
            # Case-insensitive scan
            if requests_dir.exists():
                for f in requests_dir.glob("*.json"):
                    if f.stem.lower() == normalized_id.lower() or f.stem.lower() == f"cg-{normalized_id.lower()}":
                        normalized_id = f.stem
                        request_path = f
                        break

    if not request_path.exists():
        raise MissingTicketError(
            f"Ticket not found: no request file at {request_path}.\n"
            "Run 'changeguard run' first to process the inbox."
        )
    request_data = json.loads(request_path.read_text(encoding="utf-8"))
    ticket_id = request_data.get("id", request_path.stem)

    # ── 2. Load repository relevance analysis ────────────────────────────────
    relevance_path = relevance_dir / f"{ticket_id}.json"
    if not relevance_path.exists():
        raise MissingRelevanceError(
            f"Report cannot be generated because repository relevance analysis "
            f"for {ticket_id} is missing.\n"
            "Run 'changeguard run' to generate it."
        )
    relevance_data = json.loads(relevance_path.read_text(encoding="utf-8"))

    # ── 3. Load change graph ─────────────────────────────────────────────────
    if not graph_path.exists():
        raise MissingGraphError(
            f"change-graph.json not found at {graph_path}.\n"
            "Run 'changeguard run' to build the graph."
        )
    graph_data = json.loads(graph_path.read_text(encoding="utf-8"))

    # Build node title lookup
    node_titles: dict[str, str] = {
        node["id"]: node.get("title", node["id"])
        for node in graph_data.get("nodes", [])
    }
    all_node_ids: list[str] = list(node_titles.keys())

    # ── 4. Build adjacency maps and traverse ─────────────────────────────────
    edges = graph_data.get("edges", [])
    upstream_map, downstream_map = _build_adjacency(edges)

    graph_warnings: list[str] = []

    direct_prereqs, all_prereqs, up_warnings = _bfs_upstream(ticket_id, upstream_map)
    graph_warnings.extend(up_warnings)

    direct_deps, all_deps, down_warnings = _bfs_downstream(ticket_id, downstream_map)
    graph_warnings.extend(down_warnings)

    dep_paths = _find_dependency_paths(ticket_id, upstream_map, all_prereqs)

    # ── 5. Collisions ────────────────────────────────────────────────────────
    collisions = _collect_collisions(ticket_id, pairs_dir, node_titles)
    collision_ids = [c.ticketId for c in collisions]

    # ── 6. Unrelated tickets ─────────────────────────────────────────────────
    unrelated = _find_unrelated_tickets(
        ticket_id, all_node_ids, all_prereqs, all_deps, collision_ids
    )

    # ── 7. Status ────────────────────────────────────────────────────────────
    status = _derive_status(
        has_prerequisites=bool(direct_prereqs),
        has_collisions=bool(collisions),
    )

    # ── 8. Repository relevance ──────────────────────────────────────────────
    repo_relevance = RepositoryRelevance(
        likelyModules=relevance_data.get("likelyModules", []),
        likelyFiles=relevance_data.get("likelyFiles", []),
        relevantSymbols=relevance_data.get("relevantSymbols", []),
    )

    return TicketReportContext(
        ticketId=ticket_id,
        title=request_data.get("title", ticket_id),
        summary=request_data.get("summary", ""),
        requirements=request_data.get("requirements", []),
        acceptanceCriteria=request_data.get("acceptanceCriteria", []),
        repositoryRelevance=repo_relevance,
        dependencyContext=DependencyContext(
            directPrerequisites=direct_prereqs,
            allPrerequisites=all_prereqs,
            dependencyPaths=dep_paths,
            directDependents=direct_deps,
            allDependents=all_deps,
        ),
        collisions=collisions,
        unrelatedTickets=unrelated,
        status=status,
        graphWarnings=graph_warnings,
    )
