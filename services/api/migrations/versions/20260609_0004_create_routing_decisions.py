"""create routing decisions tables

Revision ID: 20260609_0004
Revises: 20260608_0003
Create Date: 2026-06-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260609_0004"
down_revision = "20260608_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "routing_decisions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("uid", sa.String(length=36), nullable=False),
        sa.Column("channel", sa.String(length=80), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("sender", sa.String(length=120), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=True),
        sa.Column("workflow_id", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
    )
    op.create_index(
        "ix_routing_decisions_channel_created_at",
        "routing_decisions",
        ["channel", "created_at"],
    )
    op.create_index("ix_routing_decisions_source", "routing_decisions", ["source"])

    op.create_table(
        "routing_decision_targets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("decision_id", sa.Integer(), nullable=False),
        sa.Column("target", sa.String(length=120), nullable=False),
        sa.Column("route_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["routing_decisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "decision_id",
            "target",
            name="uq_routing_decision_targets_target",
        ),
    )
    op.create_index(
        "ix_routing_decision_targets_decision_id",
        "routing_decision_targets",
        ["decision_id"],
    )
    op.create_index(
        "ix_routing_decision_targets_target",
        "routing_decision_targets",
        ["target"],
    )

    op.create_table(
        "routing_decision_mentions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("decision_id", sa.Integer(), nullable=False),
        sa.Column("mention", sa.String(length=120), nullable=False),
        sa.Column("mention_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["decision_id"], ["routing_decisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "decision_id",
            "mention",
            name="uq_routing_decision_mentions_mention",
        ),
    )
    op.create_index(
        "ix_routing_decision_mentions_decision_id",
        "routing_decision_mentions",
        ["decision_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_routing_decision_mentions_decision_id", table_name="routing_decision_mentions")
    op.drop_table("routing_decision_mentions")
    op.drop_index("ix_routing_decision_targets_target", table_name="routing_decision_targets")
    op.drop_index("ix_routing_decision_targets_decision_id", table_name="routing_decision_targets")
    op.drop_table("routing_decision_targets")
    op.drop_index("ix_routing_decisions_source", table_name="routing_decisions")
    op.drop_index("ix_routing_decisions_channel_created_at", table_name="routing_decisions")
    op.drop_table("routing_decisions")
