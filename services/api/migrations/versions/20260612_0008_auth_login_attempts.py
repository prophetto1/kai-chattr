"""auth_login_attempts: password-login throttle state (Phase 0 auth, Task 4)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260612_0008"
down_revision = "20260612_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_login_attempts",
        sa.Column("id", sa.Uuid(), nullable=False, primary_key=True),
        sa.Column("identifier_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_auth_login_attempts_identifier_hash",
        "auth_login_attempts",
        ["identifier_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_login_attempts_identifier_hash", table_name="auth_login_attempts")
    op.drop_table("auth_login_attempts")
