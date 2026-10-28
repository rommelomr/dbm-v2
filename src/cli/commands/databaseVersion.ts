import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit, withDriver, runOrExit } from './_shared';

export function registerDatabaseCommands(program: Command): void {
  program
    .command('database')
    .description('Comandos relacionados a la base de datos')
    .command('version <project>')
    .description('Compara la versión configurada contra la versión detectada del servidor')
    .action(async (project: string) => {
      const config = loadConfigOrExit(project);

      await runOrExit(
        withDriver(
          config,
          async (driver) => {
            const check = await driver.checkVersion(config.database.version);
            console.log(`Configured: ${config.database.driver} ${check.configured}`);
            console.log(`Detected:   ${config.database.driver} ${check.detected}`);
            console.log(`Status:     ${check.compatible ? chalk.green('Compatible') : chalk.red('Incompatible')}`);
          },
          { requireLock: false, skipVersionGuard: true },
        ),
      );
    });
}
