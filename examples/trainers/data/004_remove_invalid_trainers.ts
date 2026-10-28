// dbm:meta
// irreversible: false
// dbm:end

import { Db } from 'mongodb';

// El driver no impone soft delete ni hard delete (sección 19): aquí usamos
// soft delete para poder revertir si hace falta.
export async function up(db: Db) {
    await db.collection('trainers').updateMany(
        { email: { $in: [null, ''] } },
        {
            $set: { deletedAt: new Date() },
        }
    );
}

export async function down(db: Db) {
    await db.collection('trainers').updateMany(
        { email: { $in: [null, ''] }, deletedAt: { $exists: true } },
        {
            $unset: { deletedAt: '' },
        }
    );
}
