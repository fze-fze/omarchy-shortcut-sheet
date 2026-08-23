from __future__ import annotations

import importlib.machinery
import importlib.util
import json
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


class TuiDetectionTest(unittest.TestCase):
    @staticmethod
    def write_process(
        root: Path,
        pid: int,
        comm: str,
        *,
        ppid: int,
        pgrp: int,
        tty: int,
        tpgid: int,
        children: tuple[int, ...] = (),
        command: tuple[str, ...] = (),
    ) -> None:
        process = root / str(pid)
        task = process / "task" / str(pid)
        task.mkdir(parents=True)
        (process / "comm").write_text(comm + "\n", encoding="utf-8")
        (process / "stat").write_text(
            f"{pid} ({comm}) S {ppid} {pgrp} 1 {tty} {tpgid}\n",
            encoding="utf-8",
        )
        (task / "children").write_text(
            " ".join(str(child) for child in children), encoding="utf-8"
        )
        if command:
            (process / "cmdline").write_bytes(
                b"\0".join(part.encode() for part in command) + b"\0"
            )

    def test_detects_only_the_foreground_tui_process(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            proc_root = Path(directory)
            self.write_process(
                proc_root, 100, "ghostty", ppid=1, pgrp=100, tty=0, tpgid=-1, children=(101, 102)
            )
            self.write_process(
                proc_root, 101, "lazygit", ppid=100, pgrp=101, tty=4, tpgid=102
            )
            self.write_process(
                proc_root, 102, "claude", ppid=100, pgrp=102, tty=4, tpgid=102
            )

            detected = COLLECT.foreground_tui(100, proc_root)

        self.assertEqual(detected["id"], "claude")
        self.assertEqual(detected["name"], "Claude Code")

    def test_ignores_process_scanning_for_non_terminal_windows(self) -> None:
        window = {"class": "firefox", "pid": 100, "tags": []}
        self.assertEqual(COLLECT.tui_context(window), {})

    def test_detects_npm_claude_from_a_bounded_node_command(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            proc_root = Path(directory)
            self.write_process(
                proc_root, 100, "ghostty", ppid=1, pgrp=100, tty=0, tpgid=-1, children=(101,)
            )
            script = "/opt/node_modules/@anthropic-ai/claude-code/cli.js"
            self.write_process(
                proc_root,
                101,
                "node",
                ppid=100,
                pgrp=101,
                tty=4,
                tpgid=101,
                command=("/usr/bin/node", script),
            )

            detected = COLLECT.foreground_tui(100, proc_root)

        self.assertEqual(detected["id"], "claude")
        self.assertEqual(detected["executable"], script)

    def test_reads_bounded_claude_overrides_and_unbinds(self) -> None:
        config = {
            "bindings": [
                {
                    "context": "Chat",
                    "bindings": {
                        "ctrl+e": "chat:externalEditor",
                        "ctrl+u": None,
                    },
                },
                {"context": "", "bindings": {"x": "chat:submit"}},
                {"context": "Chat", "bindings": {"bad\nkey": "chat:submit"}},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings.json"
            path.write_text(json.dumps(config), encoding="utf-8")
            rows = COLLECT.claude_keybindings(path)

        self.assertEqual(
            rows,
            [
                {"context": "Chat", "keys": "ctrl+e", "action": "chat:externalEditor"},
                {"context": "Chat", "keys": "ctrl+u", "action": None},
            ],
        )

    def test_rejects_oversized_claude_keybinding_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "keybindings.json"
            with path.open("wb") as handle:
                handle.truncate(COLLECT.MAX_TUI_CONFIG_BYTES + 1)
            self.assertEqual(COLLECT.claude_keybindings(path), [])

    def test_reads_only_a_bounded_local_claude_version(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "claude" / "2.1.238" / "claude"
            executable.parent.mkdir(parents=True)
            executable.touch()
            self.assertEqual(COLLECT.claude_version(str(executable)), "2.1.238")

            package_root = Path(directory) / "node_modules" / "@anthropic-ai" / "claude-code"
            package_root.mkdir(parents=True)
            npm_executable = package_root / "cli.js"
            npm_executable.touch()
            (package_root / "package.json").write_text(
                json.dumps({"name": "@anthropic-ai/claude-code", "version": "2.1.237"}),
                encoding="utf-8",
            )
            self.assertEqual(COLLECT.claude_version(str(npm_executable)), "2.1.237")
            self.assertEqual(COLLECT.claude_version("/tmp/2.1.238/tool"), "")

    def test_includes_detected_claude_version_without_static_tui_guesses(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            proc_root = Path(directory)
            self.write_process(
                proc_root, 100, "ghostty", ppid=1, pgrp=100, tty=0, tpgid=-1, children=(101,)
            )
            self.write_process(
                proc_root, 101, "claude", ppid=100, pgrp=101, tty=4, tpgid=101
            )
            window = {"class": "com.mitchellh.ghostty", "pid": 100, "tags": ["terminal"]}
            payload = COLLECT.tui_context(window, proc_root, lambda _path: "2.1.238")

        self.assertEqual(payload["id"], "claude")
        self.assertEqual(payload["version"], "2.1.238")
        self.assertNotIn("yazi", COLLECT.TUI_PROCESS_IDS)


if __name__ == "__main__":
    unittest.main()
