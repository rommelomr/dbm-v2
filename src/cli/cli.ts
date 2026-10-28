#!/usr/bin/env node
import { Command } from 'commander';
import { registerProjectCommands } from './commands/project';
import { registerMigrationCommands } from './commands/migration';
import { registerDataCommands } from './commands/data';
import { registerSeedCommands } from './commands/seed';
import { registerMigrateCommand } from './commands/migrate';
import { registerRollbackCommand } from './commands/rollback';
import { registerStatusCommand } from './commands/status';
import { registerValidateCommand } from './commands/validate';
import { registerDatabaseCommands } from './commands/databaseVersion';

const program = new Command();

program
  .name('dbm')
  .description('Database Migration Manager — CLI para gestionar migraciones, cambios de datos y seeds de múltiples proyectos y motores.')
  .version('0.1.0');

registerProjectCommands(program);
registerMigrationCommands(program);
registerDataCommands(program);
registerSeedCommands(program);
registerMigrateCommand(program);
registerRollbackCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerDatabaseCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
