-- dbm:meta
-- irreversible: false
-- requires:
--   postgres:
--     minVersion: 15
-- dbm:end

-- MERGE es una feature de PostgreSQL 15+, por eso esta migración declara
-- explícitamente su requisito de versión (sección 23 del spec).
CREATE TABLE favorites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    parking_id  UUID NOT NULL REFERENCES parkings(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, parking_id)
);
