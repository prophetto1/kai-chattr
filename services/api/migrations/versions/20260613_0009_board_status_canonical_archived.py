"""canonical Board workflow statuses with archived flag

Revision ID: 20260613_0009
Revises: 20260612_0008
Create Date: 2026-06-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260613_0009"
down_revision = "20260612_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_workflows",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("UPDATE board_workflows SET archived = TRUE WHERE status = 'archived'")
    op.execute("UPDATE board_workflows SET status = 'todo' WHERE status = 'open'")
    op.execute("UPDATE board_workflows SET status = 'active' WHERE status = 'done'")
    op.execute("UPDATE board_workflows SET status = 'closed' WHERE status = 'archived'")


def downgrade() -> None:
    op.execute("UPDATE board_workflows SET status = 'archived' WHERE archived = TRUE")
    op.execute("UPDATE board_workflows SET status = 'open' WHERE status = 'todo'")
    op.execute("UPDATE board_workflows SET status = 'done' WHERE status = 'active'")
    op.execute("UPDATE board_workflows SET status = 'archived' WHERE status = 'closed'")
    op.drop_column("board_workflows", "archived")
