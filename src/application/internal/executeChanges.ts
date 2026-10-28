import { Driver, ExecutionContext } from '../../domain/Driver';
import { Migration, MigrationKind } from '../../domain/Migration';
import { MigrationHistoryService } from '../MigrationHistoryService';
import { DbmError, ExitCode } from '../../domain/Project';
import semver from 'semver';

export interface RunOptions {
  environment: string;
  dryRun: boolean;
  /** true para seeds diseñados para re-ejecutarse (idempotentes). */
  allowRerun?: boolean;
}

export interface RunSummary {
  kind: MigrationKind;
  applied: { version: string; name: string; durationMs: number }[];
  skipped: { version: string; name: string; reason: string }[];
}

function coerce(version: string): string {
  // Permite versiones simples tipo "17" o "13" -> "17.0.0" para comparar con semver.
  return semver.valid(semver.coerce(version) ?? '') || '0.0.0';
}

function checkRequirement(migration: Migration, driverName: string, detectedVersion: string): string | null {
  const req = migration.requires?.[driverName];
  if (!req) return null;
  const detected = coerce(detectedVersion);
  if (req.minVersion && semver.lt(detected, coerce(req.minVersion))) {
    return `requiere ${driverName} >= ${req.minVersion}. Versión actual: ${detectedVersion}`;
  }
  if (req.maxVersion && semver.gt(detected, coerce(req.maxVersion))) {
    return `requiere ${driverName} <= ${req.maxVersion}. Versión actual: ${detectedVersion}`;
  }
  return null;
}

/**
 * Ejecuta en orden una lista de migraciones/data-changes/seeds pendientes.
 * Comparte la misma lógica de: verificación de requisitos de motor, transacciones,
 * dry-run y registro en el historial, sin importar el `kind`.
 */
export async function executeChanges(
  driver: Driver,
  history: MigrationHistoryService,
  toRun: Migration[],
  detectedVersion: string,
  options: RunOptions,
): Promise<RunSummary> {
  const summary: RunSummary = { kind: toRun[0]?.kind ?? 'migration', applied: [], skipped: [] };
  const executedKeys = options.allowRerun ? new Set<string>() : await history.getExecutedKeys();

  for (const migration of toRun) {
    const key = `${migration.kind}:${migration.version}`;
    if (!options.allowRerun && executedKeys.has(key)) {
      summary.skipped.push({ version: migration.version, name: migration.name, reason: 'ya ejecutada' });
      continue;
    }

    if (migration.environments && migration.environments.length > 0 && !migration.environments.includes(options.environment)) {
      summary.skipped.push({
        version: migration.version,
        name: migration.name,
        reason: `restringida a entorno(s) ${migration.environments.join(', ')}, actual: ${options.environment}`,
      });
      continue;
    }

    const requirementError = checkRequirement(migration, driver.name, detectedVersion);
    if (requirementError) {
      throw new DbmError(
        `Migration ${migration.version}_${migration.name} ${requirementError}`,
        ExitCode.VersionIncompatibility,
      );
    }

    if (options.dryRun) {
      summary.applied.push({ version: migration.version, name: migration.name, durationMs: 0 });
      continue;
    }

    const caps = driver.capabilities(detectedVersion);
    const tx = caps.supportsTransactions ? await driver.beginTransaction() : null;
    const ctx: ExecutionContext = { tx, dryRun: false, environment: options.environment };

    const start = Date.now();
    try {
      await driver.runUp(migration, ctx);
      const durationMs = Date.now() - start;

      if (!options.allowRerun) {
        await history.record({
          version: migration.version,
          name: migration.name,
          type: migration.kind,
          checksum: migration.checksum,
          executedAt: new Date(),
          executionTime: durationMs,
          environment: options.environment,
        });
      }

      if (tx) await driver.commitTransaction(tx);
      summary.applied.push({ version: migration.version, name: migration.name, durationMs });
    } catch (err) {
      if (tx) await driver.rollbackTransaction(tx);
      throw new DbmError(
        `Error ejecutando ${migration.kind} ${migration.version}_${migration.name}: ${(err as Error).message}`,
        ExitCode.GenericError,
      );
    }
  }

  return summary;
}
