"""ANSI color helpers + concise logging for the app factory.

`log()` is the single console-print helper used by builder.py, hooks.py, and
the prompt modules. `log_tool_use()` renders a one-line summary of a tool
call for the live build output.
"""
from pathlib import Path

from .paths import REPO_ROOT

BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log(icon: str, msg: str):
    """Print a single line prefixed with a colored icon. Flushed every call
    so CodeBuild streams see each event in real time, not buffered."""
    print(f"{icon} {msg}", flush=True)


def log_tool_use(name: str, input_data: dict, parent_id: str = None):
    """Print a concise summary of a tool call."""
    prefix = f"  {MAGENTA}[SUB]{RESET} " if parent_id else ""

    if name == "Write":
        path = input_data.get("file_path", "")
        try:
            rel = Path(path).relative_to(REPO_ROOT)
        except ValueError:
            rel = path
        log(f"{prefix}{GREEN}[WRITE]{RESET}", f"{rel}")
    elif name == "Edit":
        path = input_data.get("file_path", "")
        try:
            rel = Path(path).relative_to(REPO_ROOT)
        except ValueError:
            rel = path
        log(f"{prefix}{YELLOW}[EDIT]{RESET}", f"{rel}")
    elif name == "Read":
        path = input_data.get("file_path", "")
        try:
            rel = Path(path).relative_to(REPO_ROOT)
        except ValueError:
            rel = path
        log(f"{prefix}{CYAN}[READ]{RESET}", f"{rel}")
    elif name in ("Agent", "Task"):
        subagent = input_data.get("description", input_data.get("prompt", "")[:60])
        log(f"{MAGENTA}[AGENT]{RESET}", f"{BOLD}{subagent}{RESET}")
    elif name == "Bash":
        cmd = input_data.get("command", "")
        if len(cmd) > 120:
            cmd = cmd[:117] + "..."
        log(f"{prefix}{BLUE}[BASH]{RESET}", f"{DIM}{cmd}{RESET}")
    elif name in ("Glob", "Grep"):
        pattern = input_data.get("pattern", input_data.get("query", ""))
        log(f"{prefix}{DIM}[{name.upper()}]{RESET}", f"{DIM}{pattern}{RESET}")
