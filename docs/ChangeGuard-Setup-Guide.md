# ChangeGuard — Setup Guide

Everything you need to install ChangeGuard and get it running in your terminal from scratch.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.9 or later |
| pip | bundled with Python |
| An LLM API key | Google Gemini **or** IBM Bob |

---

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd BOB_THE_BUILDER
```

---

## 2. Install ChangeGuard

Navigate to the `changeguard/` directory and install the package in editable mode:

```bash
cd changeguard
pip3 install -e ".[dev]"
```

The `.[dev]` flag also installs `pytest` so you can run the test suite.

> [!NOTE]
> pip will install the `changeguard` CLI script into your Python user bin directory:
> `~/Library/Python/3.x/bin/changeguard`
> This is **not** on your PATH by default — see Step 3.

---

## 3. Add ChangeGuard to Your PATH

Run the following once in your terminal to permanently add the Python user bin directory to your shell PATH:

```bash
echo 'export PATH="$HOME/Library/Python/3.9/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

> [!IMPORTANT]
> If you are using a different Python version (e.g. 3.11 or 3.12), replace `3.9` with your version:
> ```bash
> python3 --version          # check your version first
> echo 'export PATH="$HOME/Library/Python/3.11/bin:$PATH"' >> ~/.zshrc
> source ~/.zshrc
> ```

**Verify** the command is now found:

```bash
changeguard --help
```

You should see:

```
Usage: changeguard [OPTIONS] COMMAND [ARGS]...

  ChangeGuard — change intelligence workflow powered by Bob.

Options:
  --help  Show this message and exit.

Commands:
  report  Generate a developer brief for a specific ticket.
  run     Analyze change requests and produce the Change Conflict Graph.
```

---

## 4. Configure Your API Key

ChangeGuard supports two LLM providers. Set up whichever you are using.

### Option A — Google Gemini (recommended)

Create a key file next to `changeguard.yaml`:

```json
// changeguard/changeguard_gemini_key.json
{
  "apikey": "your-gemini-api-key-here"
}
```

Or use an environment variable instead:

```bash
export GEMINI_API_KEY="your-gemini-api-key-here"
```

### Option B — IBM Bob

Create a key file next to `changeguard.yaml`:

```json
// changeguard/changeguard_ibm_key.json
{
  "apikey": "your-bob-api-key-here",
  "base_url": "https://your-instance.bob.ibm.com/v1"
}
```

Or use environment variables:

```bash
export BOB_API_KEY="your-bob-api-key-here"
```

---

## 5. Configure `changeguard.yaml`

The config file lives at `changeguard/changeguard.yaml` and controls all paths and model settings.

```yaml
version: 1

llm:
  model: models/gemini-2.0-flash   # or your preferred model

repository:
  path: ..                          # path to the codebase being analyzed

change_requests:
  inbox: ../change-requests/inbox       # drop ticket files here
  attachments: ../change-requests/attachments

output:
  root: ./.changeguard              # all outputs written here

ingestion:
  allowed_extensions: [.md, .txt, .pdf, .docx]

analysis:
  dependency_confidence_threshold: 0.70
  collision_confidence_threshold: 0.70
```

> [!IMPORTANT]
> All paths in `changeguard.yaml` are relative to the location of the config file itself. The defaults assume you run `changeguard run` from inside the `changeguard/` directory.

---

## 6. Verify Installation

Run the test suite to confirm everything is working:

```bash
cd changeguard
python3 -m pytest tests/ -v
```

All 38 tests should pass. ✅

---

## Folder Structure After Setup

```
BOB_THE_BUILDER/
├── change-requests/
│   ├── inbox/          ← drop ticket files here (.md, .txt, .pdf, .docx)
│   └── attachments/    ← optional attachments referenced by tickets
├── changeguard/
│   ├── changeguard.yaml
│   ├── changeguard_gemini_key.json   ← your API key (gitignored)
│   ├── .changeguard/                 ← all generated outputs live here
│   │   ├── normalized/
│   │   ├── requests/
│   │   ├── analysis/
│   │   │   ├── tickets/
│   │   │   └── pairs/
│   │   ├── change-graph.json
│   │   ├── change-graph.md
│   │   └── reports/                  ← ticket reports written here
│   └── src/changeguard/
└── server/ client/ ...               ← your application codebase
```

---

## Quick Command Reference

```bash
# Install
pip3 install -e ".[dev]"

# Add to PATH (one-time)
echo 'export PATH="$HOME/Library/Python/3.9/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Run full analysis pipeline
cd changeguard
changeguard run

# Generate a ticket report
changeguard report CG-102

# Run tests
python3 -m pytest tests/ -v
```
