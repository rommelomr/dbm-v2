export type EngineName = 'postgres' | 'mongo';

export interface PostgresConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface MongoConnection {
  uri: string;
  database: string;
}

export interface DatabaseConfig {
  driver: EngineName;
  /** Versión configurada, ej "17", "13", "8". */
  version: string;
  connection: PostgresConnection | MongoConnection;
  /** Solo relevante para postgres. */
  schema?: string;
  /** Política ante discrepancia entre versión configurada y detectada. */
  onVersionMismatch?: 'error' | 'warn' | 'ignore';
}

export interface PathsConfig {
  path: string;
}

export interface ProjectConfig {
  project: string;
  database: DatabaseConfig;
  migrations: PathsConfig;
  data: PathsConfig;
  seeds: PathsConfig;
  /** Ruta del archivo dbm.yaml de origen, y su directorio raíz. */
  configFilePath: string;
  rootDir: string;
}
