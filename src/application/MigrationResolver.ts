import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Migration, MigrationKind, MigrationRequirements } from '../domain/Migration';
import { ChecksumService } from './ChecksumService';
import { DbmError, ExitCode } from '../domain/Project';

const FILENAME_PATTERN = /^(\d+)_([a-zA-Z0-9_\-]+)\.(sql|ts|js)$/;

/**
 * Bloque de metadata opcional embebido como comentario al inicio del archivo:
 *
 *   -- dbm:meta
 *   -- irreversible: true
 *   -- requires:
 *   --   postgres:
 *   --     minVersion: 15
 *   -- dbm:end
 *
 * Funciona igual para SQL (`--`) y para TS/JS (`//`), de modo que el resolver
 * nunca necesita ejecutar el archivo solo para leer sus requisitos.
 */
function parseMetadata(content: string): { irreversible: boolean; requires?: MigrationRequirements } {
  const metaBlock = content.match(/(?:--|\/\/) dbm:meta\r?\n([\s\S]*?)(?:--|\/\/) dbm:end/);
  if (!metaBlock) return { irreversible: false };

  const stripped = metaBlock[1]
    .split('\n')
    .map((line) => line.replace(/^\s*(--|\/\/)\s?/, ''))
    .join('\n');

  try {
    const parsed = (yaml.load(stripped) ?? {}) as { irreversible?: boolean; requires?: MigrationRequirements };
    return { irreversible: !!parsed.irreversible, requires: parsed.requires };
  } catch {
    return { irreversible: false };
  }
}

/** Para SQL: existe un archivo `NNN_name.down.sql` junto al up. Para TS/JS: se asume
 * reversible si exporta `down` (verificado en tiempo de ejecución por el driver);
 * aquí solo marcamos como potencialmente reversible salvo metadata en contra. */
function hasSqlDownFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  const downPath = filePath.slice(0, -ext.length) + '.down' + ext;
  return fs.existsSync(downPath);
}

export interface ResolveOptions {
  environment?: string;
}

export class MigrationResolver {
  static resolveDirectory(dir: string, kind: MigrationKind, opts: ResolveOptions = {}): Migration[] {
    if (!fs.existsSync(dir)) return [];

    const migrations: Migration[] = [];

    // El Set de versiones vistas se crea DENTRO de collectFrom (no compartido entre
    // llamadas): los seeds de "development" y de "test" pueden reutilizar el mismo
    // número de versión porque pertenecen a historiales de entorno independientes.
    // Para migrations/data, en cambio, solo hay una llamada a collectFrom en total,
    // así que la unicidad sigue siendo por proyecto.
    const collectFrom = (baseDir: string, environments: string[] | undefined) => {
      if (!fs.existsSync(baseDir)) return;
      const seen = new Set<string>();
      for (const fileName of fs.readdirSync(baseDir)) {
        const match = fileName.match(FILENAME_PATTERN);
        if (!match) continue;
        // Ignoramos archivos *.down.sql: son el complemento del up, no una migración propia.
        if (fileName.includes('.down.')) continue;

        const [, version, name, ext] = match;
        const filePath = path.join(baseDir, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const meta = parseMetadata(content);

        if (seen.has(version)) {
          throw new DbmError(
            `Versión de migración duplicada "${version}" (${kind}) en ${baseDir}. Cada migración debe tener una versión única dentro de ese directorio.`,
            ExitCode.InvalidConfiguration,
          );
        }
        seen.add(version);

        const irreversible = meta.irreversible || (ext === 'sql' && !hasSqlDownFile(filePath) && kind !== 'seed');

        migrations.push({
          version,
          name,
          kind,
          filePath,
          checksum: ChecksumService.compute(content),
          irreversible,
          requires: meta.requires,
          environments,
        });
      }
    };

    if (kind === 'seed') {
      // seeds/<environment>/NNN_name.ext
      const envDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
      if (envDirs.length === 0) {
        collectFrom(dir, undefined);
      } else {
        for (const envDir of envDirs) {
          if (opts.environment && envDir.name !== opts.environment) continue;
          collectFrom(path.join(dir, envDir.name), [envDir.name]);
        }
      }
    } else {
      collectFrom(dir, undefined);
    }

    return migrations.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  }

  /** Migraciones (migration + data) pendientes de aplicar, comparado contra el historial. */
  static pending(all: Migration[], executedVersions: Set<string>): Migration[] {
    return all.filter((m) => !executedVersions.has(`${m.kind}:${m.version}`));
  }
}
