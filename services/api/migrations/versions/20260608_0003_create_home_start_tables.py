"""create home start tables

Revision ID: 20260608_0003
Revises: 20260608_0002
Create Date: 2026-06-08
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260608_0003"
down_revision = "20260608_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "home_repositories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repository_id", sa.String(length=240), nullable=False),
        sa.Column("full_name", sa.String(length=240), nullable=False),
        sa.Column("git_provider", sa.String(length=40), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("main_branch", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repository_id"),
    )
    op.create_index("ix_home_repositories_full_name", "home_repositories", ["full_name"])

    op.create_table(
        "home_repository_branches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("commit_sha", sa.String(length=80), nullable=False),
        sa.Column("protected", sa.Boolean(), nullable=False),
        sa.Column("last_push_date", sa.String(length=40), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["home_repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_home_repository_branches_repository_id",
        "home_repository_branches",
        ["repository_id"],
    )

    op.create_table(
        "home_conversations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("uid", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("selected_repository", sa.String(length=240), nullable=True),
        sa.Column("selected_branch", sa.String(length=160), nullable=True),
        sa.Column("git_provider", sa.String(length=40), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("url", sa.String(length=260), nullable=False),
        sa.Column("suggested_task_json", sa.Text(), nullable=False),
        sa.Column("initial_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("updated_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
    )
    op.create_index("ix_home_conversations_updated_at", "home_conversations", ["updated_at"])

    op.create_table(
        "home_suggested_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("uid", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("repo", sa.String(length=240), nullable=True),
        sa.Column("git_provider", sa.String(length=40), nullable=True),
        sa.Column("task_type", sa.String(length=60), nullable=False),
        sa.Column("issue_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uid"),
    )


def downgrade() -> None:
    op.drop_table("home_suggested_tasks")
    op.drop_index("ix_home_conversations_updated_at", table_name="home_conversations")
    op.drop_table("home_conversations")
    op.drop_index(
        "ix_home_repository_branches_repository_id",
        table_name="home_repository_branches",
    )
    op.drop_table("home_repository_branches")
    op.drop_index("ix_home_repositories_full_name", table_name="home_repositories")
    op.drop_table("home_repositories")
