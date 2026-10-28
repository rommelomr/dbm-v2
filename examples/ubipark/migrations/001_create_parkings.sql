-- dbm:meta
-- irreversible: false
-- dbm:end

CREATE TABLE parkings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        TEXT NOT NULL,
    latitud       DOUBLE PRECISION,
    longitud      DOUBLE PRECISION,
    capacity      INTEGER,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
