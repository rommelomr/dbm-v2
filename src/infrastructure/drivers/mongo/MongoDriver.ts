import { MongoClient, Db, ClientSession } from 'mongodb';
import * as path from 'path';
import { Driver, DriverCapabilities, ExecutionContext, TransactionHandle, VersionCheckResult } from '../../../domain/Driver';
import { Migration, MigrationKind } from '../../../domain/Migration';
import { MigrationRecord } from '../../../domain/MigrationRecord';
import { DatabaseConfig, MongoConnection } from '../../../domain/DatabaseConfig';
import { DbmError, ExitCode } from '../../../domain/Project';
import { MongoCapabilities, majorVersionOf } from './MongoVersion';

const HISTORY_COLLECTION = 'dbm_history';
const LOCKS_COLLECTION = 'dbm_locks';

type MigrationModule = {
  up: (db: Db, session?: ClientSession) => Promise<void>;
  down?: (db: Db, session?: ClientSession) => Promise<void>;
};

let tsNodeRegistered = false;
function loadMigrationModule(filePath: string): MigrationModule {
  if (filePath.endsWith('.ts') && !tsNodeRegistered) {
    // Registro perezoso de ts-node solo si el proyecto usa migraciones en TypeScript.
    require('ts-node/register/transpile-only');
    tsNodeRegistered = true;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  delete require.cache[require.resolve(path.resolve(filePath))];
  return require(path.resolve(filePath));
}

export class MongoDriver implements Driver {
  readonly name = 'mongo';
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private transactionsAvailable = false;
  private lockId: string | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    const conn = config.connection as MongoConnection;
    this.client = new MongoClient(conn.uri);
    await this.client.connect();
    this.db = this.client.db(conn.database);

    // Detecta si el despliegue soporta transacciones (replica set / sharded).
    try {
      const hello = await this.db.command({ hello: 1 });
      this.transactionsAvailable = !!hello.setName || hello.msg === 'isdbgrid';
    } catch {
      this.transactionsAvailable = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.db = null;
  }

  private requireDb(): Db {
    if (!this.db) throw new DbmError('El driver de MongoDB no está conectado.', ExitCode.GenericError);
    return this.db;
  }

  async detectVersion(): Promise<string> {
    const info = await this.requireDb().command({ buildInfo: 1 });
    return info.version as string;
  }

  async checkVersion(configuredVersion: string): Promise<VersionCheckResult> {
    const detected = await this.detectVersion();
    const compatible = majorVersionOf(detected) === majorVersionOf(configuredVersion);
    return {
      configured: configuredVersion,
      detected,
      compatible,
      reason: compatible ? undefined : 'Database version does not match configured version.',
    };
  }

  capabilities(version: string): DriverCapabilities {
    return new MongoCapabilities(version, this.transactionsAvailable);
  }

  async ensureInfrastructure(): Promise<void> {
    const db = this.requireDb();
    const collections = await db.listCollections({ name: HISTORY_COLLECTION }).toArray();
    if (collections.length === 0) {
      await db.createCollection(HISTORY_COLLECTION);
      await db.collection(HISTORY_COLLECTION).createIndex({ type: 1, version: 1 }, { unique: true });
    }
    const lockCollections = await db.listCollections({ name: LOCKS_COLLECTION }).toArray();
    if (lockCollections.length === 0) {
      await db.createCollection(LOCKS_COLLECTION);
      await db.collection(LOCKS_COLLECTION).createIndex({ projectId: 1 }, { unique: true });
    }
  }

  async acquireLock(projectId: string): Promise<boolean> {
    this.lockId = projectId;
    try {
      await this.requireDb().collection(LOCKS_COLLECTION).insertOne({
        projectId,
        acquiredAt: new Date(),
      });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) return false; // índice único -> ya bloqueado
      throw err;
    }
  }

  async releaseLock(projectId: string): Promise<void> {
    await this.requireDb().collection(LOCKS_COLLECTION).deleteOne({ projectId });
  }

  async getHistory(kind?: MigrationKind): Promise<MigrationRecord[]> {
    const filter = kind ? { type: kind } : {};
    const docs = await this.requireDb()
      .collection(HISTORY_COLLECTION)
      .find(filter)
      .sort({ type: 1, version: 1 })
      .toArray();
    return docs.map((d: any) => ({
      version: d.version,
      name: d.name,
      type: d.type,
      checksum: d.checksum,
      executedAt: d.executedAt,
      executionTime: d.executionTime,
      environment: d.environment,
    }));
  }

  async recordExecution(record: MigrationRecord): Promise<void> {
    await this.requireDb().collection(HISTORY_COLLECTION).insertOne({ ...record });
  }

  async removeExecutionRecord(version: string, kind: MigrationKind): Promise<void> {
    await this.requireDb().collection(HISTORY_COLLECTION).deleteOne({ version, type: kind });
  }

  async beginTransaction(): Promise<TransactionHandle> {
    if (!this.transactionsAvailable || !this.client) return null;
    const session = this.client.startSession();
    session.startTransaction();
    return session;
  }

  async commitTransaction(tx: TransactionHandle): Promise<void> {
    const session = tx as ClientSession | null;
    if (!session) return;
    await session.commitTransaction();
    await session.endSession();
  }

  async rollbackTransaction(tx: TransactionHandle): Promise<void> {
    const session = tx as ClientSession | null;
    if (!session) return;
    await session.abortTransaction();
    await session.endSession();
  }

  async runUp(migration: Migration, ctx: ExecutionContext): Promise<void> {
    const mod = loadMigrationModule(migration.filePath);
    await mod.up(this.requireDb(), ctx.tx as ClientSession | undefined);
  }

  async runDown(migration: Migration, ctx: ExecutionContext): Promise<void> {
    if (migration.irreversible) {
      throw new DbmError(
        `Migration ${migration.version}_${migration.name} está marcada como irreversible y no puede revertirse.`,
        ExitCode.GenericError,
      );
    }
    const mod = loadMigrationModule(migration.filePath);
    if (!mod.down) {
      throw new DbmError(
        `El módulo ${migration.version}_${migration.name} no exporta una función down().`,
        ExitCode.GenericError,
      );
    }
    await mod.down(this.requireDb(), ctx.tx as ClientSession | undefined);
  }
}
