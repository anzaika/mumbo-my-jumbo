"""Unit tests for main() exit codes and stderr."""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT = str(Path(__file__).parent.parent / "scripts" / "generate_sed.py")


def run_script(stdin_data=None, args=None):
    """Run generate_sed.py as a subprocess and return the result."""
    cmd = [sys.executable, SCRIPT]
    if args:
        cmd.extend(args)
    return subprocess.run(
        cmd,
        input=stdin_data,
        capture_output=True,
        text=True,
    )


class TestMainExitCodes:
    def test_malformed_json_exits_1(self):
        result = run_script(stdin_data="not json at all{{{")
        assert result.returncode == 1
        assert "invalid JSON" in result.stderr

    def test_nonexistent_file_exits_1(self):
        result = run_script(args=["/tmp/does-not-exist-12345.json"])
        assert result.returncode == 1
        assert "file not found" in result.stderr

    def test_empty_entities_exits_0_with_warning(self):
        data = json.dumps({"entities": {}})
        result = run_script(stdin_data=data)
        assert result.returncode == 0
        assert "no entities" in result.stderr
        assert result.stdout == ""

    def test_valid_input_prints_commands(self):
        data = json.dumps({
            "entities": {
                "Acme": {"replacement": "Northwind", "type": "company"},
            }
        })
        result = run_script(stdin_data=data)
        assert result.returncode == 0
        assert "s/Acme/Northwind/g" in result.stdout

    def test_valid_file_input(self, tmp_path):
        data = {
            "entities": {
                "Foo": {"replacement": "Bar", "type": "company"},
            }
        }
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = run_script(args=[str(f)])
        assert result.returncode == 0
        assert "s/Foo/Bar/g" in result.stdout
