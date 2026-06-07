FROM python:3.11-slim

WORKDIR /app/services/api

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8840 \
    CHATTR_HOST=0.0.0.0 \
    KAI_CHATTR_REQUIRE_SESSION_TOKEN=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir -U pip && \
    pip install --no-cache-dir -r /app/services/api/requirements.txt

COPY services/api/alembic.ini /app/services/api/alembic.ini
COPY services/api/app /app/services/api/app
COPY services/api/config.toml /app/services/api/config.toml
COPY services/api/migrations /app/services/api/migrations
COPY services/api/session_templates /app/services/api/session_templates

EXPOSE 8840

CMD ["sh", "-c", "uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-8840}"]
