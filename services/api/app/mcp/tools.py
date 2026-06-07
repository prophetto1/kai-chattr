"""Registry metadata for Chattr tools.

The registry keeps MCP registration, agent-facing manifests, and future
policy/event hooks attached to the same ordered source of truth.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
import inspect
import time
from typing import Any


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    handler: Callable[..., Any]
    category: str
    side_effect: str
    identity_required: bool
    summary: str
    actor_fields: tuple[str, ...] = ("sender", "name")

    def manifest_entry(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "side_effect": self.side_effect,
            "identity_required": self.identity_required,
            "summary": self.summary,
        }


class ToolRegistry:
    def __init__(self) -> None:
        self._definitions: list[ToolDefinition] = []
        self._names: set[str] = set()
        self._event_stream: Any = None

    def register(self, definition: ToolDefinition) -> None:
        if definition.name in self._names:
            raise ValueError(f"Duplicate tool registered: {definition.name}")
        self._definitions.append(definition)
        self._names.add(definition.name)

    def set_event_stream(self, event_stream: Any | None) -> None:
        self._event_stream = event_stream

    def definitions(self) -> list[ToolDefinition]:
        return list(self._definitions)

    def functions(self) -> list[Callable[..., Any]]:
        return [definition.handler for definition in self._definitions]

    def instrumented_functions(self) -> list[Callable[..., Any]]:
        return [self._instrument(definition) for definition in self._definitions]

    def manifest(self) -> list[dict[str, Any]]:
        return [definition.manifest_entry() for definition in self._definitions]

    def _instrument(self, definition: ToolDefinition) -> Callable[..., Any]:
        @wraps(definition.handler)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            started = time.perf_counter()
            try:
                result = definition.handler(*args, **kwargs)
            except Exception as exc:
                self._emit_tool_event(
                    definition,
                    args,
                    kwargs,
                    result="error",
                    started=started,
                    error_type=type(exc).__name__,
                )
                raise
            self._emit_tool_event(
                definition,
                args,
                kwargs,
                result=_classify_result(result),
                started=started,
            )
            return result

        return wrapper

    def _emit_tool_event(
        self,
        definition: ToolDefinition,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        *,
        result: str,
        started: float,
        error_type: str = "",
    ) -> None:
        if self._event_stream is None:
            return

        details: dict[str, Any] = {
            "tool_name": definition.name,
            "category": definition.category,
            "side_effect": definition.side_effect,
            "identity_required": definition.identity_required,
            "duration_ms": round((time.perf_counter() - started) * 1000, 3),
        }
        if error_type:
            details["error_type"] = error_type

        self._event_stream.append(
            {
                "event_type": "mcp.tool_call",
                "source": "mcp",
                "actor": _extract_actor(definition, args, kwargs),
                "result": result,
                "details": details,
            }
        )


def _extract_actor(definition: ToolDefinition, args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    try:
        bound = inspect.signature(definition.handler).bind_partial(*args, **kwargs)
    except TypeError:
        bound = None

    values = bound.arguments if bound else kwargs
    for field in definition.actor_fields:
        value = values.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _classify_result(result: Any) -> str:
    if isinstance(result, str) and result.startswith("Error:"):
        return "error"
    return "ok"
