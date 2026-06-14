"""Pydantic contracts for Board workflow routes."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


def _strip(value):
    return value.strip() if isinstance(value, str) else value


class BoardWorkflowCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: str = Field(default="job", max_length=40)
    channel: str = Field(default="general", max_length=80)
    created_by: str = Field(default="user", max_length=120)
    anchor_msg_id: int | None = None
    assignee: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=1000)
    status: str | None = Field(default=None, max_length=32)
    archived: bool = False

    _strip_title = field_validator("title", mode="before")(_strip)
    _strip_type = field_validator("type", mode="before")(_strip)
    _strip_channel = field_validator("channel", mode="before")(_strip)
    _strip_created_by = field_validator("created_by", mode="before")(_strip)
    _strip_assignee = field_validator("assignee", mode="before")(_strip)
    _strip_body = field_validator("body", mode="before")(_strip)
    _strip_status = field_validator("status", mode="before")(_strip)


class BoardWorkflowUpdateRequest(BaseModel):
    status: str | None = Field(default=None, max_length=32)
    archived: bool | None = None
    title: str | None = Field(default=None, max_length=120)
    assignee: str | None = Field(default=None, max_length=120)

    _strip_status = field_validator("status", mode="before")(_strip)
    _strip_title = field_validator("title", mode="before")(_strip)
    _strip_assignee = field_validator("assignee", mode="before")(_strip)


class BoardWorkflowReorderRequest(BaseModel):
    status: str = Field(default="todo", max_length=32)
    ordered_ids: list[int] = Field(min_length=1)

    _strip_status = field_validator("status", mode="before")(_strip)


class BoardWorkflowMessageCreateRequest(BaseModel):
    text: str = Field(default="")
    sender: str = Field(default="user", max_length=120)
    attachments: list = Field(default_factory=list)
    type: str = Field(default="chat", max_length=40)

    _strip_text = field_validator("text", mode="before")(_strip)
    _strip_sender = field_validator("sender", mode="before")(_strip)
    _strip_type = field_validator("type", mode="before")(_strip)


class BoardWorkflowMessageResolveRequest(BaseModel):
    resolution: str = Field(default="dismissed", max_length=32)

    _strip_resolution = field_validator("resolution", mode="before")(_strip)
