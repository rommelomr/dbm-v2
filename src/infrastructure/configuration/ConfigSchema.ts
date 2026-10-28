import { z } from 'zod';

// host/username/uri se permiten vacíos aquí a propósito: cuando vienen de
// ${DB_HOST}/${DB_USER}/etc. y esas variables de entorno no están definidas
// (p.ej. al correr comandos de scaffolding que no conectan de verdad), el
// archivo sigue siendo "válido" — la falta de credenciales solo debe fallar
// al intentar conectar realmente, no al leer la configuración.
const postgresConnectionSchema = z.object({
  host: z.string().default(''),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1),
  username: z.string().default(''),
  password: z.string().default(''),
  ssl: z.boolean().optional(),
});

const mongoConnectionSchema = z.object({
  uri: z.string().default(''),
  database: z.string().min(1),
});

const databaseSchema = z.discriminatedUnion('driver', [
  z.object({
    driver: z.literal('postgres'),
    version: z.union([z.string(), z.number()]).transform(String),
    connection: postgresConnectionSchema,
    schema: z.string().optional(),
    onVersionMismatch: z.enum(['error', 'warn', 'ignore']).optional().default('error'),
  }),
  z.object({
    driver: z.literal('mongo'),
    version: z.union([z.string(), z.number()]).transform(String),
    connection: mongoConnectionSchema,
    onVersionMismatch: z.enum(['error', 'warn', 'ignore']).optional().default('error'),
  }),
]);

const pathsSchema = z.object({
  path: z.string().min(1),
});

export const projectConfigFileSchema = z.object({
  project: z.string().min(1),
  database: databaseSchema,
  migrations: pathsSchema.default({ path: './migrations' }),
  data: pathsSchema.default({ path: './data' }),
  seeds: pathsSchema.default({ path: './seeds' }),
});

export type ProjectConfigFile = z.infer<typeof projectConfigFileSchema>;
