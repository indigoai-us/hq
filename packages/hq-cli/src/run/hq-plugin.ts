import { ResolutionError } from 'varlock/plugin-lib';
import type { Resolver } from 'varlock/plugin-lib';
import { readCache, writeCache } from '../utils/secrets-cache.js';

export interface InstallHqPluginOpts {
  companyOverride?: string;
  resolveCompanyUid: (slug: string) => Promise<string>;
  fetchBatch: (uid: string, names: string[]) => Promise<{
    secrets: Array<{ name: string; value: string }>;
    errors: Array<{ name: string; code: string; message?: string }>;
  }>;
}

export interface PluginState {
  schemaCompanySlug: string | null;
  uid: string | null;
  errorsByName: Map<string, { code: string; message?: string }>;
}

export function installHqPlugin(graph: any /* EnvGraph */, opts: InstallHqPluginOpts) {
  const pluginState: PluginState = {
    schemaCompanySlug: null,
    uid: null,
    errorsByName: new Map(),
  };

  // varlock@1.0.0's plugin-lib.js omits the Resolver export (d.ts/JS mismatch);
  // extract it at runtime from any already-registered built-in resolver's prototype.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let RuntimeResolver: any;
  try {
    const fns = graph.registeredResolverFunctions as Record<string, unknown>;
    const first = Object.values(fns)[0];
    if (first == null) throw new Error('registeredResolverFunctions is empty');
    const proto = Object.getPrototypeOf(first) as { prototype?: { process?: unknown } } | null;
    if (proto == null || typeof proto.prototype?.process !== 'function') {
      throw new Error('prototype has no process method');
    }
    RuntimeResolver = proto;
  } catch (e) {
    throw new Error(
      'varlock Resolver base class extraction failed — the varlock@1.0.0 d.ts/JS mismatch ' +
      'may have been resolved; switch to `import { Resolver } from "varlock/plugin-lib"`. ' +
      `Underlying: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // HqResolver is declared INSIDE installHqPlugin so its static def.resolve
  // closes over `pluginState`. Module-scope declaration is forbidden — resolve()
  // would hit `ReferenceError: pluginState is not defined`.
  class HqResolver extends RuntimeResolver {
    static def = {
      name: 'hq',
      impliesSensitive: true,
      argsSchema: { type: 'array' as const, arrayMaxLength: 1 },
      resolve: async function (this: HqResolver) {
        // Cache-only read. `pluginState` is captured by this inner-class closure;
        // `prewarmHqSecrets(graph, opts, state)` populates `state.uid` and
        // `state.errorsByName` before `graph.resolveEnvValues()` calls us.
        const explicit = this.arrArgs?.[0]?.staticValue;
        const secretName = (typeof explicit === 'string' && explicit) ? explicit : this._ownerKey;
        if (!secretName) {
          throw new ResolutionError('hq() resolver could not determine secret name (missing owner key)');
        }
        const err = pluginState.errorsByName.get(secretName);
        if (err) {
          if (err.code === 'forbidden') {
            throw new ResolutionError(`No read permission for secret "${secretName}" — ask an admin to share it via \`hq secrets share ${secretName} --with <you> --permission read\``);
          }
          if (err.code === 'not_found') {
            throw new ResolutionError(`Secret "${secretName}" does not exist in company`);
          }
          throw new ResolutionError(`Failed to load secret "${secretName}": ${err.message ?? err.code}`);
        }
        // Sentinel-check style throughout: `readCache` returns `string | null`
        // (verified at `hq/packages/hq-cli/src/utils/secrets-cache.ts:45`); `pluginState.uid`
        // is `string | null` per `PluginState`. Use `== null` (covers null AND undefined defensively)
        // for both — do not mix in truthy checks like `if (!x)`, which would silently swallow a
        // legitimate empty-string value if the contract ever loosened.
        if (pluginState.uid == null) {
          throw new ResolutionError('Internal error: prewarmHqSecrets was not called before resolveEnvValues');
        }
        const cached = readCache(pluginState.uid, secretName); // string | null
        if (cached == null) {
          throw new ResolutionError(`Internal error: pre-warm did not populate cache for "${secretName}"`);
        }
        return cached;
      },
    };

    // Captured during process(parent); used by resolve() to fall back to the var key.
    private _ownerKey?: string;

    process(parent?: Parameters<Resolver['process']>[0]) {
      super.process(parent);
      if (parent != null && typeof (parent as { key?: unknown }).key === 'string') {
        this._ownerKey = (parent as { key: string }).key;
      }
    }
  }

  // varlock@1.0.0's env-spec parser rejects dots in decorator names ([a-zA-Z0-9_] only),
  // so `@hq.company` is not valid syntax. We register as `@hqCompany` (camelCase) instead.
  // Schema files must use `# @hqCompany("slug")` followed by a blank line so the parser
  // treats it as a file-level root decorator rather than an item decorator for the next var.
  graph.registerRootDecorator({
    name: 'hqCompany',
    isFunction: true,
    process: (decoratorValue: any) => {
      const slug = decoratorValue.arrArgs?.[0]?.staticValue;
      return typeof slug === 'string' ? slug : null;
    },
    execute: (slug: string | null) => {
      if (slug) pluginState.schemaCompanySlug = slug;
    },
  });

  graph.registerResolver(HqResolver);

  // Returned so `prewarmHqSecrets(graph, opts, state)` can read schemaCompanySlug
  // and write `uid` + `errorsByName`. The state is held by the closure; the returned handle
  // is purely for the prewarm helper.
  return pluginState;
}

export async function prewarmHqSecrets(
  graph: any /* EnvGraph */,
  opts: InstallHqPluginOpts,
  state: PluginState,
): Promise<void> {
  const queue: Array<{ key: string; secretName: string }> = [];
  for (const [key, item] of Object.entries(graph.configSchema)) {
    const resolver = (item as any).valueResolver;
    if (resolver?.def?.name === 'hq') {
      const explicit = resolver.arrArgs?.[0]?.staticValue;
      const secretName = (typeof explicit === 'string' && explicit) ? explicit : key;
      queue.push({ key, secretName });
    }
  }

  if (queue.length === 0) {
    return;
  }

  let slug: string;
  if (state.schemaCompanySlug) {
    slug = state.schemaCompanySlug;
  } else if (opts.companyOverride) {
    slug = opts.companyOverride;
  } else {
    throw new Error('@hqCompany("...") not declared and --company not passed');
  }

  const uid = await opts.resolveCompanyUid(slug);

  const uniqueNames = [...new Set(queue.map((q) => q.secretName))];

  if (uniqueNames.length > 100) {
    throw new Error(
      `hq run supports at most 100 hq() resolvers per schema; got ${uniqueNames.length}`,
    );
  }
  const result = await opts.fetchBatch(uid, uniqueNames);

  for (const s of result.secrets) {
    writeCache(uid, s.name, s.value);
  }
  const errorsByName = new Map<string, { code: string; message?: string }>();
  for (const e of result.errors) {
    errorsByName.set(e.name, { code: e.code, message: e.message });
  }
  state.errorsByName = errorsByName;
  state.uid = uid;
}
