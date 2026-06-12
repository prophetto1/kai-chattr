"""model providers table and configuration shape for model backends."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260612_0007"
down_revision = "20260611_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_providers",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("uid", sa.String(length=36), nullable=False, unique=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("base_url", sa.String(length=1024), nullable=False, server_default=""),
        sa.Column("api_key_env", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("updated_by", sa.String(length=120), nullable=False),
        sa.UniqueConstraint("name", name="uq_model_providers_name"),
    )


def downgrade() -> None:
    op.drop_table("model_providers")
