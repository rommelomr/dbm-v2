import { DriverCapabilities } from '../../../domain/Driver';

const FEATURES_BY_MAJOR: Record<number, string[]> = {
  4: ['changeStreams', 'multiDocumentTransactions'],
  5: ['changeStreams', 'multiDocumentTransactions', 'timeSeriesCollections'],
  6: ['changeStreams', 'multiDocumentTransactions', 'timeSeriesCollections', 'clusteredCollections'],
  7: ['changeStreams', 'multiDocumentTransactions', 'timeSeriesCollections', 'clusteredCollections', 'queryableEncryption'],
  8: ['changeStreams', 'multiDocumentTransactions', 'timeSeriesCollections', 'clusteredCollections', 'queryableEncryption'],
};

export function majorVersionOf(detectedOrConfigured: string): number {
  const match = detectedOrConfigured.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * MongoDB solo soporta transacciones multi-documento en despliegues replica-set /
 * sharded, no en standalone. `transactionsAvailable` se determina en tiempo real
 * al conectar (ver MongoDriver.connect) y se combina aquí con la versión.
 */
export class MongoCapabilities implements DriverCapabilities {
  readonly supportsSchemas = false;
  readonly supportsAdvisoryLocks = false; // Mongo usa locking propio vía colección dbm_locks.
  readonly supportsRollback = true;

  constructor(private readonly version: string, private readonly transactionsAvailable: boolean) {}

  get supportsTransactions(): boolean {
    return this.transactionsAvailable && majorVersionOf(this.version) >= 4;
  }

  supportsFeature(feature: string): boolean {
    const major = majorVersionOf(this.version);
    const features = FEATURES_BY_MAJOR[major] ?? FEATURES_BY_MAJOR[8];
    return features.includes(feature);
  }
}
