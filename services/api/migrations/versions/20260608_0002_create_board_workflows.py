"""create Board workflow tables

Revision ID: 20260608_0002
Revises: 20260607_0001
Create Date: 2026-06-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260608_0002"
down_revision = "20260607_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "board_workflows",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("uid", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("channel", sa.String(length=80), nullable=False),
        sa.Column("created_by", sa.String(length=120), nullable=False),
        sa.Column("assignee", sa.String(length=120), nullable=False),
        sa.Column("anchor_msg_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
    )
    op.create_index("ix_board_workflows_channel", "board_workflows", ["channel"])
    op.create_index("ix_board_workflows_status", "board_workflows", ["status"])

    op.create_table(
        "board_workflow_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("message_index", sa.Integer(), nullable=False),
        sa.Column("uid", sa.String(length=36), nullable=False),
        sa.Column("sender", sa.String(length=120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("time", sa.String(length=16), nullable=False),
        sa.Column("timestamp", sa.Float(), nullable=False),
        sa.Column("msg_type", sa.String(length=40), nullable=False),
        sa.Column("attachments_json", sa.Text(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column("resolved", sa.String(length=32), nullable=True),
        sa.Column("updated_at", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["workflow_id"], ["board_workflows.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
        sa.UniqueConstraint(
            "workflow_id",
            "message_index",
            name="uq_board_workflow_messages_index",
        ),
    )
    op.create_index(
        "ix_board_workflow_messages_workflow_id",
        "board_workflow_messages",
        ["workflow_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_board_workflow_messages_workflow_id", table_name="board_workflow_messages")
    op.drop_table("board_workflow_messages")
    op.drop_index("ix_board_workflows_status", table_name="board_workflows")
    op.drop_index("ix_board_workflows_channel", table_name="board_workflows")
    op.drop_table("board_workflows")
