import { Driver } from '../../domain/Driver';
import { EngineName } from '../../domain/DatabaseConfig';
import { PostgresDriver } from './postgres/PostgresDriver';
import { MongoDriver } from './mongo/MongoDriver';
import { DbmError, ExitCode } from '../../domain/Project';

/**
 * Agregar un nuevo motor (sección 27, "Extensible") significa: crear su carpeta
 * en infrastructure/drivers/<engine>/ implementando Driver, y añadir una línea aquí.
 * El núcleo (application/*) no cambia.
 */
export function createDriver(engine: EngineName): Driver {
  switch (engine) {
    case 'postgres':
      return new PostgresDriver();
    case 'mongo':
      return new MongoDriver();
    default:
      throw new DbmError(`Motor no soportado: ${engine}`, ExitCode.InvalidConfiguration);
  }
}
