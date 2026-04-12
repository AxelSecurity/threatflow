"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── user ──────────────────────────────────────────────────────────
    op.create_table(
        'user',
        sa.Column('id',           UUID(as_uuid=True), primary_key=True),
        sa.Column('email',        sa.String(256),     nullable=False, unique=True),
        sa.Column('display_name', sa.String(128),     nullable=False),
        sa.Column('hashed_pw',    sa.String(256),     nullable=False),
        sa.Column('role',         sa.String(16),      nullable=False, server_default='analyst'),
        sa.Column('active',       sa.Boolean(),       nullable=False, server_default='true'),
        sa.Column('created_at',   sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at',   sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_user_email', 'user', ['email'])

    # ── source ────────────────────────────────────────────────────────
    op.create_table(
        'source',
        sa.Column('id',             UUID(as_uuid=True), primary_key=True),
        sa.Column('name',           sa.String(128),     nullable=False, unique=True),
        sa.Column('feed_type',      sa.String(16),      nullable=False),
        sa.Column('url',            sa.String(2048),    nullable=True),
        sa.Column('active',         sa.Boolean(),       nullable=False, server_default='true'),
        sa.Column('fetch_interval', sa.Integer(),       nullable=False, server_default='3600'),
        sa.Column('config',         JSONB(),            nullable=False, server_default='{}'),
        sa.Column('last_fetched',   sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at',     sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at',     sa.DateTime(timezone=True), nullable=False),
    )

    # ── ioc ───────────────────────────────────────────────────────────
    op.create_table(
        'ioc',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True),
        sa.Column('ioc_type',   sa.String(16),      nullable=False),
        sa.Column('value',      sa.String(2048),    nullable=False),
        sa.Column('tlp',        sa.String(8),       nullable=False, server_default='amber'),
        sa.Column('score',      sa.Float(),         nullable=False, server_default='50.0'),
        sa.Column('status',     sa.String(16),      nullable=False, server_default='active'),
        sa.Column('ttl_days',   sa.Integer(),       nullable=True),
        sa.Column('first_seen', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen',  sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_ioc_ioc_type', 'ioc', ['ioc_type'])
    op.create_index('ix_ioc_value',    'ioc', ['value'])

    # ── ioc_source ────────────────────────────────────────────────────
    op.create_table(
        'ioc_source',
        sa.Column('ioc_id',    UUID(as_uuid=True), sa.ForeignKey('ioc.id'),    primary_key=True),
        sa.Column('source_id', UUID(as_uuid=True), sa.ForeignKey('source.id'), primary_key=True),
        sa.Column('raw_score', sa.Float(),  nullable=True),
        sa.Column('seen_at',   sa.DateTime(timezone=True), nullable=False),
        sa.Column('raw_data',  JSONB(),     nullable=True),
    )

    # ── tag ───────────────────────────────────────────────────────────
    op.create_table(
        'tag',
        sa.Column('id',    UUID(as_uuid=True), primary_key=True),
        sa.Column('name',  sa.String(64),  nullable=False, unique=True),
        sa.Column('color', sa.String(16),  nullable=False, server_default='#888888'),
    )

    # ── ioc_tag ───────────────────────────────────────────────────────
    op.create_table(
        'ioc_tag',
        sa.Column('ioc_id', UUID(as_uuid=True), sa.ForeignKey('ioc.id'), primary_key=True),
        sa.Column('tag_id', UUID(as_uuid=True), sa.ForeignKey('tag.id'), primary_key=True),
    )

    # ── flow ──────────────────────────────────────────────────────────
    op.create_table(
        'flow',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True),
        sa.Column('name',       sa.String(128),     nullable=False, unique=True),
        sa.Column('active',     sa.Boolean(),       nullable=False, server_default='false'),
        sa.Column('definition', JSONB(),            nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('ioc_tag')
    op.drop_table('ioc_source')
    op.drop_table('flow')
    op.drop_table('tag')
    op.drop_index('ix_ioc_value',    'ioc')
    op.drop_index('ix_ioc_ioc_type', 'ioc')
    op.drop_table('ioc')
    op.drop_table('source')
    op.drop_index('ix_user_email', 'user')
    op.drop_table('user')
