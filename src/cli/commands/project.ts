import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { listProjects } from '../../infrastructure/configuration/ConfigLoader';
import { scaffoldProject } from '../../infrastructure/filesystem/ProjectScaffolder';
import { EngineName } from '../../domain/DatabaseConfig';
import { fail } from './_shared';

export function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Gestión de proyectos');

  project
    .command('list')
    .description('Lista los proyectos detectados en el directorio actual')
    .action(() => {
      const projects = listProjects();
      if (projects.length === 0) {
        console.log('No se encontraron proyectos (ningún dbm.yaml en subdirectorios).');
        return;
      }
      const table = new Table({ head: ['Proyecto', 'Configuración'] });
      for (const p of projects) table.push([p.name, p.configFilePath]);
      console.log(table.toString());
    });

  project
    .command('create <name>')
    .description('Crea la estructura de un nuevo proyecto (migrations/data/seeds + dbm.yaml)')
    .option('--driver <driver>', 'Motor de base de datos (postgres | mongo)', 'postgres')
    .action((name: string, opts: { driver: string }) => {
      const driver = opts.driver as EngineName;
      if (driver !== 'postgres' && driver !== 'mongo') {
        fail(`Motor desconocido "${opts.driver}". Usa "postgres" o "mongo".`);
      }
      try {
        const dir = scaffoldProject(name, driver);
        console.log(chalk.green(`Proyecto "${name}" creado en ${dir}`));
        console.log(`Edita ${dir}/dbm.yaml para configurar la conexión.`);
      } catch (err) {
        fail((err as Error).message);
      }
    });
}
