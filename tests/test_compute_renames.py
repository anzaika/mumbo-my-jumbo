"""Unit tests for compute_renames() and check_collisions()."""

from generate_renames import compute_renames, check_collisions


class TestComputeRenames:
    def test_basic_rename(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = ["target/acme-guide.md"]
        renames = compute_renames(paths, entities)
        assert len(renames) == 1
        assert renames[0] == {"old": "target/acme-guide.md", "new": "target/northwind-guide.md"}

    def test_depth_ordering(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = ["target/acme-docs", "target/acme-docs/acme-guide.md"]
        renames = compute_renames(paths, entities)
        assert len(renames) == 2
        # Deepest first
        assert renames[0]["old"] == "target/acme-docs/acme-guide.md"
        assert renames[1]["old"] == "target/acme-docs"

    def test_hidden_file_skip(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = [".acme-config", "target/.acme-hidden"]
        renames = compute_renames(paths, entities)
        assert renames == []

    def test_no_rename_needed(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = ["target/readme.md"]
        renames = compute_renames(paths, entities)
        assert renames == []

    def test_strips_trailing_separator(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = ["target/acme-docs/"]
        renames = compute_renames(paths, entities)
        assert len(renames) == 1
        assert renames[0]["old"] == "target/acme-docs"

    def test_plain_string_values(self):
        entities = {"acme": "northwind"}
        paths = ["acme-guide.md"]
        renames = compute_renames(paths, entities)
        assert renames[0] == {"old": "acme-guide.md", "new": "northwind-guide.md"}

    def test_directory_rename(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = ["target/acme-docs"]
        renames = compute_renames(paths, entities)
        assert renames[0] == {"old": "target/acme-docs", "new": "target/northwind-docs"}

    def test_empty_paths(self):
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        assert compute_renames([], entities) == []

    def test_empty_entities(self):
        assert compute_renames(["target/acme.md"], {}) == []


class TestCheckCollisions:
    def test_no_collisions(self):
        renames = [{"old": "a.md", "new": "b.md"}]
        all_paths = ["a.md", "c.md"]
        assert check_collisions(renames, all_paths) == []

    def test_renamed_vs_renamed_collision(self):
        renames = [
            {"old": "FOO.md", "new": "bar.md"},
            {"old": "foo.md", "new": "bar.md"},
        ]
        errors = check_collisions(renames, ["FOO.md", "foo.md"])
        assert len(errors) == 1
        assert "both map to" in errors[0]

    def test_renamed_vs_existing_collision(self):
        renames = [{"old": "acme.md", "new": "northwind.md"}]
        all_paths = ["acme.md", "northwind.md"]
        errors = check_collisions(renames, all_paths)
        assert len(errors) == 1
        assert "already exists" in errors[0]

    def test_case_insensitive_collision(self):
        renames = [{"old": "acme.md", "new": "Northwind.md"}]
        all_paths = ["acme.md", "northwind.md"]
        errors = check_collisions(renames, all_paths)
        assert len(errors) == 1
