CREATE SCHEMA IF NOT EXISTS items;

CREATE TABLE IF NOT EXISTS items.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL,
    section_id UUID NOT NULL,
    type_schema_id UUID NOT NULL,
    slug VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, slug)
);

CREATE TABLE IF NOT EXISTS items.item_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    locale VARCHAR(10) NOT NULL,
    fields JSONB NOT NULL DEFAULT '{}',
    UNIQUE(item_id, locale)
);

CREATE TABLE IF NOT EXISTS items.item_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    skill_type VARCHAR(100),
    data JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items.item_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items.item_changelog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items.items(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    patch VARCHAR(100),
    changes TEXT NOT NULL,
    change_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_game_id ON items.items(game_id);
CREATE INDEX IF NOT EXISTS idx_items_section_id ON items.items(section_id);
CREATE INDEX IF NOT EXISTS idx_items_slug ON items.items(slug);
