"""Unit tests for generate_commands() and load_replacement_map()."""

import json

from generate_sed import generate_commands, load_replacement_map


class TestGenerateCommands:
    def test_sorted_longest_first(self):
        entities = {
            "Acme": {"replacement": "Northwind", "type": "company"},
            "Acme Corporation": {"replacement": "Northwind Industries", "type": "company"},
            "Acme Corp": {"replacement": "Northwind Inc", "type": "company"},
        }
        commands = generate_commands(entities)
        # "Acme Corporation" (16) > "Acme Corp" (9) > "Acme" (4)
        assert "Acme Corporation" in commands[0] or "Northwind Industries" in commands[0]
        assert "Acme Corp" in commands[1] or "Northwind Inc" in commands[1]
        assert len(commands) == 3

    def test_dict_style_values(self):
        entities = {
            "Jane Doe": {"replacement": "Alex Chen", "type": "person"},
        }
        commands = generate_commands(entities)
        assert commands == ["s/Jane Doe/Alex Chen/g"]

    def test_plain_string_values(self):
        entities = {
            "Jane Doe": "Alex Chen",
        }
        commands = generate_commands(entities)
        assert commands == ["s/Jane Doe/Alex Chen/g"]

    def test_valid_sed_format(self):
        entities = {
            "Foo": {"replacement": "Bar", "type": "company"},
        }
        commands = generate_commands(entities)
        assert len(commands) == 1
        assert commands[0].startswith("s/")
        assert commands[0].endswith("/g")

    def test_special_chars_in_key_and_value(self):
        entities = {
            "acme.corp/api": {"replacement": "northwind.co/api", "type": "domain"},
        }
        commands = generate_commands(entities)
        assert len(commands) == 1
        cmd = commands[0]
        # Key should have . and / escaped for pattern
        assert "acme\\.corp\\/api" in cmd
        # Value should have / escaped for replacement (. is fine)
        assert "northwind.co\\/api" in cmd

    def test_empty_entities(self):
        assert generate_commands({}) == []


class TestLoadReplacementMap:
    def test_loads_valid_json(self, tmp_path):
        data = {
            "entities": {
                "Acme": {"replacement": "Northwind", "type": "company"},
            }
        }
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = load_replacement_map(str(f))
        assert result == data["entities"]

    def test_extracts_entities_key(self, tmp_path):
        data = {
            "entities": {"A": "B"},
            "other_key": "ignored",
        }
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = load_replacement_map(str(f))
        assert result == {"A": "B"}

    def test_returns_empty_dict_when_entities_missing(self, tmp_path):
        data = {"something_else": "value"}
        f = tmp_path / "map.json"
        f.write_text(json.dumps(data))
        result = load_replacement_map(str(f))
        assert result == {}
