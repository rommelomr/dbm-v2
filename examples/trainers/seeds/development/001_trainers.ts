import { Db } from 'mongodb';

// Seed de desarrollo. Idempotente vía upsert.
export async function up(db: Db) {
    await db.collection('trainers').updateOne(
        { email: 'ana@example.com' },
        {
            $setOnInsert: {
                name: 'Ana Pérez',
                email: 'ana@example.com',
                location: { type: 'Point', coordinates: [-70.6693, -33.4489] },
                status: 'active',
            },
        },
        { upsert: true }
    );
}
