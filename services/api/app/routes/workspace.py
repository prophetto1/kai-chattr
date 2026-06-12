"""Workspace file route registration (Changes/Code/Files docks)."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/workspace/tree", main_module.get_workspace_tree, methods=["GET"])
    router.add_api_route(
        "/api/workspace/changes", main_module.get_workspace_changes, methods=["GET"]
    )
    router.add_api_route("/api/workspace/file", main_module.get_workspace_file, methods=["GET"])
    router.add_api_route("/api/workspace/file", main_module.save_workspace_file, methods=["PUT"])
    router.add_api_route("/api/workspace/diff", main_module.get_workspace_diff, methods=["GET"])
    router.add_api_route(
        "/api/workspace/diff-document", main_module.get_workspace_diff_document, methods=["GET"]
    )
    _registered = True
