import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit, resolveAllMigrations, withDriver, runOrExit } from './_shared';
import { MigrationRunner } from '../../application/MigrationRunner';
import { DataMigrationRunner } from '../../application/DataMigrationRunner';
import { MigrationHistoryService } from '../../application/MigrationHistoryService';

export function registerMigrateCommand(program: Command): void {
  program
    .command('migrate <project>')
    .description('Ejecuta las migraciones estructurales y de datos pendientes')
    .option('--env <environment>', 'Entorno', 'development')
    .option('--dry-run', 'Muestra qué se ejecutaría sin modificar la base', false)
    .option('--non-interactive', 'Para uso en CI/CD: nunca pide confirmación', false)
    .action(async (project: string, opts: { env: string; dryRun: boolean; nonInteractive: boolean }) => {
      const config = loadConfigOrExit(project);

      await runOrExit(
        withDriver(config, async (driver, detectedVersion) => {
          const { migrations, data } = resolveAllMigrations(config, opts.env);
          const history = new MigrationHistoryService(driver);

          const migrationRunner = new MigrationRunner(driver, history);
          const structuralSummary = await migrationRunner.run(migrations, detectedVersion, {
            environment: opts.env,
            dryRun: opts.dryRun,
          });

          const dataRunner = new DataMigrationRunner(driver, history);
          const dataSummary = await dataRunner.run(data, detectedVersion, {
            environment: opts.env,
            dryRun: opts.dryRun,
          });

          const printSummary = (label: string, applied: typeof structuralSummary.applied, skipped: typeof structuralSummary.skipped) => {
            if (applied.length === 0 && skipped.length === 0) return;
            console.log(chalk.bold(`\n${label}`));
            for (const a of applied) {
              console.log(chalk.green(`  ✓ ${a.version}_${a.name}${opts.dryRun ? ' (dry-run)' : ` (${a.durationMs}ms)`}`));
            }
            for (const s of skipped) {
              console.log(chalk.gray(`  - ${s.version}_${s.name} (${s.reason})`));
            }
          };

          printSummary('Migrations', structuralSummary.applied, structuralSummary.skipped);
          printSummary('Data changes', dataSummary.applied, dataSummary.skipped);

          if (structuralSummary.applied.length === 0 && dataSummary.applied.length === 0) {
            console.log('Nothing to migrate. Ya está todo al día.');
          }
        }),
      );
    });
}
