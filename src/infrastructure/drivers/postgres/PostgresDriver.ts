import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Driver, DriverCapabilities, ExecutionContext, TransactionHandle, VersionCheckResult } from '../../../domain/Driver';
import { Migration, MigrationKind } from '../../../domain/Migration';
import { MigrationRecord } from '../../../domain/MigrationRecord';
import { DatabaseConfig, PostgresConnection } from '../../../domain/DatabaseConfig';
import { DbmError, ExitCode } from '../../../domain/Project';
import { PostgresCapabilities, majorVersionOf } from './PostgresVersion';

const HISTORY_TABLE = 'dbm_history';

function historyTableIdentifier(schema: string): string {
  return `"${schema}"."${HISTORY_TABLE}"`;
}

/** Convierte un string de proyecto en un bigint estable para pg_advisory_lock. */
function lockKeyFor(projectId: string): string {
  const hash = crypto.createHash('sha256').update(projectId).digest();
  // pg_advisory_lock(bigint) espera un entero de 64 bits con signo; tomamos 63 bits.
  return (hash.readBigUInt64BE(0) & 0x7fffffffffffffffn).toString();
}

function downFilePathFor(filePath: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, -ext.length) + '.down' + ext;
}

export class PostgresDriver implements Driver {
  readonly name = 'postgres';
  private client: Client | null = null;
  private schema = 'public';
  private lockKey: string | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    const conn = config.connection as PostgresConnection;
    this.schema = config.schema ?? 'public';
    this.client = new Client({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await this.client.connect();
    await this.client.query(`SET search_path TO "${this.schema}", public`);
  }

  async disconnect(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new DbmError('El driver de PostgreSQL no está conectado.', ExitCode.GenericError);
    }
    return this.client;
  }

  async detectVersion(): Promise<string> {
    const res = await this.requireClient().query('SHOW server_version');
    return res.rows[0].server_version as string;
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
    return new PostgresCapabilities(version);
  }

  async ensureInfrastructure(): Promise<void> {
    const client = this.requireClient();
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${historyTableIdentifier(this.schema)} (
        version         TEXT NOT NULL,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL,
        checksum        TEXT NOT NULL,
        executed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        execution_time  INTEGER NOT NULL,
        environment     TEXT NOT NULL,
        PRIMARY KEY (type, version)
      )
    `);
  }

  async acquireLock(projectId: string): Promise<boolean> {
    this.lockKey = lockKeyFor(projectId);
    const res = await this.requireClient().query('SELECT pg_try_advisory_lock($1) AS locked', [this.lockKey]);
    return res.rows[0].locked === true;
  }

  async releaseLock(projectId: string): Promise<void> {
    if (!this.lockKey) return;
    await this.requireClient().query('SELECT pg_advisory_unlock($1)', [this.lockKey]);
  }

  async getHistory(kind?: MigrationKind): Promise<MigrationRecord[]> {
    const client = this.requireClient();
    const query = kind
      ? `SELECT * FROM ${historyTableIdentifier(this.schema)} WHERE type = $1 ORDER BY version`
      : `SELECT * FROM ${historyTableIdentifier(this.schema)} ORDER BY type, version`;
    const res = kind ? await client.query(query, [kind]) : await client.query(query);
    return res.rows.map((row: any) => ({
      version: row.version,
      name: row.name,
      type: row.type,
      checksum: row.checksum,
      executedAt: row.executed_at,
      executionTime: row.execution_time,
      environment: row.environment,
    }));
  }

  async recordExecution(record: MigrationRecord): Promise<void> {
    await this.requireClient().query(
      `INSERT INTO ${historyTableIdentifier(this.schema)}
         (version, name, type, checksum, executed_at, execution_time, environment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.version, record.name, record.type, record.checksum, record.executedAt, record.executionTime, record.environment],
    );
  }

  async removeExecutionRecord(version: string, kind: MigrationKind): Promise<void> {
    await this.requireClient().query(
      `DELETE FROM ${historyTableIdentifier(this.schema)} WHERE type = $1 AND version = $2`,
      [kind, version],
    );
  }

  async beginTransaction(): Promise<TransactionHandle> {
    await this.requireClient().query('BEGIN');
    return this.client;
  }

  async commitTransaction(): Promise<void> {
    await this.requireClient().query('COMMIT');
  }

  async rollbackTransaction(): Promise<void> {
    await this.requireClient().query('ROLLBACK');
  }

  async runUp(migration: Migration, _ctx: ExecutionContext): Promise<void> {
    const sql = fs.readFileSync(migration.filePath, 'utf8');
    await this.requireClient().query(sql);
  }

  async runDown(migration: Migration, _ctx: ExecutionContext): Promise<void> {
    if (migration.irreversible) {
      throw new DbmError(
        `Migration ${migration.version}_${migration.name} está marcada como irreversible y no puede revertirse.`,
        ExitCode.GenericError,
      );
    }
    const downPath = downFilePathFor(migration.filePath);
    if (!fs.existsSync(downPath)) {
      throw new DbmError(
        `No existe el archivo down (${path.basename(downPath)}) para revertir ${migration.version}_${migration.name}.`,
        ExitCode.GenericError,
      );
    }
    const sql = fs.readFileSync(downPath, 'utf8');
    await this.requireClient().query(sql);
  }
}
