# kai-chattr-api (`services/api`)

The relocatable agent runtime for kai-chattr — its **only** interface is a typed-HTTP +
WebSocket surface, and it **owns its own SQLite** (path from `KAI_CHATTR_API_DB_PATH`).
The same image runs local, cloud-UI→local, or in a full-cloud namespace.

## Local dev — run **from this directory**

`app` is the package. Run from `services/api/` so it doesn't collide with the legacy
`E:\chattr\app.py`. Per the repo-process contract, use an **external** uv env (no
repo-local `.venv`):

```sh
export UV_PROJECT_ENVIRONMENT="$LOCALAPPDATA/kai-chattr-api/uv-env"   # outside the checkout
uv sync
uv run uvicorn app.main:app --port 8880     # http://localhost:8880/health · ws://localhost:8880/ws
uv run pytest
```

## Container / Fly

In a container the **container is the env**:

```sh
docker build -t kai-chattr-api .
docker run --rm -p 8880:8880 kai-chattr-api   # GET /health -> 200
```

`fly.toml` is **reserved** (commented) — it is populated in the kai-chattr deploy slice
(Fly org `personal`; a volume mounts at `/data` for the SQLite file).

## Surface

| Verb | Path | Behaviour |
|---|---|---|
| `GET` | `/health` | `{status, service, version, db}` (200); `503` + `{"error":{code,message}}` if SQLite is unreachable |
| `WS` | `/ws` | sends `{"type":"hello"}` on connect, then `{"echo":"<text>"}` per message |

Routes live in `app/api/`; system routes are unprefixed, product routes (later) mount under `/v1`.
