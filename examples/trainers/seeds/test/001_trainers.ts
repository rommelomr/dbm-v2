import { Db } from 'mongodb';

export async function up(db: Db) {
    await db.collection('trainers').updateOne(
        { _id: 'test-trainer-1' as any },
        {
            $setOnInsert: {
                name: 'Test Trainer',
                email: 'test@example.com',
                status: 'active',
            },
        },
        { upsert: true }
    );
}
