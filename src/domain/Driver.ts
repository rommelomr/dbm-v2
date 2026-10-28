import { Migration, MigrationKind } from './Migration';
import { MigrationRecord } from './MigrationRecord';
import { DatabaseConfig } from './DatabaseConfig';

/**
 * Resultado de comprobar la versión configurada contra la versión real detectada
 * en el servidor. El núcleo NUNCA asume el motor: cada driver decide cómo
 * detectar y comparar versiones.
 */
export interface VersionCheckResult {
  configured: string;
  detected: string;
  compatible: boolean;
  reason?: string;
}

/**
 * Capacidades que un driver puede declarar según el motor + versión.
 * El núcleo consulta estas capacidades en lugar de asumir comportamiento SQL.
 */
export interface DriverCapabilities {
  supportsTransactions: boolean;
  supportsSchemas: boolean;
  supportsAdvisoryLocks: boolean;
  supportsRollback: boolean;
  /** Devuelve si una feature declarada por una migración (`requires`) está soportada. */
  supportsFeature(feature: string): boolean;
}

/**
 * Un "handle" transaccional opaco para el núcleo. Cada driver decide su forma real
 * (client de pg dentro de BEGIN/COMMIT, sesión de Mongo, o `null` si el motor/operación
 * no soporta transacciones).
 */
export type TransactionHandle = unknown;

export interface ExecutionContext {
  /** Handle transaccional, si el driver decidió abrir una transacción para esta operación. */
  tx: TransactionHandle;
  dryRun: boolean;
  environment: string;
}

/**
 * Contrato que debe implementar cada driver de motor (postgres, mongo, ...).
 * El núcleo (application/*) solo conoce esta interfaz: nunca SQL, nunca BSON.
 */
export interface Driver {
  readonly name: string;

  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;

  /** Versión real detectada conectándose al servidor (no la versión configurada). */
  detectVersion(): Promise<string>;

  /** Compara la versión configurada contra la detectada según la política del proyecto. */
  checkVersion(configuredVersion: string): Promise<VersionCheckResult>;

  capabilities(version: string): DriverCapabilities;

  /** Crea las estructuras de historial/locking si no existen (idempotente). */
  ensureInfrastructure(): Promise<void>;

  /** Intenta tomar un lock exclusivo de ejecución para este proyecto/base. */
  acquireLock(projectId: string): Promise<boolean>;
  releaseLock(projectId: string): Promise<void>;

  /** Historial de operaciones ejecutadas (migrations, data, seeds si aplica). */
  getHistory(kind?: MigrationKind): Promise<MigrationRecord[]>;
  recordExecution(record: MigrationRecord): Promise<void>;
  removeExecutionRecord(version: string, kind: MigrationKind): Promise<void>;

  /** Ejecuta el "up" de una migración/cambio de datos/seed dentro del contexto dado. */
  runUp(migration: Migration, ctx: ExecutionContext): Promise<void>;
  /** Ejecuta el "down" de una migración reversible. Debe rechazar si es irreversible. */
  runDown(migration: Migration, ctx: ExecutionContext): Promise<void>;

  /** Abre una transacción si el driver/versión la soporta; si no, retorna null. */
  beginTransaction(): Promise<TransactionHandle>;
  commitTransaction(tx: TransactionHandle): Promise<void>;
  rollbackTransaction(tx: TransactionHandle): Promise<void>;
}
