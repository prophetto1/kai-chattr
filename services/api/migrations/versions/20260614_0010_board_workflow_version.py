"""board_workflow_version

Revision ID: 20260614_0010
Revises: 20260613_0009
Create Date: 2026-06-14 03:24:30.647206+00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '20260614_0010'
down_revision = '20260613_0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_workflows",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("board_workflows", "version")
