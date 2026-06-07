"""create Board rules tables

Revision ID: 20260607_0001
Revises:
Create Date: 2026-06-07
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260607_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "board_rule_state",
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("agent_sync", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "board_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("uid", sa.String(length=36), nullable=False),
        sa.Column("text", sa.String(length=160), nullable=False),
        sa.Column("author", sa.String(length=120), nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("archived_at", sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
    )
    op.create_index("ix_board_rules_status", "board_rules", ["status"])


def downgrade() -> None:
    op.drop_index("ix_board_rules_status", table_name="board_rules")
    op.drop_table("board_rules")
    op.drop_table("board_rule_state")
