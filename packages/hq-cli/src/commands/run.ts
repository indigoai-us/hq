import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { internal } from 'varlock';
import { ensureCognitoToken } from '../utils/cognito-session.js';
import { vaultApiFetch, getCompanyUid } from '../utils/vault-api.js';
import { discoverSchemas } from '../run/discover-schemas.js';
import { installHqPlugin, prewarmHqSecrets, type PluginState, type InstallHqPluginOpts } from '../run/hq-plugin.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Load secrets from .env.schema and run a command with them injected')
    .option('--company <slug>', 'Company slug (overrides @hqCompany in schema)')
    .option('--schema <path>', 'Explicit schema path (skips walk-up discovery)')
    .option('--check', 'Resolve schema and validate vars without executing the command')
    .allowUnknownOption(true)
    .action(async (opts: { company?: string; schema?: string; check?: boolean }) => {
      try {
        const dashIndex = process.argv.indexOf('--');
        const childArgs = dashIndex !== -1 ? process.argv.slice(dashIndex + 1) : [];

        if (!opts.check && childArgs.length === 0) {
          throw new Error('no command specified. Usage: hq run [options] -- <command> [args...]');
        }

        let schemaPaths: string[];
        let envLocalPaths: string[];
        let schemaCompanySlug: string | null;

        if (opts.schema) {
          const schemaAbs = path.resolve(opts.schema);
          schemaPaths = [schemaAbs];
          const localPath = path.join(path.dirname(schemaAbs), '.env.local');
          envLocalPaths = fs.existsSync(localPath) ? [localPath] : [];
          const content = fs.readFileSync(schemaAbs, 'utf8');
          const m = /^# @hqCompany\("([^"]+)"\)/m.exec(content);
          schemaCompanySlug = m ? m[1] : null;
        } else {
          const discovered = discoverSchemas(process.cwd());
          if (discovered.conflict) {
            throw new Error(
              `conflicting @hqCompany slugs: "${discovered.conflict.slugs[0]}" in ${discovered.conflict.paths[0]} vs "${discovered.conflict.slugs[1]}" in ${discovered.conflict.paths[1]}. Use --company <slug> to override.`,
            );
          }
          if (discovered.schemaPaths.length === 0) {
            throw new Error('no .env.schema found. Create one or use --schema <path>.');
          }
          schemaPaths = discovered.schemaPaths;
          envLocalPaths = discovered.envLocalPaths;
          schemaCompanySlug = discovered.companySlug;
        }

        const slug = opts.company ?? schemaCompanySlug;
        if (!slug) {
          throw new Error('company slug not set. Add # @hqCompany("slug") to your .env.schema or pass --company <slug>.');
        }

        const token = await ensureCognitoToken();
        const uid = await getCompanyUid(token, slug);

        const fetchBatch: InstallHqPluginOpts['fetchBatch'] = async (companyUid, names) => {
          const res = await vaultApiFetch({
            token,
            path: `/secrets/${encodeURIComponent(companyUid)}/load`,
            method: 'POST',
            body: { names },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({})) as Record<string, string>;
            throw new Error(`Failed to batch-load secrets: ${body.error ?? res.statusText}`);
          }
          return res.json() as Promise<{
            secrets: Array<{ name: string; value: string }>;
            errors: Array<{ name: string; code: string; message?: string }>;
          }>;
        };

        const pluginOpts: InstallHqPluginOpts = {
          companyOverride: opts.company,
          resolveCompanyUid: async () => uid,
          fetchBatch,
        };

        // LAST entry = highest precedence; .env.local files trail .env.schema files so any .env.local beats any schema regardless of depth.
        const paths = [...schemaPaths, ...envLocalPaths];

        let state!: PluginState;
        const graph = await internal.loadEnvGraph({
          entryFilePaths: paths,
          afterInit: async (g) => { state = installHqPlugin(g, pluginOpts); },
        });
        await prewarmHqSecrets(graph, pluginOpts, state);
        await graph.resolveEnvValues();

        const schemaErrors = Object.entries(graph.configSchema as Record<string, any>)
          .filter(([, item]) => (item.errors as unknown[])?.length > 0);
        if (schemaErrors.length > 0) {
          const msgs = schemaErrors.flatMap(([k, item]) =>
            (item.errors as Array<{ message?: string }>).map((e) => `  ${k}: ${e.message ?? String(e)}`),
          );
          process.stderr.write(`Error: failed to resolve env vars:\n${msgs.join('\n')}\n`);
          process.exit(1);
        }

        const resolvedEnv = graph.getResolvedEnvObject() as Record<string, string>;
        const varCount = Object.keys(resolvedEnv).length;
        process.stderr.write(`Loaded ${varCount} env vars from .env.schema (company: ${slug})\n`);

        if (opts.check) {
          process.exit(0);
        }

        const [childCmd, ...restArgs] = childArgs;
        const child = spawn(childCmd, restArgs, {
          stdio: 'inherit',
          env: { ...process.env, ...resolvedEnv },
        });

        child.on('error', (err) => {
          process.stderr.write(`Error: failed to start command '${childCmd}': ${err.message}\n`);
          process.exit(1);
        });

        child.on('close', (code, signal) => {
          if (signal) {
            process.kill(process.pid, signal);
          }
          process.exit(code ?? 1);
        });
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });
}
