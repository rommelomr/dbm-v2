import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import { loadConfigOrExit, resolveAllMigrations, withDriver, runOrExit } from './_shared';

export function registerStatusCommand(program: Command): void {
  program
    .command('status <project>')
    .description('Muestra el estado de migraciones, data changes y seeds del proyecto')
    .option('--env <environment>', 'Entorno', 'development')
    .action(async (project: string, opts: { env: string }) => {
      const config = loadConfigOrExit(project);

      await runOrExit(
        withDriver(
          config,
          async (driver, detectedVersion) => {
            const { migrations, data, seeds } = resolveAllMigrations(config, opts.env);
            const executedKeys = new Set(
              (await driver.getHistory()).map((h) => `${h.type}:${h.version}`),
            );

            console.log(chalk.bold(`Project: ${config.project}`));
            console.log(`Driver: ${config.database.driver}  |  Configured: ${config.database.version}  |  Detected: ${detectedVersion}\n`);

            const table = new Table({ head: ['Type', 'Version', 'Name', 'Status'] });
            for (const m of [...migrations, ...data]) {
              const applied = executedKeys.has(`${m.kind}:${m.version}`);
              table.push([m.kind, m.version, m.name, applied ? chalk.green('applied') : chalk.yellow('pending')]);
            }
            for (const s of seeds) {
              table.push(['seed', s.version, s.name, chalk.gray(`(env: ${s.environments?.join(',') ?? 'all'})`)]);
            }

            if (table.length === 0) {
              console.log('No hay migraciones, cambios de datos ni seeds definidos todavía.');
            } else {
              console.log(table.toString());
            }
          },
          { requireLock: false },
        ),
      );
    });
}
