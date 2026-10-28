import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit, resolveAllMigrations, withDriver, runOrExit } from './_shared';
import { scaffoldSeed } from '../../infrastructure/filesystem/ProjectScaffolder';
import { SeedRunner } from '../../application/SeedRunner';
import { MigrationHistoryService } from '../../application/MigrationHistoryService';

export function registerSeedCommands(program: Command): void {
  const seed = program
    .command('seed <project>')
    .description('Ejecuta los seeds del proyecto para el entorno indicado')
    .option('--env <environment>', 'Entorno (development | test | staging | production)', 'development')
    .option('--dry-run', 'Muestra qué seeds se ejecutarían sin aplicarlos', false)
    .option('--rerun', 'Permite re-ejecutar seeds ya marcados como ejecutados (idempotentes)', false)
    .action(async (project: string, opts: { env: string; dryRun: boolean; rerun: boolean }) => {
      const config = loadConfigOrExit(project);

      await runOrExit(
        withDriver(config, async (driver, detectedVersion) => {
          const { seeds } = resolveAllMigrations(config, opts.env);
          if (seeds.length === 0) {
            console.log(`No hay seeds definidos para el entorno "${opts.env}".`);
            return;
          }

          const history = new MigrationHistoryService(driver);
          const runner = new SeedRunner(driver, history);
          const summary = await runner.run(seeds, detectedVersion, {
            environment: opts.env,
            dryRun: opts.dryRun,
            allowRerun: opts.rerun,
          });

          for (const applied of summary.applied) {
            console.log(chalk.green(`✓ ${applied.version}_${applied.name}${opts.dryRun ? ' (dry-run)' : ` (${applied.durationMs}ms)`}`));
          }
          for (const skipped of summary.skipped) {
            console.log(chalk.gray(`- ${skipped.version}_${skipped.name} (${skipped.reason})`));
          }
        }),
      );
    });

  seed
    .command('create <project> <name>')
    .description('Crea un nuevo archivo de seed')
    .option('--env <environment>', 'Entorno del seed', 'development')
    .action((project: string, name: string, opts: { env: string }) => {
      const config = loadConfigOrExit(project);
      const filePath = scaffoldSeed(config.seeds.path, name, config.database.driver, opts.env);
      console.log(chalk.green(`Seed creado: ${filePath}`));
    });
}
