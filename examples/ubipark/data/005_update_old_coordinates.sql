-- dbm:meta
-- irreversible: true
-- dbm:end

-- Corrige coordenadas antiguas cargadas en un sistema de referencia distinto.
UPDATE parkings
SET latitud = latitud / 1000.0,
    longitud = longitud / 1000.0
WHERE latitud > 90 OR latitud < -90;
