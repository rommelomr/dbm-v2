-- Seed de desarrollo: datos de ejemplo para trabajar localmente.
-- Este seed es idempotente: puede correrse varias veces sin duplicar filas.
INSERT INTO parkings (nombre, latitud, longitud, capacity, status)
SELECT 'Parking Centro', -33.4489, -70.6693, 120, 'active'
WHERE NOT EXISTS (SELECT 1 FROM parkings WHERE nombre = 'Parking Centro');

INSERT INTO parkings (nombre, latitud, longitud, capacity, status)
SELECT 'Parking Aeropuerto', -33.3930, -70.7858, 500, 'active'
WHERE NOT EXISTS (SELECT 1 FROM parkings WHERE nombre = 'Parking Aeropuerto');
