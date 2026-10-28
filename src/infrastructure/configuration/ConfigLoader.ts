import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';
import { projectConfigFileSchema } from './ConfigSchema';
import { ProjectConfig } from '../../domain/DatabaseConfig';
import { DbmError } from '../../domain/Project';
import { ExitCode } from '../../domain/Project';

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/**
 * Sustituye recursivamente `${VAR}` por process.env.VAR. Las credenciales nunca
 * quedan obligatoriamente en el archivo: si la variable no está definida, se deja
 * un string vacío y se advierte más adelante en `validate`.
 */
function expandEnvVars<T>(node: T): T {
  if (typeof node === 'string') {
    return node.replace(ENV_VAR_PATTERN, (_, name) => process.env[name] ?? '') as unknown as T;
  }
  if (Array.isArray(node)) {
    return node.map((item) => expandEnvVars(item)) as unknown as T;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = expandEnvVars(v);
    }
    return out as T;
  }
  return node;
}

export function findProjectConfigPath(projectNameOrPath: string, searchRoot = process.cwd()): string {
  // 1) ¿Es una ruta directa a un dbm.yaml o a un directorio que lo contiene?
  const direct = path.resolve(projectNameOrPath);
  if (fs.existsSync(direct)) {
    const stat = fs.statSync(direct);
    if (stat.isFile()) return direct;
    if (stat.isDirectory()) {
      const candidate = path.join(direct, 'dbm.yaml');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 2) Buscar en subdirectorios inmediatos de searchRoot un dbm.yaml cuyo `project` coincida.
  const entries = fs.existsSync(searchRoot) ? fs.readdirSync(searchRoot, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(searchRoot, entry.name, 'dbm.yaml');
    if (fs.existsSync(candidate)) {
      try {
        const raw = yaml.load(fs.readFileSync(candidate, 'utf8')) as { project?: string };
        if (raw?.project === projectNameOrPath || entry.name === projectNameOrPath) {
          return candidate;
        }
      } catch {
        // ignore malformed neighbors while searching
      }
    }
  }

  // 3) ¿Hay un dbm.yaml en el propio cwd?
  const cwdCandidate = path.join(searchRoot, 'dbm.yaml');
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;

  throw new DbmError(
    `No se encontró un proyecto llamado "${projectNameOrPath}". Se esperaba un dbm.yaml en ./${projectNameOrPath}/dbm.yaml o en el directorio actual.`,
    ExitCode.InvalidConfiguration,
  );
}

/**
 * Carga, si existe, el archivo `.env` ubicado junto al `dbm.yaml` del proyecto
 * (mismo directorio raíz). Nunca pisa variables ya definidas en el entorno real
 * (comportamiento por defecto de dotenv): una variable exportada manualmente, o
 * inyectada por CI/CD, siempre gana sobre lo que haya en el `.env` del proyecto.
 */
function loadProjectDotEnv(rootDir: string): void {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function loadProjectConfig(projectNameOrPath: string, searchRoot = process.cwd()): ProjectConfig {
  const configFilePath = findProjectConfigPath(projectNameOrPath, searchRoot);
  const rootDir = path.dirname(configFilePath);

  loadProjectDotEnv(rootDir);

  let rawYaml: unknown;
  try {
    rawYaml = yaml.load(fs.readFileSync(configFilePath, 'utf8'));
  } catch (err) {
    throw new DbmError(
      `El archivo de configuración ${configFilePath} no es YAML válido: ${(err as Error).message}`,
      ExitCode.InvalidConfiguration,
    );
  }

  const expanded = expandEnvVars(rawYaml);
  const parsed = projectConfigFileSchema.safeParse(expanded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new DbmError(
      `Configuración inválida en ${configFilePath}:\n${issues}`,
      ExitCode.InvalidConfiguration,
    );
  }

  const data = parsed.data;

  const resolvePath = (p: string) => (path.isAbsolute(p) ? p : path.resolve(rootDir, p));

  return {
    project: data.project,
    database: data.database,
    migrations: { path: resolvePath(data.migrations.path) },
    data: { path: resolvePath(data.data.path) },
    seeds: { path: resolvePath(data.seeds.path) },
    configFilePath,
    rootDir,
  };
}

export function listProjects(searchRoot = process.cwd()): { name: string; configFilePath: string }[] {
  if (!fs.existsSync(searchRoot)) return [];
  const results: { name: string; configFilePath: string }[] = [];
  for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(searchRoot, entry.name, 'dbm.yaml');
    if (fs.existsSync(candidate)) {
      try {
        const raw = yaml.load(fs.readFileSync(candidate, 'utf8')) as { project?: string };
        results.push({ name: raw?.project ?? entry.name, configFilePath: candidate });
      } catch {
        // skip malformed
      }
    }
  }
  return results;
}
