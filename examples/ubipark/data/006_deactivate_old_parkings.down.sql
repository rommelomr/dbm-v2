UPDATE parkings
SET deleted_at = NULL,
    status = 'pending_removal'
WHERE status = 'inactive' AND deleted_at IS NOT NULL;
