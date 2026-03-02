"""Unit tests for escape_sed_pattern() and escape_sed_replacement()."""

from generate_sed import escape_sed_pattern, escape_sed_replacement


class TestEscapeSedPattern:
    def test_escapes_backslash(self):
        assert escape_sed_pattern("a\\b") == "a\\\\b"

    def test_escapes_forward_slash(self):
        assert escape_sed_pattern("a/b") == "a\\/b"

    def test_escapes_ampersand(self):
        assert escape_sed_pattern("a&b") == "a\\&b"

    def test_escapes_dot(self):
        assert escape_sed_pattern("a.b") == "a\\.b"

    def test_escapes_asterisk(self):
        assert escape_sed_pattern("a*b") == "a\\*b"

    def test_escapes_open_bracket(self):
        assert escape_sed_pattern("a[b") == "a\\[b"

    def test_escapes_close_bracket(self):
        assert escape_sed_pattern("a]b") == "a\\]b"

    def test_escapes_caret(self):
        assert escape_sed_pattern("a^b") == "a\\^b"

    def test_escapes_dollar(self):
        assert escape_sed_pattern("a$b") == "a\\$b"

    def test_compound_string_with_multiple_special_chars(self):
        # acme.corp/api has both . and /
        assert escape_sed_pattern("acme.corp/api") == "acme\\.corp\\/api"

    def test_passes_through_clean_string(self):
        assert escape_sed_pattern("hello world") == "hello world"

    def test_empty_string(self):
        assert escape_sed_pattern("") == ""

    def test_all_special_chars_together(self):
        result = escape_sed_pattern("\\.&*[]^$/")
        assert result == "\\\\\\.\\&\\*\\[\\]\\^\\$\\/"


class TestEscapeSedReplacement:
    def test_escapes_backslash(self):
        assert escape_sed_replacement("a\\b") == "a\\\\b"

    def test_escapes_forward_slash(self):
        assert escape_sed_replacement("a/b") == "a\\/b"

    def test_escapes_ampersand(self):
        assert escape_sed_replacement("a&b") == "a\\&b"

    def test_passes_through_clean_string(self):
        assert escape_sed_replacement("hello world") == "hello world"

    def test_does_not_escape_dot(self):
        # Dot is NOT special in replacement strings
        assert escape_sed_replacement("a.b") == "a.b"

    def test_does_not_escape_asterisk(self):
        assert escape_sed_replacement("a*b") == "a*b"

    def test_compound_replacement(self):
        assert escape_sed_replacement("https://api.northwind.com/v2") == "https:\\/\\/api.northwind.com\\/v2"
