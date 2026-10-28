// dbm:meta
// irreversible: false
// dbm:end

import { Db } from 'mongodb';

export async function up(db: Db) {
    await db.createCollection('trainers');
    await db.collection('trainers').createIndex({ email: 1 }, { unique: true });
    await db.collection('trainers').createIndex({
        location: '2dsphere'
    });
}

export async function down(db: Db) {
    await db.collection('trainers').dropIndex('location_2dsphere');
    await db.collection('trainers').dropIndex('email_1');
}
