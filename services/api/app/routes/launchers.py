from __future__ import annotations

import logging
import platform
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.launch.chattr_launcher import (
    InvalidProfileIdError,
    LauncherError,
    UnsafeLaunchError,
    UnknownProfileError,
    build_command,
    dry_run,
    list_profiles,
    start,
)


log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/launchers", tags=["launchers"])


class LauncherProfileResponse(BaseModel):
    profile_id: str
    kind: str
    description: str
    visible_terminal: bool
    allow_browser_start: bool
    requires_explicit_confirmation: bool


class LauncherProfilesResponse(BaseModel):
    profiles: list[LauncherProfileResponse]


class LauncherStatusResponse(BaseModel):
    profile_id: str
    known: bool
    running: bool | None = None
    detail: str | None = None


class LauncherDryRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: str = Field(min_length=1)


class LauncherDryRunResponse(BaseModel):
    profile_id: str
    cwd: str
    argv: list[str]
    visible_terminal: bool
    allow_browser_start: bool
    requires_explicit_confirmation: bool


class LauncherStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_id: str = Field(min_length=1)
    confirm_risky: bool = False


class LauncherStartResponse(BaseModel):
    profile_id: str
    accepted: bool
    detail: str
    pid: int | None = None


def _client_host(request: Request) -> str:
    return request.client.host if request.client else ""


def _is_loopback(request: Request) -> bool:
    return _client_host(request) in ("127.0.0.1", "::1", "localhost", "testclient")


def _public_profile(profile: dict[str, Any]) -> LauncherProfileResponse:
    return LauncherProfileResponse(
        profile_id=profile["profile_id"],
        kind=profile["kind"],
        description=profile["description"],
        visible_terminal=profile["visible_terminal"],
        allow_browser_start=profile["allow_browser_start"],
        requires_explicit_confirmation=profile["requires_explicit_confirmation"],
    )


def _dry_run_response(profile_id: str) -> LauncherDryRunResponse:
    result = dry_run(profile_id)
    command = result.command
    return LauncherDryRunResponse(
        profile_id=command.profile_id,
        cwd=str(command.cwd),
        argv=list(command.argv),
        visible_terminal=command.visible_terminal,
        allow_browser_start=command.allow_browser_start,
        requires_explicit_confirmation=command.requires_explicit_confirmation,
    )


def _raise_profile_error(exc: Exception) -> None:
    if isinstance(exc, UnknownProfileError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, InvalidProfileIdError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


def _redacted_argv(argv: list[str]) -> list[str]:
    redacted = []
    for part in argv:
        upper = part.upper()
        if "TOKEN" in upper or "SECRET" in upper or "KEY" in upper:
            redacted.append("[redacted]")
        else:
            redacted.append(part)
    return redacted


def _log_launcher_event(
    event_name: str,
    *,
    request: Request,
    profile_id: str,
    action: str,
    cwd: str = "",
    argv: list[str] | None = None,
    accepted: bool,
    reason: str,
) -> None:
    log.info(
        event_name,
        extra={
            "chattr_launcher": {
                "profile_id": profile_id,
                "action": action,
                "platform": platform.system(),
                "cwd": cwd,
                "argv_redacted": _redacted_argv(argv or []),
                "request_client": _client_host(request),
                "accepted": accepted,
                "reason": reason,
            }
        },
    )


@router.get("/profiles", response_model=LauncherProfilesResponse)
def get_launcher_profiles(request: Request) -> LauncherProfilesResponse:
    profiles = [_public_profile(profile) for profile in list_profiles()]
    _log_launcher_event(
        "chattr.launcher.profiles_listed",
        request=request,
        profile_id="*",
        action="profiles",
        accepted=True,
        reason=f"{len(profiles)} profiles listed",
    )
    return LauncherProfilesResponse(profiles=profiles)


@router.get("/status", response_model=LauncherStatusResponse)
def get_launcher_status(profile_id: str, request: Request):
    try:
        command = build_command(profile_id)
    except (UnknownProfileError, InvalidProfileIdError) as exc:
        _raise_profile_error(exc)

    detail = "Launcher process ownership is not implemented yet."
    _log_launcher_event(
        "chattr.launcher.status_checked",
        request=request,
        profile_id=command.profile_id,
        action="status",
        cwd=str(command.cwd),
        argv=command.argv,
        accepted=False,
        reason=detail,
    )
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "profile_id": command.profile_id,
            "known": True,
            "running": None,
            "detail": detail,
        },
    )


@router.post("/dry-run", response_model=LauncherDryRunResponse)
def dry_run_launcher(req: LauncherDryRunRequest, request: Request) -> LauncherDryRunResponse:
    try:
        response = _dry_run_response(req.profile_id)
    except (UnknownProfileError, InvalidProfileIdError) as exc:
        _raise_profile_error(exc)

    _log_launcher_event(
        "chattr.launcher.dry_run_requested",
        request=request,
        profile_id=response.profile_id,
        action="dry-run",
        cwd=response.cwd,
        argv=response.argv,
        accepted=True,
        reason="dry-run returned server-built argv",
    )
    return response


@router.post("/start", response_model=LauncherStartResponse)
def start_launcher(req: LauncherStartRequest, request: Request) -> LauncherStartResponse:
    try:
        command = build_command(req.profile_id)
    except (UnknownProfileError, InvalidProfileIdError) as exc:
        _raise_profile_error(exc)

    _log_launcher_event(
        "chattr.launcher.start_requested",
        request=request,
        profile_id=command.profile_id,
        action="start",
        cwd=str(command.cwd),
        argv=command.argv,
        accepted=False,
        reason="start request received",
    )

    if not _is_loopback(request):
        reason = "Launcher start requires a loopback client."
        _log_launcher_event(
            "chattr.launcher.start_rejected",
            request=request,
            profile_id=command.profile_id,
            action="start",
            cwd=str(command.cwd),
            argv=command.argv,
            accepted=False,
            reason=reason,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    if command.requires_explicit_confirmation and not req.confirm_risky:
        reason = f"Profile {command.profile_id} requires explicit confirmation before start."
        _log_launcher_event(
            "chattr.launcher.start_rejected",
            request=request,
            profile_id=command.profile_id,
            action="start",
            cwd=str(command.cwd),
            argv=command.argv,
            accepted=False,
            reason=reason,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    if not command.allow_browser_start:
        reason = f"Profile {command.profile_id} is not browser-startable."
        _log_launcher_event(
            "chattr.launcher.start_rejected",
            request=request,
            profile_id=command.profile_id,
            action="start",
            cwd=str(command.cwd),
            argv=command.argv,
            accepted=False,
            reason=reason,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

    try:
        result = start(command.profile_id)
    except UnsafeLaunchError as exc:
        reason = str(exc)
        _log_launcher_event(
            "chattr.launcher.start_rejected",
            request=request,
            profile_id=command.profile_id,
            action="start",
            cwd=str(command.cwd),
            argv=command.argv,
            accepted=False,
            reason=reason,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason) from exc
    except LauncherError as exc:
        reason = str(exc)
        _log_launcher_event(
            "chattr.launcher.start_failed",
            request=request,
            profile_id=command.profile_id,
            action="start",
            cwd=str(command.cwd),
            argv=command.argv,
            accepted=False,
            reason=reason,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=reason) from exc

    _log_launcher_event(
        "chattr.launcher.start_succeeded",
        request=request,
        profile_id=result.command.profile_id,
        action="start",
        cwd=str(result.command.cwd),
        argv=result.command.argv,
        accepted=True,
        reason=result.detail,
    )
    return LauncherStartResponse(
        profile_id=result.command.profile_id,
        accepted=result.accepted,
        detail=result.detail,
        pid=result.pid,
    )


@router.post("/stop")
def stop_launcher(req: LauncherDryRunRequest, request: Request):
    try:
        command = build_command(req.profile_id)
    except (UnknownProfileError, InvalidProfileIdError) as exc:
        _raise_profile_error(exc)

    detail = "Launcher stop requires a process ownership model that is not implemented yet."
    _log_launcher_event(
        "chattr.launcher.stop_requested",
        request=request,
        profile_id=command.profile_id,
        action="stop",
        cwd=str(command.cwd),
        argv=command.argv,
        accepted=False,
        reason="stop request received",
    )
    _log_launcher_event(
        "chattr.launcher.stop_rejected",
        request=request,
        profile_id=command.profile_id,
        action="stop",
        cwd=str(command.cwd),
        argv=command.argv,
        accepted=False,
        reason=detail,
    )
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"profile_id": command.profile_id, "accepted": False, "detail": detail, "pid": None},
    )
