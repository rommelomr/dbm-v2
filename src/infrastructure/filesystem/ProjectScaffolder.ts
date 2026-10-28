import * as fs from 'fs';
import * as path from 'path';
import { EngineName } from '../../domain/DatabaseConfig';
import { DbmError, ExitCode } from '../../domain/Project';

function postgresTemplate(project: string): string {
  return `project: ${project}

database:
  driver: postgres
  version: 17

  connection:
    host: \${DB_HOST}
    port: 5432
    database: ${project}
    username: \${DB_USER}
    password: \${DB_PASSWORD}

  schema: ${project}

migrations:
  path: ./migrations

data:
  path: ./data

seeds:
  path: ./seeds
`;
}

function mongoTemplate(project: string): string {
  return `project: ${project}

database:
  driver: mongo
  version: 8

  connection:
    uri: \${MONGO_URI}
    database: ${project}

migrations:
  path: ./migrations

data:
  path: ./data

seeds:
  path: ./seeds
`;
}

function postgresEnvTemplate(): string {
  return `# Variables usadas por dbm.yaml (DB_HOST, DB_USER, DB_PASSWORD).
# Este archivo se carga automáticamente por dbm al estar junto al dbm.yaml.
# NO lo subas a git (ya está en .gitignore).
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
`;
}

function mongoEnvTemplate(): string {
  return `# Variables usadas por dbm.yaml (MONGO_URI).
# Este archivo se carga automáticamente por dbm al estar junto al dbm.yaml.
# NO lo subas a git (ya está en .gitignore).
MONGO_URI=mongodb://localhost:27017
`;
}

export function scaffoldProject(name: string, engine: EngineName, rootDir = process.cwd()): string {
  const projectDir = path.join(rootDir, name);
  if (fs.existsSync(projectDir)) {
    throw new DbmError(`El directorio ${projectDir} ya existe.`, ExitCode.InvalidConfiguration);
  }

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'migrations'));
  fs.mkdirSync(path.join(projectDir, 'data'));
  fs.mkdirSync(path.join(projectDir, 'seeds', 'development'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'seeds', 'test'), { recursive: true });

  const yamlContent = engine === 'postgres' ? postgresTemplate(name) : mongoTemplate(name);
  fs.writeFileSync(path.join(projectDir, 'dbm.yaml'), yamlContent, 'utf8');

  const envContent = engine === 'postgres' ? postgresEnvTemplate() : mongoEnvTemplate();
  fs.writeFileSync(path.join(projectDir, '.env'), envContent, 'utf8');

  fs.writeFileSync(path.join(projectDir, '.gitignore'), '.env\n', 'utf8');

  return projectDir;
}

function nextVersion(dir: string): string {
  if (!fs.existsSync(dir)) return '001';
  const versions = fs
    .readdirSync(dir)
    .map((f) => f.match(/^(\d+)_/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10));
  const next = (versions.length > 0 ? Math.max(...versions) : 0) + 1;
  return String(next).padStart(3, '0');
}

export function scaffoldMigration(
  migrationsDir: string,
  name: string,
  engine: EngineName,
  kind: 'migrations' | 'data',
): string {
  fs.mkdirSync(migrationsDir, { recursive: true });
  const version = nextVersion(migrationsDir);
  const ext = engine === 'postgres' ? 'sql' : 'ts';
  const fileName = `${version}_${name}.${ext}`;
  const filePath = path.join(migrationsDir, fileName);

  const content =
    engine === 'postgres'
      ? `-- dbm:meta\n-- irreversible: false\n-- dbm:end\n\n-- ${kind === 'migrations' ? 'Migración estructural' : 'Migración de datos'}: ${name}\n-- Escribe aquí el SQL de "up".\n-- Si es reversible, crea también ${version}_${name}.down.sql\n`
      : `// dbm:meta\n// irreversible: false\n// dbm:end\n\nimport { Db } from 'mongodb';\n\nexport async function up(db: Db) {\n  // TODO: implementar ${name}\n}\n\nexport async function down(db: Db) {\n  // TODO: revertir ${name}\n}\n`;

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function scaffoldSeed(seedsDir: string, name: string, engine: EngineName, environment: string): string {
  const envDir = path.join(seedsDir, environment);
  fs.mkdirSync(envDir, { recursive: true });
  const version = nextVersion(envDir);
  const ext = engine === 'postgres' ? 'sql' : 'ts';
  const fileName = `${version}_${name}.${ext}`;
  const filePath = path.join(envDir, fileName);

  const content =
    engine === 'postgres'
      ? `-- Seed (${environment}): ${name}\n-- Diseña este seed para ser idempotente si se re-ejecutará.\n`
      : `import { Db } from 'mongodb';\n\nexport async function up(db: Db) {\n  // Seed (${environment}): ${name}\n}\n`;

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
