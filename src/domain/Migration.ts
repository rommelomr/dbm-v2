export type MigrationKind = 'migration' | 'data' | 'seed';

export interface EngineRequirement {
  minVersion?: string;
  maxVersion?: string;
  /** Nombre de feature declarado por el driver, p.ej. "advisoryLocks" o "changeStreams". */
  feature?: string;
}

export interface MigrationRequirements {
  postgres?: EngineRequirement;
  mongo?: EngineRequirement;
  [engine: string]: EngineRequirement | undefined;
}

/**
 * Representación agnóstica de un cambio versionado: puede ser una migración
 * estructural, un cambio de datos, o un seed. El contenido real (SQL, TS module,
 * etc.) vive en `filePath` y es el driver quien sabe interpretarlo.
 */
export interface Migration {
  /** Prefijo numérico/versión, único dentro del proyecto para ese kind. Ej: "004". */
  version: string;
  /** Nombre descriptivo, ej: "add_capacity". */
  name: string;
  kind: MigrationKind;
  /** Ruta absoluta al archivo fuente (.sql, .ts, .js). */
  filePath: string;
  /** Checksum calculado del contenido en disco al momento de resolver. */
  checksum: string;
  /** Si la migración declara explícitamente que no tiene "down" fiable. */
  irreversible: boolean;
  /** Restricciones de compatibilidad de motor/versión declaradas en frontmatter/metadata. */
  requires?: MigrationRequirements;
  /** Entornos permitidos (solo relevante para seeds). Vacío = todos. */
  environments?: string[];
}
