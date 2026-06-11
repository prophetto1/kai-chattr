"""oauth: provider_account_id on auth_credentials + auth_oauth_attempts.

Plan 1.5 T5 schema delta (declared): OAuth needs the provider's immutable
account id on credentials (S1 linking keys on it, never on mutable email) and
a server-side single-use hashed-state attempt table (shape borrowed lean from
writing-system's auth_oauth_attempts).

Revision ID: 20260611_0006
Revises: 20260611_0005
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260611_0006"
down_revision = "20260611_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "auth_credentials",
        sa.Column("provider_account_id", sa.String(length=200), nullable=True),
    )
    op.create_unique_constraint(
        "uq_auth_credentials_provider_account",
        "auth_credentials",
        ["provider", "provider_account_id"],
    )

    op.create_table(
        "auth_oauth_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("state_hash", sa.String(length=160), nullable=False),
        sa.Column("code_verifier", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="started"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_hash"),
    )


def downgrade() -> None:
    op.drop_table("auth_oauth_attempts")
    op.drop_constraint(
        "uq_auth_credentials_provider_account", "auth_credentials", type_="unique"
    )
    op.drop_column("auth_credentials", "provider_account_id")
