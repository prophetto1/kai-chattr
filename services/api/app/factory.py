"""FastAPI app factory and route inclusion helpers."""

from __future__ import annotations

from collections.abc import Iterable
from types import ModuleType

from fastapi import FastAPI


def create_app(title: str = "noname") -> FastAPI:
    return FastAPI(title=title)


def include_route_modules(app: FastAPI, main_module: ModuleType, route_modules: Iterable[ModuleType]) -> None:
    for route_module in route_modules:
        route_module.register_routes(main_module)
        app.include_router(route_module.router)
