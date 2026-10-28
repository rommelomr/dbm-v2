import { Command } from 'commander';
import chalk from 'chalk';
import { loadProjectConfig } from '../../infrastructure/configuration/ConfigLoader';
import { createDriver } from '../../infrastructure/drivers/DriverFactory';
import { MigrationResolver } from '../../application/MigrationResolver';
import { ChecksumService } from '../../application/ChecksumService';
import * as fs from 'fs';
import { DbmError, ExitCode } from '../../domain/Project';

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate <project>')
    .description('Valida configuración, conexión, versión, numeración, checksums e historial')
    .action(async (project: string) => {
      const results: CheckResult[] = [];
      let exitCode = ExitCode.Success;

      // 1. Configuration
      let config;
      try {
        config = loadProjectConfig(project);
        results.push({ label: 'Configuration', ok: true });
      } catch (err) {
        results.push({ label: 'Configuration', ok: false, detail: (err as Error).message });
        printResults(results);
        process.exit(ExitCode.InvalidConfiguration);
      }

      const driver = createDriver(config.database.driver);

      // 2. Database connection
      try {
        await driver.connect(config.database);
        results.push({ label: 'Database connection', ok: true });
      } catch (err) {
        results.push({ label: 'Database connection', ok: false, detail: (err as Error).message });
        printResults(results);
        process.exit(ExitCode.GenericError);
      }

      // 3. Database engine (siempre ok si conectó con el driver esperado)
      results.push({ label: 'Database engine', ok: true, detail: config.database.driver });

      // 4. Database version
      try {
        const versionCheck = await driver.checkVersion(config.database.version);
        if (versionCheck.compatible) {
          results.push({ label: 'Database version', ok: true, detail: `configured ${versionCheck.configured} / detected ${versionCheck.detected}` });
        } else {
          results.push({ label: 'Database version', ok: false, detail: `configured ${versionCheck.configured} / detected ${versionCheck.detected}` });
          exitCode = ExitCode.VersionIncompatibility;
        }
      } catch (err) {
        results.push({ label: 'Database version', ok: false, detail: (err as Error).message });
        exitCode = ExitCode.VersionIncompatibility;
      }

      // 5, 6. Migration numbering + Duplicate migrations (el resolver lanza en duplicados)
      let migrations: import('../../domain/Migration').Migration[];
      let data: import('../../domain/Migration').Migration[];
      let seeds: import('../../domain/Migration').Migration[];
      try {
        migrations = MigrationResolver.resolveDirectory(config.migrations.path, 'migration');
        data = MigrationResolver.resolveDirectory(config.data.path, 'data');
        seeds = MigrationResolver.resolveDirectory(config.seeds.path, 'seed');
        results.push({ label: 'Migration numbering', ok: true });
        results.push({ label: 'Duplicate migrations', ok: true });
      } catch (err) {
        results.push({ label: 'Migration numbering', ok: false, detail: (err as Error).message });
        results.push({ label: 'Duplicate migrations', ok: false });
        migrations = [];
        data = [];
        seeds = [];
        exitCode = ExitCode.InvalidConfiguration;
      }

      // 7. Checksums (contra el historial ya registrado)
      try {
        await driver.ensureInfrastructure();
        const history = await driver.getHistory();
        const historyMap = new Map(history.map((h) => [`${h.type}:${h.version}`, h]));
        let checksumOk = true;
        let mismatchDetail = '';
        for (const m of [...migrations, ...data]) {
          const record = historyMap.get(`${m.kind}:${m.version}`);
          if (record && record.checksum !== m.checksum) {
            checksumOk = false;
            mismatchDetail = `${m.version}_${m.name}`;
            break;
          }
        }
        results.push({ label: 'Checksums', ok: checksumOk, detail: checksumOk ? undefined : `modified: ${mismatchDetail}` });
        if (!checksumOk) exitCode = ExitCode.InvalidChecksum;

        // 8. Migration history (coherencia: todo lo ejecutado existe en disco)
        let historyOk = true;
        let missingDetail = '';
        const onDisk = new Set([...migrations, ...data].map((m) => `${m.kind}:${m.version}`));
        for (const h of history) {
          if (h.type !== 'seed' && !onDisk.has(`${h.type}:${h.version}`)) {
            historyOk = false;
            missingDetail = `${h.type} ${h.version}_${h.name}`;
            break;
          }
        }
        results.push({ label: 'Migration history', ok: historyOk, detail: historyOk ? undefined : `missing on disk: ${missingDetail}` });
        if (!historyOk) exitCode = ExitCode.GenericError;
      } catch (err) {
        results.push({ label: 'Checksums', ok: false, detail: (err as Error).message });
        results.push({ label: 'Migration history', ok: false });
        exitCode = ExitCode.GenericError;
      }

      // 9. Driver compatibility (requires declarados vs versión detectada)
      try {
        const detected = await driver.detectVersion();
        const caps = driver.capabilities(detected);
        let compatOk = true;
        let detail = '';
        for (const m of [...migrations, ...data]) {
          const req = m.requires?.[config.database.driver];
          if (req?.feature && !caps.supportsFeature(req.feature)) {
            compatOk = false;
            detail = `${m.version}_${m.name} requiere feature "${req.feature}" no disponible en ${detected}`;
            break;
          }
        }
        results.push({ label: 'Driver compatibility', ok: compatOk, detail: compatOk ? undefined : detail });
        if (!compatOk) exitCode = ExitCode.VersionIncompatibility;
      } catch (err) {
        results.push({ label: 'Driver compatibility', ok: false, detail: (err as Error).message });
      }

      await driver.disconnect().catch(() => undefined);
      printResults(results);
      process.exit(exitCode);
    });
}

function printResults(results: CheckResult[]): void {
  console.log('');
  for (const r of results) {
    const mark = r.ok ? chalk.green('✓') : chalk.red('✗');
    const detail = r.detail ? chalk.gray(` — ${r.detail}`) : '';
    console.log(`${mark} ${r.label}${detail}`);
  }
  console.log('');
}
