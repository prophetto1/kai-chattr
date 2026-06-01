# kai-chattr-api — relocatable FastAPI runtime. In a container, the container IS the env
# (the no-repo-local-.venv rule applies to the dev checkout, not the image).
FROM python:3.12-slim

# Pinned uv (matches local toolchain) for reproducible, lockfile-frozen installs.
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /uvx /bin/

WORKDIR /app

# Deps first (cached layer): sync runtime deps from the frozen lock, no dev group.
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

# App source.
COPY app ./app

# Runtime owns its SQLite under a mountable volume path (Fly mounts /data).
ENV KAI_CHATTR_API_DB_PATH=/data/kai_chattr_api.sqlite3
EXPOSE 8880

CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8880"]
