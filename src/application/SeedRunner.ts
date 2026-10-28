import { Driver } from '../domain/Driver';
import { Migration } from '../domain/Migration';
import { MigrationHistoryService } from './MigrationHistoryService';
import { executeChanges, RunOptions, RunSummary } from './internal/executeChanges';
import { DbmError, ExitCode } from '../domain/Project';

/**
 * Los seeds son independientes de las migraciones (sección 9): no forman parte
 * obligatoriamente del historial estructural y pueden re-ejecutarse cuando están
 * diseñados para ello (idempotentes). También respetan restricciones de entorno
 * (p.ej. seeds de "development" nunca deben correr contra "production").
 */
export class SeedRunner {
  constructor(private readonly driver: Driver, private readonly history: MigrationHistoryService) {}

  async run(seeds: Migration[], detectedVersion: string, options: RunOptions & { allowRerun: boolean }): Promise<RunSummary> {
    const onlySeeds = seeds.filter((m) => m.kind === 'seed');

    for (const seed of onlySeeds) {
      if (
        options.environment === 'production' &&
        (!seed.environments || seed.environments.includes('development') || seed.environments.includes('test'))
      ) {
        throw new DbmError(
          `El seed ${seed.version}_${seed.name} está marcado para development/test y no puede ejecutarse contra production. ` +
            `Muévelo a seeds/production/ si realmente debe existir en ese entorno.`,
          ExitCode.InvalidConfiguration,
        );
      }
    }

    return executeChanges(this.driver, this.history, onlySeeds, detectedVersion, options);
  }
}
