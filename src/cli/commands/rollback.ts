import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit, resolveAllMigrations, withDriver, runOrExit } from './_shared';
import { DbmError, ExitCode } from '../../domain/Project';
import { Migration } from '../../domain/Migration';
import { ExecutionContext } from '../../domain/Driver';

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback <project>')
    .description('Revierte las últimas N migraciones/cambios de datos ejecutados (solo los reversibles)')
    .option('--steps <n>', 'Cantidad de pasos a revertir', '1')
    .option('--env <environment>', 'Entorno', 'development')
    .action(async (project: string, opts: { steps: string; env: string }) => {
      const config = loadConfigOrExit(project);
      const steps = parseInt(opts.steps, 10);
      if (!Number.isInteger(steps) || steps < 1) {
        console.error(chalk.red('--steps debe ser un entero positivo.'));
        process.exit(ExitCode.InvalidConfiguration);
      }

      await runOrExit(
        withDriver(config, async (driver, detectedVersion) => {
          const { migrations, data } = resolveAllMigrations(config, opts.env);
          const byKey = new Map<string, Migration>();
          for (const m of [...migrations, ...data]) byKey.set(`${m.kind}:${m.version}`, m);

          // Solo migrations y data participan del rollback estructural; los seeds no se revierten.
          const history = (await driver.getHistory('migration')).concat(await driver.getHistory('data'));
          history.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());

          const toRevert = history.slice(0, steps);
          if (toRevert.length === 0) {
            console.log('No hay migraciones ejecutadas para revertir.');
            return;
          }

          for (const record of toRevert) {
            const migration = byKey.get(`${record.type}:${record.version}`);
            if (!migration) {
              throw new DbmError(
                `No se encontró en disco el archivo de ${record.type} ${record.version}_${record.name}; no se puede revertir de forma segura.`,
                ExitCode.GenericError,
              );
            }
            if (migration.irreversible) {
              throw new DbmError(
                `Migration ${migration.version}_${migration.name} es irreversible. Rollback detenido.`,
                ExitCode.GenericError,
              );
            }

            const caps = driver.capabilities(detectedVersion);
            const tx = caps.supportsTransactions ? await driver.beginTransaction() : null;
            const ctx: ExecutionContext = { tx, dryRun: false, environment: opts.env };
            try {
              await driver.runDown(migration, ctx);
              await driver.removeExecutionRecord(migration.version, migration.kind);
              if (tx) await driver.commitTransaction(tx);
              console.log(chalk.green(`✓ reverted ${migration.kind} ${migration.version}_${migration.name}`));
            } catch (err) {
              if (tx) await driver.rollbackTransaction(tx);
              throw err;
            }
          }
        }),
      );
    });
}
