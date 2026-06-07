from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse


router = APIRouter(tags=["platform"])


@router.get("/api/platform")
async def get_platform():
    """Return the server's platform so the web UI can match path formats."""
    return JSONResponse({"platform": sys.platform})


@router.post("/api/open-path")
async def open_path(body: dict):
    """Open a file or directory in the native file manager."""
    path = body.get("path", "")
    if not path:
        return JSONResponse({"error": "no path"}, status_code=400)

    p = Path(path)
    try:
        if sys.platform == "win32":
            if p.is_file():
                subprocess.Popen(["explorer", "/select,", str(p)])
            elif p.is_dir():
                subprocess.Popen(["explorer", str(p)])
            else:
                return JSONResponse({"error": "path not found"}, status_code=404)
        elif sys.platform == "darwin":
            if p.is_file():
                subprocess.Popen(["open", "-R", str(p)])
            elif p.is_dir():
                subprocess.Popen(["open", str(p)])
            else:
                return JSONResponse({"error": "path not found"}, status_code=404)
        else:
            if p.is_file():
                subprocess.Popen(["xdg-open", str(p.parent)])
            elif p.is_dir():
                subprocess.Popen(["xdg-open", str(p)])
            else:
                return JSONResponse({"error": "path not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    return JSONResponse({"ok": True})
