"""Integration tests: apply sed commands to fixtures, verify entities are eliminated."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from generate_sed import generate_commands
from conftest import discover_fixture_ids, load_answer_key, load_map, FIXTURE_DIR

SCRIPT = str(Path(__file__).parent.parent / "scripts" / "generate_sed.py")


def apply_sed(commands: list[str], filepath: Path):
    """Apply a list of sed commands to a file using BSD sed."""
    for cmd in commands:
        result = subprocess.run(
            ["sed", "-i", "", cmd, str(filepath)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"sed failed on {filepath}: {result.stderr}")


def check_no_entities_survive(filepath: Path, answer_key: dict):
    """Assert that no answer-key entities appear in the file content."""
    content = filepath.read_text()
    survivors = []
    for entity in answer_key:
        if entity in content:
            survivors.append(entity)
    assert survivors == [], f"Entities survived in {filepath.name}: {survivors}"


# --- Parametrized fixture tests ---

FIXTURE_IDS = discover_fixture_ids()


@pytest.mark.parametrize("fixture_id", FIXTURE_IDS)
def test_sed_eliminates_all_entities(fixture_id, tmp_fixture):
    """For each fixture: sed commands eliminate all answer-key entities."""
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)


# --- Specific edge case tests ---


def test_overlapping_entities_no_corruption(tmp_fixture):
    """Overlapping entities (Acme Corporation/Acme Corp/Acme) handled correctly."""
    fixture_id = "09-overlapping-and-collisions"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)

    content = filepath.read_text()
    check_no_entities_survive(filepath, answer_key)

    # Verify the replacements are present (longest-first ordering worked)
    assert "Zephyr Industries" in content
    assert "Zephyr Inc" in content
    assert "Pinnacle Labs" in content


def test_entities_in_markdown_links(tmp_fixture):
    """Entities inside markdown links are replaced without breaking syntax."""
    fixture_id = "04-urls-and-domains"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)

    content = filepath.read_text()
    # The markdown link should still be valid (has ]( structure)
    assert "](" in content


def test_entities_in_fenced_code_blocks(tmp_fixture):
    """Entities inside fenced code blocks are replaced."""
    fixture_id = "05-api-keys-and-secrets"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)


def test_entities_in_code_heavy_doc(tmp_fixture):
    """Entities in a code-heavy document with multiple fenced blocks are replaced."""
    fixture_id = "10-code-heavy"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)


def test_entities_in_bold_italic_formatting(tmp_fixture):
    """Entities inside bold/italic markdown formatting are replaced."""
    fixture_id = "08-markdown-formatting"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)

    content = filepath.read_text()
    # Verify bold and italic markers still present
    assert "**" in content
    assert "*" in content


def test_dense_document_fully_processed(tmp_fixture):
    """Dense document with 20+ entities is fully processed."""
    fixture_id = "07-mixed-dense"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    assert len(commands) >= 20, f"Expected 20+ commands, got {len(commands)}"

    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)


def test_empty_replacement_map_leaves_document_unchanged(tmp_fixture):
    """Empty replacement map produces no sed commands; document is unchanged."""
    fixture_id = "01-companies-and-products"
    filepath = tmp_fixture(fixture_id)
    original = filepath.read_text()

    commands = generate_commands({})
    assert commands == []
    # No sed to apply — document should be identical
    assert filepath.read_text() == original


def test_collision_free_replacements_produce_correct_output(tmp_fixture):
    """When replacements are collision-free, output contains only replacement values."""
    fixture_id = "09-overlapping-and-collisions"
    filepath = tmp_fixture(fixture_id)
    replacement_map = load_map(fixture_id)
    answer_key = load_answer_key(fixture_id)

    commands = generate_commands(replacement_map["entities"])
    apply_sed(commands, filepath)
    check_no_entities_survive(filepath, answer_key)

    content = filepath.read_text()
    # None of the original entities should remain
    for entity in answer_key:
        assert entity not in content, f"Entity '{entity}' survived"
    # All replacements should be present
    for info in replacement_map["entities"].values():
        replacement = info["replacement"] if isinstance(info, dict) else info
        assert replacement in content, f"Replacement '{replacement}' missing from output"
