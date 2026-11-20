"""Check source files that Git tracks or would offer to add."""
import os
from pathlib import Path
import subprocess
import sys

paths = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"])
invalid = []
for name in filter(None, paths.split(b"\0")):
    path = Path(os.fsdecode(name))
    if path.is_symlink() or not path.is_file():
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        invalid.append(path)
    else:
        if "\0" in text:
            invalid.append(path)
for path in invalid:
    print(f"Binary or non-UTF-8 source file: {path}", file=sys.stderr)
sys.exit(bool(invalid))
