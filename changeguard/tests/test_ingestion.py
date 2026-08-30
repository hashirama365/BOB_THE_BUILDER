"""Test file extraction (no LLM calls)."""
import tempfile
from pathlib import Path

from changeguard.ingestion.extractors import extract_markdown, extract_text, extract


def test_extract_markdown_returns_raw_content():
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False, encoding="utf-8") as f:
        f.write("# Hello\n\nThis is a test ticket.\n")
        path = Path(f.name)
    result = extract_markdown(path)
    assert "Hello" in result
    assert "test ticket" in result


def test_extract_text_returns_raw_content():
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False, encoding="utf-8") as f:
        f.write("Plain text ticket content.\n")
        path = Path(f.name)
    result = extract_text(path)
    assert "Plain text ticket content." in result


def test_extract_dispatches_md():
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False, encoding="utf-8") as f:
        f.write("dispatched content")
        path = Path(f.name)
    assert extract(path) == "dispatched content"


def test_extract_dispatches_txt():
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False, encoding="utf-8") as f:
        f.write("txt dispatched")
        path = Path(f.name)
    assert extract(path) == "txt dispatched"


def test_extract_raises_for_unsupported_extension():
    import pytest
    with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
        path = Path(f.name)
    with pytest.raises(ValueError, match="Unsupported"):
        extract(path)
