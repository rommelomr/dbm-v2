// dbm:meta
// irreversible: false
// requires:
//   mongo:
//     minVersion: 5
// dbm:end

import { Db } from 'mongodb';

// $jsonSchema validation fue estabilizado en versiones recientes; declaramos el
// requisito de versión explícitamente (sección 23 del spec).
export async function up(db: Db) {
    await db.createCollection('reservations', {
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['trainerId', 'status'],
                properties: {
                    status: { enum: ['pending', 'confirmed', 'cancelled'] },
                },
            },
        },
    });
}

export async function down(db: Db) {
    await db.collection('reservations').drop();
}
