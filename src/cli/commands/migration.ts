import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfigOrExit } from './_shared';
import { scaffoldMigration } from '../../infrastructure/filesystem/ProjectScaffolder';

export function registerMigrationCommands(program: Command): void {
  program
    .command('migration')
    .description('Gestión de migraciones estructurales')
    .command('create <project> <name>')
    .description('Crea un nuevo archivo de migración estructural')
    .action((project: string, name: string) => {
      const config = loadConfigOrExit(project);
      const filePath = scaffoldMigration(config.migrations.path, name, config.database.driver, 'migrations');
      console.log(chalk.green(`Migración creada: ${filePath}`));
    });
}
