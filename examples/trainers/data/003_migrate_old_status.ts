// dbm:meta
// irreversible: true
// dbm:end

import { Db } from 'mongodb';

// Transformación de datos reales sobre documentos existentes (sección 18 del spec):
// todo trainer sin campo "status" pasa a "active".
export async function up(db: Db) {
    await db.collection('trainers').updateMany(
        { status: { $exists: false } },
        {
            $set: {
                status: 'active',
            },
        }
    );
}
