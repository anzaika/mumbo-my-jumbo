"""E2E tests: full detect → sed → verify pipeline with LLM calls.

Marked slow — skipped by default with `pytest -m "not slow"`.
Requires: `pip install anthropic` and ANTHROPIC_API_KEY env var.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from generate_sed import generate_commands
from conftest import discover_fixture_ids, load_answer_key, FIXTURE_DIR

pytestmark = pytest.mark.slow

DETECTION_PROMPT = """You are analyzing markdown documents to identify sensitive entities that need to be obfuscated for public sharing.

Read the document below and identify ALL sensitive entities.

Entity categories to detect:
- Company names (internal/proprietary — NOT well-known public companies like Google, AWS, Microsoft)
- People's names (employees, contacts — NOT public figures)
- Domains and URLs (internal domains — not public services like github.com, npmjs.com)
- Email addresses (full address: local part + domain)
- API keys, tokens, and secrets (in code blocks or inline)
- Internal tool names, project codenames, team names
- IP addresses and internal hostnames

Rules:
- Replace internal/proprietary entities with realistic-sounding alternatives
- Leave well-known public entities unchanged (Google, AWS, React, Kubernetes, PostgreSQL, etc.)
- Generate consistent replacements: all variants of an entity map to consistent variants of the replacement
- Include case variations in the map
- For secrets/API keys, use obviously-fake placeholders (sk-REDACTED-KEY, ghp_EXAMPLE_TOKEN)
- For domains in URLs, replace only the domain portion — preserve the path

Return ONLY a JSON replacement map in this exact format:
{{
  "entities": {{
    "Entity Name": {{ "replacement": "Replacement Name", "type": "category" }}
  }}
}}

## Document
{content}"""


def skip_if_no_anthropic():
    """Skip test if anthropic SDK or API key is unavailable."""
    try:
        import anthropic  # noqa: F401
    except ImportError:
        pytest.skip("anthropic SDK not installed")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")


def detect_entities(content: str) -> dict:
    """Call Haiku to detect entities in document content."""
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": DETECTION_PROMPT.format(content=content),
        }],
    )
    text = response.content[0].text
    # Extract JSON from response (may be wrapped in markdown code block)
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


def apply_sed(commands: list[str], filepath: Path):
    """Apply sed commands to a file."""
    for cmd in commands:
        result = subprocess.run(
            ["sed", "-i", "", cmd, str(filepath)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"sed failed: {result.stderr}")


# Use a subset of fixtures for E2E to keep costs down
E2E_FIXTURES = ["01-companies-and-products", "03-emails-and-contacts", "07-mixed-dense"]


@pytest.mark.parametrize("fixture_id", E2E_FIXTURES)
def test_full_pipeline_eliminates_entities(fixture_id, tmp_fixture):
    """Full pipeline: detect → sed → grep verify eliminates all answer-key entities."""
    skip_if_no_anthropic()

    filepath = tmp_fixture(fixture_id)
    original = filepath.read_text()
    answer_key = load_answer_key(fixture_id)

    # Step 1: Detect entities via LLM
    detection_result = detect_entities(original)
    assert "entities" in detection_result, "Detection did not return entities key"

    # Step 2: Generate sed commands
    commands = generate_commands(detection_result["entities"])
    assert len(commands) > 0, "No sed commands generated"

    # Step 3: Apply sed
    apply_sed(commands, filepath)

    # Step 4: Grep verification — check no answer-key entities survive
    obfuscated = filepath.read_text()
    survivors = [e for e in answer_key if e in obfuscated]
    assert survivors == [], f"Entities survived: {survivors}"


@pytest.mark.parametrize("fixture_id", E2E_FIXTURES)
def test_llm_judge_confirms_obfuscation(fixture_id, tmp_fixture, llm_judge):
    """LLM judge confirms no sensitive information survives."""
    filepath = tmp_fixture(fixture_id)
    original = filepath.read_text()
    answer_key = load_answer_key(fixture_id)

    # Detect and apply
    detection_result = detect_entities(original)
    commands = generate_commands(detection_result["entities"])
    apply_sed(commands, filepath)
    obfuscated = filepath.read_text()

    # LLM judge
    verdict = llm_judge(original, obfuscated, detection_result)
    assert verdict["pass"] is True, f"LLM judge failed: {verdict.get('reasoning', '')}"
    assert verdict["leaked_entities"] == [], f"Leaked: {verdict['leaked_entities']}"


def test_e2e_skips_without_api_key(monkeypatch):
    """E2E tests skip gracefully when ANTHROPIC_API_KEY is not set."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(pytest.skip.Exception):
        skip_if_no_anthropic()
