"""Report Renderer — writes .md, .json, and .pdf output files.

The Markdown file contains the LLM-generated developer brief.
The JSON file is a deterministic serialization of the TicketReportContext,
intended for agent consumption — no LLM involved in JSON generation.
The PDF file is a styled version of the Markdown report for sharing/printing.
"""
from __future__ import annotations

import json
from pathlib import Path

from changeguard.report.context import TicketReportContext


def render_markdown(markdown: str, out_path: Path) -> None:
    """Write the LLM-generated Markdown report to disk.

    Args:
        markdown:  The full Markdown string returned by generate_report().
        out_path:  Destination file path (e.g. .changeguard/reports/CG-102.md).
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(markdown, encoding="utf-8")


def render_json(context: TicketReportContext, out_path: Path) -> None:
    """Write the agent-facing JSON report to disk.

    The JSON is built entirely from the deterministic TicketReportContext —
    no LLM output appears here. Schema follows §16 of the spec.

    Args:
        context:  The assembled TicketReportContext.
        out_path: Destination file path (e.g. .changeguard/reports/CG-102.json).
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "schemaVersion": "1.0",
        "ticketId": context.ticketId,
        "title": context.title,
        "status": context.status,
        "dependencyContext": context.dependencyContext.to_dict(),
        "repositoryRelevance": context.repositoryRelevance.to_dict(),
        "collisions": [
            {
                "ticketId": c.ticketId,
                "confidence": c.confidence,
                "sharedFiles": c.sharedFiles,
                "sharedModules": c.sharedModules,
                "evidence": c.evidence,
            }
            for c in context.collisions
        ],
        "unrelatedTickets": context.unrelatedTickets,
    }

    if context.graphWarnings:
        payload["graphWarnings"] = context.graphWarnings

    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def render_pdf(markdown: str, out_path: Path) -> None:
    """Render the LLM-generated Markdown report as a styled PDF.

    Converts Markdown → HTML → PDF using the `markdown` and `fpdf2` libraries.
    Pure Python — no system dependencies (no wkhtmltopdf, no LaTeX, no pandoc).

    Args:
        markdown:  The full Markdown string returned by generate_report().
        out_path:  Destination file path (e.g. .changeguard/reports/CG-102.pdf).
    """
    import unicodedata
    import markdown as md_lib
    from fpdf import FPDF, HTMLMixin

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # ── Sanitize Unicode characters not supported by core PDF fonts ───────────
    # Replace common typographic characters with ASCII equivalents so the
    # built-in Helvetica font can render the report without crashing.
    _REPLACEMENTS = {
        "\u2014": "--",   # em dash
        "\u2013": "-",    # en dash
        "\u2018": "'",    # left single quote
        "\u2019": "'",    # right single quote
        "\u201c": '"',    # left double quote
        "\u201d": '"',    # right double quote
        "\u2026": "...",  # ellipsis
        "\u2192": "->",   # right arrow →
        "\u2190": "<-",   # left arrow ←
        "\u2193": "v",    # down arrow ↓
        "\u2191": "^",    # up arrow ↑
        "\u2705": "[OK]", # ✅
        "\u23f3": "[~]",  # ⏳
        "\u26a0": "[!]",  # ⚠
        "\ufe0f": "",     # variation selector (invisible)
    }
    sanitized = markdown
    for char, replacement in _REPLACEMENTS.items():
        sanitized = sanitized.replace(char, replacement)

    # ── Convert Markdown → HTML body fragment ─────────────────────────────────
    # fpdf2's write_html expects a body fragment (no <html>/<head>/<body> tags)
    html_body = md_lib.markdown(
        sanitized,
        extensions=["tables", "fenced_code"],
    )

    # ── Build PDF ─────────────────────────────────────────────────────────────
    class StyledPDF(FPDF, HTMLMixin):
        pass

    pdf = StyledPDF()
    pdf.set_margins(left=20, top=20, right=20)
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # write_html handles h1-h6, p, ul, ol, li, pre/code, blockquote, table, hr
    pdf.write_html(html_body)

    pdf.output(str(out_path))


