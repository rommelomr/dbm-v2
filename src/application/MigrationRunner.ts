import { Driver } from '../domain/Driver';
import { Migration } from '../domain/Migration';
import { MigrationHistoryService } from './MigrationHistoryService';
import { executeChanges, RunOptions, RunSummary } from './internal/executeChanges';

/**
 * Responsable únicamente de migraciones estructurales (CREATE TABLE, ALTER TABLE,
 * CREATE INDEX, CREATE COLLECTION, ...). Nunca toca datos existentes: eso es
 * responsabilidad de DataMigrationRunner.
 */
export class MigrationRunner {
  constructor(private readonly driver: Driver, private readonly history: MigrationHistoryService) {}

  async run(migrations: Migration[], detectedVersion: string, options: RunOptions): Promise<RunSummary> {
    const structural = migrations.filter((m) => m.kind === 'migration');
    await this.history.verifyChecksums(structural);
    return executeChanges(this.driver, this.history, structural, detectedVersion, options);
  }
}
