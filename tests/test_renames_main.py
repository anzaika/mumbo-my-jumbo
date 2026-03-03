"""Unit tests for generate_renames.py main() exit codes and stderr."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = str(Path(__file__).parent.parent / "scripts" / "generate_renames.py")


def run_script(stdin_data=None, args=None):
    """Run generate_renames.py as a subprocess and return the result."""
    cmd = [sys.executable, SCRIPT]
    if args:
        cmd.extend(args)
    return subprocess.run(
        cmd,
        input=stdin_data,
        capture_output=True,
        text=True,
    )


class TestRenamesMainExitCodes:
    def test_missing_arg_exits_1(self):
        result = run_script(stdin_data="some/path\n")
        assert result.returncode == 1
        assert "missing" in result.stderr.lower()

    def test_nonexistent_file_exits_1(self):
        result = run_script(args=["/tmp/does-not-exist-99999.json"], stdin_data="")
        assert result.returncode == 1
        assert "file not found" in result.stderr

    def test_malformed_json_exits_1(self, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text("not json{{{")
        result = run_script(args=[str(f)], stdin_data="")
        assert result.returncode == 1
        assert "invalid JSON" in result.stderr

    def test_empty_entities_outputs_empty_array(self, tmp_path):
        f = tmp_path / "map.json"
        f.write_text(json.dumps({"entities": {}}))
        result = run_script(args=[str(f)], stdin_data="some/path\n")
        assert result.returncode == 0
        assert json.loads(result.stdout) == []

    def test_valid_input_returns_renames(self, tmp_path):
        data = {"entities": {"acme": {"replacement": "northwind", "type": "company"}}}
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = run_script(args=[str(f)], stdin_data="target/acme-guide.md\n")
        assert result.returncode == 0
        renames = json.loads(result.stdout)
        assert len(renames) == 1
        assert renames[0]["old"] == "target/acme-guide.md"
        assert renames[0]["new"] == "target/northwind-guide.md"

    def test_collision_exits_1(self, tmp_path):
        data = {"entities": {
            "foo": {"replacement": "bar", "type": "company"},
            "baz": {"replacement": "bar", "type": "company"},
        }}
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = run_script(args=[str(f)], stdin_data="foo.md\nbaz.md\n")
        assert result.returncode == 1
        assert "collision" in result.stderr.lower()
