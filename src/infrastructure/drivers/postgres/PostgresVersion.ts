import { DriverCapabilities } from '../../../domain/Driver';

/**
 * Matriz de features conocidas por versión de PostgreSQL. Se usa tanto para
 * `capabilities()` (qué puede hacer el driver) como para validar `requires.postgres.feature`
 * declarado por una migración.
 */
const FEATURES_BY_MAJOR: Record<number, string[]> = {
  9: ['advisoryLocks', 'transactions', 'schemas'],
  10: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning'],
  11: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures'],
  12: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns'],
  13: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns'],
  14: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns', 'multirange'],
  15: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns', 'multirange', 'mergeStatement'],
  16: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns', 'multirange', 'mergeStatement'],
  17: ['advisoryLocks', 'transactions', 'schemas', 'declarativePartitioning', 'storedProcedures', 'generatedColumns', 'multirange', 'mergeStatement', 'incrementalSort'],
};

export function majorVersionOf(detectedOrConfigured: string): number {
  const match = detectedOrConfigured.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export class PostgresCapabilities implements DriverCapabilities {
  readonly supportsTransactions = true;
  readonly supportsSchemas = true;
  readonly supportsAdvisoryLocks = true;
  readonly supportsRollback = true;

  constructor(private readonly version: string) {}

  supportsFeature(feature: string): boolean {
    const major = majorVersionOf(this.version);
    const features = FEATURES_BY_MAJOR[major] ?? FEATURES_BY_MAJOR[17];
    return features.includes(feature);
  }
}
