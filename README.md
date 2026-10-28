# dbm — Database Migration Manager

CLI independiente (Node.js + TypeScript) para gestionar la evolución de bases de
datos de múltiples proyectos y múltiples motores. **No es un ORM**: no gestiona
el acceso a datos de las aplicaciones, solo la evolución versionada de la base.

Implementa el spec completo: migraciones estructurales, migraciones de datos,
seeds, historial, checksums, inmutabilidad, rollback, transacciones, locks,
validación de compatibilidad de versión, entornos y códigos de salida para
CI/CD.

## Estado de este build

- **PostgreSQL**: implementado y **probado end-to-end** en este entorno contra
  un PostgreSQL 16 real — `validate`, `migrate`, `seed`, `status`, `rollback`,
  detección de checksum modificado, detección de incompatibilidad de versión y
  el lock de ejecución concurrente. Todo se comportó como describe el spec.
- **MongoDB**: implementado siguiendo la misma interfaz `Driver`. En este
  sandbox no fue posible instalar/levantar un `mongod` real (no está disponible
  en los repositorios accesibles), así que se verificó de forma estática: el
  resolver de migraciones, el parseo de metadata/`requires` y la carga+ejecución
  real de los módulos `.ts` de migración (vía `ts-node`, con un `db` simulado)
  funcionan correctamente. **Antes de usarlo en producción, pruébalo contra un
  MongoDB real** (`docker run -p 27017:27017 mongo:8`) — es el único punto que
  no se pudo confirmar contra un servidor vivo aquí.

## Instalación

```bash
npm install
npm run build
npm link   # opcional: expone el comando `dbm` globalmente
```

O sin `npm link`:

```bash
node dist/cli/cli.js <comando>
```

## Arquitectura

```
src/
├── cli/                  # Comandos (commander) — la única capa que conoce stdout/exit codes
├── application/          # Casos de uso: runners, resolver de archivos, historial
├── domain/                # Contratos agnósticos de motor: Driver, Migration, Project...
└── infrastructure/
    ├── drivers/
    │   ├── postgres/      # Implementación real para PostgreSQL (pg)
    │   └── mongo/         # Implementación real para MongoDB (mongodb)
    ├── configuration/     # Carga y valida dbm.yaml (zod + expansión de ${ENV_VARS})
    └── filesystem/        # Scaffolding de proyectos/migraciones/seeds
```

El núcleo (`application/`, `domain/`) **nunca** importa `pg` ni `mongodb`
directamente; solo conoce la interfaz `Driver`. Agregar un motor nuevo (p.ej.
MySQL) significa: crear `infrastructure/drivers/mysql/` implementando `Driver`,
y agregar una línea en `DriverFactory.ts`. Nada más cambia.

## Conceptos

```
Proyecto
 └── Database (driver + versión + conexión)
      ├── Migrations   → cambia la ESTRUCTURA (CREATE TABLE, CREATE INDEX...)
      ├── Data changes → transforma DATOS existentes (UPDATE, DELETE, normalizaciones)
      └── Seeds        → datos iniciales/de prueba, por entorno, re-ejecutables
```

Cada proyecto vive en su propia carpeta con un `dbm.yaml`:

```yaml
project: ubipark

database:
  driver: postgres        # o "mongo"
  version: 17             # versión configurada, se compara contra la real al conectar

  connection:
    host: ${DB_HOST}       # las credenciales se resuelven desde variables de entorno
    port: 5432
    database: ubipark
    username: ${DB_USER}
    password: ${DB_PASSWORD}

  schema: ubipark
  onVersionMismatch: error # error | warn | ignore

migrations:
  path: ./migrations
data:
  path: ./data
seeds:
  path: ./seeds
```

Mira `examples/ubipark` (PostgreSQL) y `examples/trainers` (MongoDB) para
proyectos completos y funcionales.

### Variables de entorno (`.env` automático)

`dbm project create` genera además un `.env` junto al `dbm.yaml`:

```
# miproyecto/.env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
```

Cualquier comando (`validate`, `migrate`, `status`, ...) carga automáticamente
ese `.env` **si existe en el mismo directorio que el `dbm.yaml`** — no hace
falta exportar nada a mano para desarrollo local. Reglas:

- Una variable ya exportada en el shell, o inyectada por tu CI/CD, **siempre
  gana** sobre lo que haya en el `.env` (comportamiento estándar de `dotenv`:
  nunca sobrescribe variables ya definidas).
- El `.env` se crea junto con un `.gitignore` local que lo excluye — nunca se
  sube al repositorio.
- Si el proyecto no tiene `.env`, todo sigue funcionando como antes: las
  variables deben venir del entorno real (export manual o CI/CD).

## Convenciones de archivos

- **Nombre**: `NNN_nombre_descriptivo.sql` (o `.ts`/`.js` para Mongo), versión
  numérica única dentro del directorio.
- **Reversibilidad**: para SQL, crea `NNN_nombre.down.sql` junto al `up` si es
  reversible; si no existe, la migración se considera irreversible
  automáticamente. Para Mongo, exporta `down(db)` además de `up(db)`.
- **Metadata opcional** (mismo formato en SQL y TS, con `--` o `//`):

  ```sql
  -- dbm:meta
  -- irreversible: true
  -- requires:
  --   postgres:
  --     minVersion: 15
  -- dbm:end
  ```

- **Seeds**: viven en subcarpetas por entorno (`seeds/development/`,
  `seeds/test/`, ...). Un seed en `development/` nunca corre contra
  `--env production`.

## Comandos

```bash
dbm project list
dbm project create <name> --driver postgres|mongo

dbm migration create <project> <name>      # migración estructural
dbm data create <project> <name>           # migración de datos
dbm seed create <project> <name> --env development

dbm migrate <project> [--env <env>] [--dry-run] [--non-interactive]
dbm rollback <project> [--steps N] [--env <env>]
dbm seed <project> [--env <env>] [--dry-run] [--rerun]

dbm status <project> [--env <env>]
dbm validate <project>
dbm database version <project>
```

## Códigos de salida (para CI/CD)

| Código | Significado                  |
|-------:|-------------------------------|
| 0      | Éxito                          |
| 1      | Error genérico                 |
| 2      | Configuración inválida         |
| 3      | Incompatibilidad de versión     |
| 4      | Checksum inválido (archivo modificado tras ejecutarse) |
| 5      | Migration lock (ejecución concurrente) |

```bash
dbm migrate ubipark --env production --non-interactive
```

## Ejemplo rápido (PostgreSQL)

```bash
export DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres
cd examples/ubipark
dbm validate ubipark
dbm migrate ubipark --env development
dbm seed ubipark --env development
dbm status ubipark
```

## Notas de diseño

- **Historial por proyecto, nunca global**: cada base tiene su propia tabla
  (`<schema>.dbm_history` en Postgres) o colección (`dbm_history` en Mongo).
- **Inmutabilidad**: una migración ejecutada no se edita; si necesitas
  corregirla, creas una nueva versión. Modificar una ya ejecutada rompe su
  checksum y `dbm migrate`/`dbm validate` lo detectan y detienen la ejecución.
- **Rollback respeta la barrera de irreversibilidad**: se revierte en orden
  cronológico inverso y se detiene (sin fingir éxito) en cuanto encuentra una
  migración marcada `irreversible`.
- **Locks**: en Postgres, `pg_advisory_lock` sobre un hash del nombre del
  proyecto. En Mongo, un documento único en `dbm_locks` con índice `unique`.
- **Soft delete vs hard delete**: la herramienta no impone una estrategia; cada
  migración de datos decide.
