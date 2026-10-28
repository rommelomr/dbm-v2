import { Driver } from '../domain/Driver';
import { Migration } from '../domain/Migration';
import { MigrationHistoryService } from './MigrationHistoryService';
import { executeChanges, RunOptions, RunSummary } from './internal/executeChanges';

/**
 * Responsable de transformaciones sobre datos ya existentes: inserts derivados,
 * updates, soft/hard deletes, normalizaciones. Forma parte del historial de
 * evolución de los datos de producción (sección 7), separado de las migraciones
 * estructurales y de los seeds.
 */
export class DataMigrationRunner {
  constructor(private readonly driver: Driver, private readonly history: MigrationHistoryService) {}

  async run(migrations: Migration[], detectedVersion: string, options: RunOptions): Promise<RunSummary> {
    const dataChanges = migrations.filter((m) => m.kind === 'data');
    await this.history.verifyChecksums(dataChanges);
    return executeChanges(this.driver, this.history, dataChanges, detectedVersion, options);
  }
}
