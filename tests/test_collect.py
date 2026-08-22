from __future__ import annotations

import importlib.machinery
import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LOADER = importlib.machinery.SourceFileLoader("shortcut_sheet_collect", str(ROOT / "collect"))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
assert SPEC is not None
COLLECT = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(COLLECT)


class CollectBoundsTest(unittest.TestCase):
    def test_rejects_oversized_record_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings-test.records"
            with path.open("wb") as handle:
                handle.truncate(COLLECT.MAX_RECORD_BYTES + 1)
            self.assertEqual(COLLECT.parse_records(path), [])

    def test_keeps_valid_rows_and_drops_unsafe_fields(self) -> None:
        valid = "SUPER + K → Keybindings\texec\tomarchy-menu-keybindings"
        long_label = "SUPER + X → " + "x" * (COLLECT.MAX_LABEL_CHARS + 1) + "\texec\tcommand"
        invalid_dispatcher = "SUPER + Y → Invalid\tunknown\tcommand"

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings-test.records"
            path.write_text("\n".join([valid, long_label, invalid_dispatcher]), encoding="utf-8")
            rows = COLLECT.parse_records(path)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["keys"], "SUPER + K")
        self.assertEqual(rows[0]["label"], "Keybindings")

    def test_stops_at_the_configured_row_limit(self) -> None:
        original_limit = COLLECT.MAX_RECORD_ROWS
        COLLECT.MAX_RECORD_ROWS = 2
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "keybindings-test.records"
                path.write_text(
                    "\n".join(
                        f"SUPER + {index} → Row {index}\texec\tcommand"
                        for index in range(3)
                    ),
                    encoding="utf-8",
                )
                self.assertEqual(len(COLLECT.parse_records(path)), 2)
        finally:
            COLLECT.MAX_RECORD_ROWS = original_limit


if __name__ == "__main__":
    unittest.main()
