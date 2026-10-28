-- Seed de test: datos mínimos y predecibles para las pruebas automatizadas.
INSERT INTO parkings (id, nombre, capacity, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Parking', 10, 'active')
ON CONFLICT (id) DO NOTHING;
