import { MigrationKind } from './Migration';

/**
 * Fila de historial. Nunca es global: siempre pertenece a un proyecto/base concreto,
 * y ese aislamiento lo garantiza el driver (tabla/colección propia por proyecto).
 */
export interface MigrationRecord {
  version: string;
  name: string;
  type: MigrationKind;
  checksum: string;
  executedAt: Date;
  /** Tiempo de ejecución en milisegundos. */
  executionTime: number;
  environment: string;
}
