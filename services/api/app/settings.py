"""Env-based settings (pydantic-settings). Container-clean: no hardcoded hosts/paths."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KAI_CHATTR_API_", env_file=None)

    service_name: str = "kai-chattr-api"
    version: str = "0.0.0"
    port: int = 8880
    db_path: str = "data/kai_chattr_api.sqlite3"
    log_level: str = "INFO"


settings = Settings()
