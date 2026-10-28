import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit } from './_shared';
import { scaffoldMigration } from '../../infrastructure/filesystem/ProjectScaffolder';

export function registerDataCommands(program: Command): void {
  program
    .command('data')
    .description('Gestión de migraciones de datos (transformaciones sobre datos existentes)')
    .command('create <project> <name>')
    .description('Crea un nuevo archivo de migración de datos')
    .action((project: string, name: string) => {
      const config = loadConfigOrExit(project);
      const filePath = scaffoldMigration(config.data.path, name, config.database.driver, 'data');
      console.log(chalk.green(`Migración de datos creada: ${filePath}`));
    });
}
