"""Integration tests: create directory trees, run rename pipeline, verify results."""

import json
import os

from generate_renames import apply_replacements, compute_renames, check_collisions


class TestRenameIntegration:
    def _create_tree(self, tmp_path, structure: list[str]):
        """Create files/dirs from a list of paths. Dirs end with /."""
        for p in structure:
            full = tmp_path / p.rstrip("/")
            if p.endswith("/"):
                full.mkdir(parents=True, exist_ok=True)
            else:
                full.parent.mkdir(parents=True, exist_ok=True)
                full.write_text(f"content of {p}")

    def _collect_paths(self, tmp_path) -> list[str]:
        """Collect all paths relative to tmp_path."""
        paths = []
        for root, dirs, files in os.walk(tmp_path):
            # Skip hidden
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            rel = os.path.relpath(root, tmp_path)
            if rel != ".":
                paths.append(rel)
            for f in files:
                if not f.startswith("."):
                    paths.append(os.path.join(rel, f) if rel != "." else f)
        return paths

    def _execute_renames(self, tmp_path, renames):
        """Execute renames using os.rename, relative to tmp_path."""
        for r in renames:
            old = tmp_path / r["old"]
            new = tmp_path / r["new"]
            os.rename(old, new)

    def test_full_rename_pipeline(self, tmp_path):
        self._create_tree(tmp_path, [
            "acme-docs/",
            "acme-docs/acme-guide.md",
            "acme-docs/readme.md",
        ])
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = self._collect_paths(tmp_path)
        renames = compute_renames(paths, entities)
        collisions = check_collisions(renames, paths)
        assert collisions == []

        self._execute_renames(tmp_path, renames)

        result_paths = self._collect_paths(tmp_path)
        assert "northwind-docs" in result_paths
        assert "northwind-docs/northwind-guide.md" in [
            p.replace(os.sep, "/") for p in result_paths
        ] or os.path.join("northwind-docs", "northwind-guide.md") in result_paths
        assert "acme-docs" not in result_paths

    def test_mixed_file_types(self, tmp_path):
        self._create_tree(tmp_path, [
            "acme-config.yaml",
            "acme-deploy.sh",
            "readme.md",
        ])
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = self._collect_paths(tmp_path)
        renames = compute_renames(paths, entities)
        assert len(renames) == 2  # yaml and sh, not readme

    def test_hidden_files_excluded(self, tmp_path):
        self._create_tree(tmp_path, [
            ".acme-config",
            "acme-guide.md",
        ])
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = self._collect_paths(tmp_path)
        renames = compute_renames(paths, entities)
        assert len(renames) == 1
        assert renames[0]["old"] == "acme-guide.md"

    def test_collision_aborts(self, tmp_path):
        self._create_tree(tmp_path, [
            "foo.md",
            "bar.md",  # already exists
        ])
        entities = {"foo": {"replacement": "bar", "type": "test"}}
        paths = self._collect_paths(tmp_path)
        renames = compute_renames(paths, entities)
        collisions = check_collisions(renames, paths)
        assert len(collisions) == 1

    def test_deep_nesting(self, tmp_path):
        self._create_tree(tmp_path, [
            "acme-project/acme-docs/acme-guide.md",
        ])
        entities = {"acme": {"replacement": "northwind", "type": "company"}}
        paths = self._collect_paths(tmp_path)
        renames = compute_renames(paths, entities)

        # Should be ordered deepest first
        assert len(renames) == 3
        assert renames[0]["old"].count(os.sep) >= renames[1]["old"].count(os.sep)

        # Execute and verify
        self._execute_renames(tmp_path, renames)
        result_paths = self._collect_paths(tmp_path)
        assert all("acme" not in p for p in result_paths)
