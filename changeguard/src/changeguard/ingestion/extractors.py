from pathlib import Path


def extract_markdown(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def extract_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs)


def extract(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".md":
        return extract_markdown(path)
    elif suffix == ".txt":
        return extract_text(path)
    elif suffix == ".pdf":
        return extract_pdf(path)
    elif suffix == ".docx":
        return extract_docx(path)
    else:
        raise ValueError(f"Unsupported file extension: {suffix!r} for file {path}")
