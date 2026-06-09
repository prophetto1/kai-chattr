from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_name: str = "kai-chattr-api"
    otel_exporter_otlp_endpoint: str = Field(default="", alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_jaeger_ui_url: str = Field(default="http://127.0.0.1:8886", alias="OTEL_JAEGER_UI_URL")
    otel_service_name: str = Field(default="kai-chattr-api", alias="OTEL_SERVICE_NAME")
    otel_traces_exporter: str = Field(default="jsonl", alias="OTEL_TRACES_EXPORTER")
    logfire_enabled: bool = Field(default=False, alias="LOGFIRE_ENABLED")
    logfire_token: str = Field(default="", alias="LOGFIRE_TOKEN")


def get_settings() -> Settings:
    return Settings()
