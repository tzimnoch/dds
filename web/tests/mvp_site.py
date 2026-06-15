"""Stage a self-contained DDS MVP site directory for tests."""
from __future__ import annotations

import shutil
from pathlib import Path

STATIC_FILES = ("dds_mvp.html", "dds_mvp.css", "dds_mvp.js")


def runfiles_root() -> Path:
    import os
    for key in ("RUNFILES_DIR", "TEST_SRCDIR"):
        if key in os.environ:
            return Path(os.environ[key])
    raise RuntimeError("not running under Bazel test")


def rlocation(relpath: str) -> Path:
    root = runfiles_root()
    for candidate in (root / relpath, root / "_main" / relpath):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(relpath)


def stage_mvp_site(dest: Path) -> Path:
    """Copy HTML/JS/CSS and wasm artifacts into dest. Returns dest."""
    dest.mkdir(parents=True, exist_ok=True)
    web_root = rlocation("web")

    for name in STATIC_FILES:
        shutil.copyfile(web_root / name, dest / name)

    js_src = rlocation("web/dds_wasm.js")
    wasm_src = rlocation("web/dds_mvp_wasm_cc.wasm")
    js_path = dest / "dds_wasm.js"
    wasm_path = dest / "dds_mvp_wasm_cc.wasm"
    shutil.copyfile(js_src, js_path)
    shutil.copyfile(wasm_src, wasm_path)
    js_path.chmod(0o644)
    wasm_path.chmod(0o644)

    return dest
