-- dbm:meta
-- irreversible: false
-- dbm:end

-- Soft delete: no imponemos hard delete, la estrategia pertenece al proyecto
-- (sección 8 del spec).
UPDATE parkings
SET deleted_at = CURRENT_TIMESTAMP,
    status = 'inactive'
WHERE status = 'pending_removal';
