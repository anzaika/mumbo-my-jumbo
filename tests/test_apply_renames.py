"""Unit tests for apply_replacements() as a pure function."""

from generate_renames import apply_replacements


class TestApplyReplacements:
    def test_single_entity(self):
        entities = [("acme", "northwind")]
        assert apply_replacements("acme-guide.md", entities) == "northwind-guide.md"

    def test_longest_first_ordering(self):
        entities = [("acme-corp", "northwind-inc"), ("acme", "northwind")]
        assert apply_replacements("acme-corp-guide.md", entities) == "northwind-inc-guide.md"

    def test_no_double_replacement(self):
        """Critical: replacement output must not be re-matched."""
        entities = [("north", "acme"), ("acme", "zephyr")]
        assert apply_replacements("north-docs", entities) == "acme-docs"

    def test_no_match_passthrough(self):
        entities = [("acme", "northwind")]
        assert apply_replacements("readme.md", entities) == "readme.md"

    def test_empty_entities(self):
        assert apply_replacements("readme.md", []) == "readme.md"

    def test_multiple_occurrences(self):
        entities = [("acme", "northwind")]
        assert apply_replacements("acme-acme.md", entities) == "northwind-northwind.md"

    def test_case_insensitive_matching(self):
        entities = [("Acme", "Northwind")]
        assert apply_replacements("ACME-guide.md", entities) == "Northwind-guide.md"

    def test_overlapping_entities(self):
        """Longer entity should win over shorter."""
        entities = [("acme-corporation", "northwind-industries"), ("acme", "northwind")]
        result = apply_replacements("acme-corporation-guide.md", entities)
        assert result == "northwind-industries-guide.md"

    def test_entity_is_entire_basename(self):
        entities = [("acme", "northwind")]
        assert apply_replacements("acme", entities) == "northwind"

    def test_special_regex_chars_in_entity(self):
        entities = [("acme.corp", "northwind.co")]
        assert apply_replacements("acme.corp-guide.md", entities) == "northwind.co-guide.md"
