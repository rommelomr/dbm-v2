import { Driver } from '../domain/Driver';
import { Migration, MigrationKind } from '../domain/Migration';
import { MigrationRecord } from '../domain/MigrationRecord';
import { DbmError, ExitCode } from '../domain/Project';

export class MigrationHistoryService {
  constructor(private readonly driver: Driver) {}

  async getExecutedKeys(kind?: MigrationKind): Promise<Set<string>> {
    const history = await this.driver.getHistory(kind);
    return new Set(history.map((h) => `${h.type}:${h.version}`));
  }

  async getHistoryMap(kind?: MigrationKind): Promise<Map<string, MigrationRecord>> {
    const history = await this.driver.getHistory(kind);
    const map = new Map<string, MigrationRecord>();
    for (const record of history) {
      map.set(`${record.type}:${record.version}`, record);
    }
    return map;
  }

  /**
   * Sección 11: si un archivo ya ejecutado fue modificado en disco, el checksum
   * no coincide y la ejecución debe detenerse (por defecto).
   */
  async verifyChecksums(migrations: Migration[]): Promise<void> {
    const historyMap = await this.getHistoryMap();
    for (const migration of migrations) {
      const key = `${migration.kind}:${migration.version}`;
      const record = historyMap.get(key);
      if (record && record.checksum !== migration.checksum) {
        throw new DbmError(
          [
            `Migration ${migration.version}_${migration.name} fue modificada después de haberse ejecutado.`,
            `Expected checksum: ${record.checksum}`,
            `Current checksum:  ${migration.checksum}`,
          ].join('\n'),
          ExitCode.InvalidChecksum,
        );
      }
    }
  }

  async record(record: MigrationRecord): Promise<void> {
    await this.driver.recordExecution(record);
  }
}
