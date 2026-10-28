import { ProjectConfig } from './DatabaseConfig';

/**
 * Un proyecto tal como lo ve el núcleo: su configuración cargada y resuelta.
 * El núcleo nunca conoce detalles de PostgreSQL/Mongo directamente, solo a través
 * del Driver asociado a `config.database.driver`.
 */
export interface Project {
  name: string;
  config: ProjectConfig;
}

/** Códigos de salida estandarizados para uso en CI/CD (sección 25 del spec). */
export enum ExitCode {
  Success = 0,
  GenericError = 1,
  InvalidConfiguration = 2,
  VersionIncompatibility = 3,
  InvalidChecksum = 4,
  MigrationLock = 5,
}

export class DbmError extends Error {
  constructor(message: string, public readonly exitCode: ExitCode) {
    super(message);
    this.name = 'DbmError';
  }
}
