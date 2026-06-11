"""OAuth provider adapters (Plan 1.5 T5): Google + GitHub.

Each provider implements the same two-call surface; the callback route only
ever sees an ``OAuthIdentity``. Configuration comes from the environment
(SOPS-decrypted) — an unconfigured provider simply isn't offered (503), there
is no stub fallback. Tests substitute this external boundary by placing fake
providers on ``app.state.oauth_providers``.

Env vars: KAI_CHATTR_OAUTH_GOOGLE_CLIENT_ID / _SECRET,
          KAI_CHATTR_OAUTH_GITHUB_CLIENT_ID / _SECRET.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx


@dataclass(frozen=True)
class OAuthIdentity:
    provider_account_id: str
    email: str
    email_verified: bool


def new_code_verifier() -> str:
    return secrets.token_urlsafe(48)


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class GoogleOAuthProvider:
    name = "google"
    uses_pkce = True

    def __init__(self, client_id: str, client_secret: str):
        self._client_id = client_id
        self._client_secret = client_secret

    def authorize_url(self, *, state: str, redirect_uri: str, code_verifier: str) -> str:
        query = urlencode(
            {
                "client_id": self._client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": _code_challenge(code_verifier),
                "code_challenge_method": "S256",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    def exchange(
        self, *, code: str, redirect_uri: str, code_verifier: str | None
    ) -> OAuthIdentity:
        with httpx.Client(timeout=15) as client:
            token = client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "code": code,
                    "code_verifier": code_verifier or "",
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
            token.raise_for_status()
            access_token = token.json()["access_token"]
            userinfo = client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo.raise_for_status()
            info = userinfo.json()
        return OAuthIdentity(
            provider_account_id=str(info["sub"]),
            email=str(info.get("email", "")),
            email_verified=bool(info.get("email_verified", False)),
        )


class GitHubOAuthProvider:
    name = "github"
    uses_pkce = False

    def __init__(self, client_id: str, client_secret: str):
        self._client_id = client_id
        self._client_secret = client_secret

    def authorize_url(self, *, state: str, redirect_uri: str, code_verifier: str) -> str:
        query = urlencode(
            {
                "client_id": self._client_id,
                "redirect_uri": redirect_uri,
                "scope": "read:user user:email",
                "state": state,
            }
        )
        return f"https://github.com/login/oauth/authorize?{query}"

    def exchange(
        self, *, code: str, redirect_uri: str, code_verifier: str | None
    ) -> OAuthIdentity:
        with httpx.Client(timeout=15) as client:
            token = client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
            token.raise_for_status()
            access_token = token.json()["access_token"]
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            }
            user = client.get("https://api.github.com/user", headers=headers)
            user.raise_for_status()
            emails = client.get("https://api.github.com/user/emails", headers=headers)
            emails.raise_for_status()
        primary = next(
            (entry for entry in emails.json() if entry.get("primary")),
            None,
        )
        return OAuthIdentity(
            provider_account_id=str(user.json()["id"]),
            email=str(primary["email"]) if primary else "",
            email_verified=bool(primary and primary.get("verified", False)),
        )


def load_oauth_providers(environ=os.environ) -> dict[str, object]:
    providers: dict[str, object] = {}
    google_id = environ.get("KAI_CHATTR_OAUTH_GOOGLE_CLIENT_ID", "").strip()
    google_secret = environ.get("KAI_CHATTR_OAUTH_GOOGLE_CLIENT_SECRET", "").strip()
    if google_id and google_secret:
        providers["google"] = GoogleOAuthProvider(google_id, google_secret)
    github_id = environ.get("KAI_CHATTR_OAUTH_GITHUB_CLIENT_ID", "").strip()
    github_secret = environ.get("KAI_CHATTR_OAUTH_GITHUB_CLIENT_SECRET", "").strip()
    if github_id and github_secret:
        providers["github"] = GitHubOAuthProvider(github_id, github_secret)
    return providers
