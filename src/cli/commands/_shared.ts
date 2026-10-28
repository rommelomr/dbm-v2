import chalk from 'chalk';
import { Driver } from '../../domain/Driver';
import { ProjectConfig } from '../../domain/DatabaseConfig';
import { loadProjectConfig } from '../../infrastructure/configuration/ConfigLoader';
import { createDriver } from '../../infrastructure/drivers/DriverFactory';
import { DbmError, ExitCode } from '../../domain/Project';
import { Migration, MigrationKind } from '../../domain/Migration';
import { MigrationResolver } from '../../application/MigrationResolver';

export function fail(message: string): never {
  console.error(chalk.red(`ERROR\n\n${message}`));
  process.exit(ExitCode.GenericError);
}

export function loadConfigOrExit(projectName: string): ProjectConfig {
  try {
    return loadProjectConfig(projectName);
  } catch (err) {
    if (err instanceof DbmError) {
      console.error(chalk.red(err.message));
      process.exit(err.exitCode);
    }
    throw err;
  }
}

export function resolveAllMigrations(
  config: ProjectConfig,
  environment: string,
): { migrations: Migration[]; data: Migration[]; seeds: Migration[] } {
  const migrations = MigrationResolver.resolveDirectory(config.migrations.path, 'migration');
  const data = MigrationResolver.resolveDirectory(config.data.path, 'data');
  const seeds = MigrationResolver.resolveDirectory(config.seeds.path, 'seed', { environment });
  return { migrations, data, seeds };
}

/**
 * Envuelve el ciclo completo: conectar, asegurar infraestructura, tomar lock,
 * ejecutar `fn`, liberar lock y desconectar — siempre, incluso si `fn` lanza.
 * Traduce cualquier DbmError al código de salida correspondiente (sección 25).
 */
export async function withDriver<T>(
  config: ProjectConfig,
  fn: (driver: Driver, detectedVersion: string) => Promise<T>,
  options: { requireLock?: boolean; skipVersionGuard?: boolean } = {},
): Promise<T> {
  const driver = createDriver(config.database.driver);
  const requireLock = options.requireLock ?? true;
  let locked = false;

  try {
    await driver.connect(config.database);
    await driver.ensureInfrastructure();

    const versionCheck = await driver.checkVersion(config.database.version);
    if (!versionCheck.compatible && !options.skipVersionGuard) {
      const policy = config.database.onVersionMismatch ?? 'error';
      const message = [
        `Configured:`,
        `${config.database.driver} ${versionCheck.configured}`,
        ``,
        `Detected:`,
        `${config.database.driver} ${versionCheck.detected}`,
        ``,
        policy === 'error' ? `ERROR:\nDatabase version does not match configured version.` : `WARNING:\nDatabase version does not match configured version.`,
      ].join('\n');

      if (policy === 'error') {
        throw new DbmError(message, ExitCode.VersionIncompatibility);
      } else if (policy === 'warn') {
        console.warn(chalk.yellow(message));
      }
    }

    if (requireLock) {
      locked = await driver.acquireLock(config.project);
      if (!locked) {
        throw new DbmError('Migration process already running.', ExitCode.MigrationLock);
      }
    }

    return await fn(driver, versionCheck.detected);
  } finally {
    if (requireLock && locked) {
      await driver.releaseLock(config.project).catch(() => undefined);
    }
    await driver.disconnect().catch(() => undefined);
  }
}

export async function runOrExit<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof DbmError) {
      console.error(chalk.red(err.message));
      process.exit(err.exitCode);
    }
    console.error(chalk.red((err as Error).stack ?? String(err)));
    process.exit(ExitCode.GenericError);
  }
}

export function kindLabel(kind: MigrationKind): string {
  return kind === 'migration' ? 'migration' : kind;
}
