-- dbm:meta
-- irreversible: true
-- dbm:end

-- Normaliza espacios en blanco en nombres existentes (sección 7 del spec).
UPDATE parkings
SET nombre = TRIM(nombre)
WHERE nombre IS NOT NULL;
