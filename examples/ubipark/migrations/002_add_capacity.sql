-- dbm:meta
-- irreversible: false
-- dbm:end

ALTER TABLE parkings
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
