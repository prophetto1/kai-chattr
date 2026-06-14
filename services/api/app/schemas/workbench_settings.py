"""Contracts for workbench settings and theme configuration."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
import json
from typing import Any

ThemeOption = dict[str, Any]


_SCHEMA_PATH = Path(__file__).with_name("workbench_settings.schema.json")

_SCHEMA_FALLBACK: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://kai-chattr.local/schemas/workbench-settings.schema.json",
    "title": "Workbench Settings",
    "type": "object",
    "required": ["selected_theme"],
    "properties": {
        "selected_theme": {
            "title": "Theme",
            "description": "Theme token palette applied to the workbench surface.",
            "type": "string",
            "enum": ["day", "night", "catppuccin", "ember", "graphite"],
            "default": "night",
            "x-options": [
                {
                    "value": "day",
                    "label": "Day",
                    "description": "Light token palette",
                    "color_scheme": "light",
                    "html_classes": [],
                },
                {
                    "value": "night",
                    "label": "Night",
                    "description": "Default dark token palette",
                    "color_scheme": "dark",
                    "html_classes": ["dark"],
                },
                {
                    "value": "catppuccin",
                    "label": "Catppuccin",
                    "description": "Mocha token palette",
                    "color_scheme": "dark",
                    "html_classes": ["dark", "catppuccin"],
                },
                {
                    "value": "ember",
                    "label": "Ember",
                    "description": "Warm dark token palette",
                    "color_scheme": "dark",
                    "html_classes": ["dark", "ember"],
                },
                {
                    "value": "graphite",
                    "label": "Graphite",
                    "description": "Achromatic gray dark palette",
                    "color_scheme": "dark",
                    "html_classes": ["dark", "graphite"],
                },
            ],
        },
        "fonts": {
            "title": "Fonts",
            "description": "Per-role typeface selection. Keys are font-family slots; values are face ids from the design-system catalog.",
            "type": "object",
            "properties": {
                "ui": {"type": "string"},
                "display": {"type": "string"},
                "prose": {"type": "string"},
                "mono": {"type": "string"},
            },
            "additionalProperties": False,
            "default": {},
        },
    },
    "additionalProperties": True,
}


def _load_schema() -> dict[str, Any]:
    try:
        return json.loads(_SCHEMA_PATH.read_text("utf-8"))
    except Exception:
        return _SCHEMA_FALLBACK


WORKBENCH_SETTINGS_SCHEMA: dict[str, Any] = _load_schema()
_WORKBENCH_PROPERTIES = WORKBENCH_SETTINGS_SCHEMA.get("properties", {})


def _options_for(property_name: str) -> tuple[ThemeOption, ...]:
    raw_options = _WORKBENCH_PROPERTIES.get(property_name, {}).get("x-options", [])
    normalized: list[ThemeOption] = []
    for option in raw_options:
        if not isinstance(option, dict):
            continue
        option_id = option.get("value")
        if option_id is None:
            continue
        normalized.append({
            "id": str(option_id),
            "label": str(option.get("label", option_id)),
            "description": str(option.get("description", option.get("label", option_id))),
            "color_scheme": option.get("color_scheme"),
            "html_classes": list(option.get("html_classes", [])),
        })
    return tuple(normalized)


WORKBENCH_THEME_OPTIONS: tuple[ThemeOption, ...] = _options_for("selected_theme")
WORKBENCH_THEME_IDS: tuple[str, ...] = tuple(
    option["id"] for option in WORKBENCH_THEME_OPTIONS
)
WORKBENCH_FONT_SLOTS: tuple[str, ...] = ("ui", "display", "prose", "mono")


def _default_for(property_name: str, fallback: str) -> str:
    value = WORKBENCH_SETTINGS_SCHEMA.get("properties", {}).get(property_name, {}).get("default")
    return str(value) if isinstance(value, str) and value else fallback


DEFAULT_THEME_ID = _default_for("selected_theme", "night")


DEFAULT_ROOM_SETTINGS = {
    "title": "noname",
    "username": "user",
    "fonts": {},
    "channels": ["general"],
    "history_limit": "all",
    "custom_roles": [],
    "default_mention": "none",
    "selected_theme": DEFAULT_THEME_ID,
}
