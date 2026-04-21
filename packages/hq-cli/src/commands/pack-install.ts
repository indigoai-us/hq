/**
 * hq install <source> — content-pack installer (US-003, hq-core v12.0.0+)
 *
 * Source patterns and transports:
 *   @scope/name[@version]          → npm (default pin = latest, frozen on install)
 *   https://... | git@... | *.git  → git (SHA-pinned by default; --branch to follow)
 *   ./path | ../path | /path | file:... → local (path recorded as-is)
 *
 * Distinct from pkg-install.ts (entitlement-gated registry flow against the
 * proprietary HQ registry — that still runs for plain slugs). Spec:
 * knowledge/public/hq-core/package-yaml-spec.md.
 *
 * Flow:
 *   1. Classify source → transport
 *   2. Fetch payload to tmpdir (npm pack | git clone | rsync)
 *   3. Parse + validate package.yaml (10 checks from spec)
 *   4. Evaluate `conditional` predicate — skip if exits non-zero
 *   5. Confirm hooks if `contributes.hooks` non-empty (unless --allow-hooks)
 *   6. Move into packages/{name}/
 *   7. Append entry to modules.yaml with strategy: package
 *   8. Run scan-packages.sh to wire contributions into host paths
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import { execSync, spawnSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import semverSatisfies from 'semver/functions/satisfies.js';
import semverValid from 'semver/functions/valid.js';
import semverValidRange from 'semver/ranges/valid.js';
import {
  findHqRoot,
  readManifest,
  writeManifest,
} from '../utils/manifest.js';
import type {
  PackManifest,
  PackModuleDefinition,
  ModulesManifest,
  PackContributeKey,
} from '../types.js';

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

type Transport = 'npm' | 'git' | 'local';

function classify(source: string): Transport {
  if (source.startsWith('@')) return 'npm';
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('git@') ||
    source.startsWith('git://') ||
    source.endsWith('.git') ||
    /\.git#/.test(source)
  ) {
    return 'git';
  }
  if (
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('/') ||
    source.startsWith('file:')
  ) {
    return 'local';
  }
  // Fallback: bare slug — caller (dispatcher) routes those to legacy flow.
  throw new Error(
    `Cannot classify source "${source}" as pack (npm @scope/name, git URL, or path). ` +
      `Bare slugs go through the registry (Cognito) flow.`
  );
}

/**
 * sourceMatchesPackPattern — exported for the dispatcher in pkg-install.ts
 * so it can decide whether to route to the new content-pack handler or fall
 * back to the legacy registry flow.
 */
export function sourceMatchesPackPattern(source: string): boolean {
  try {
    classify(source);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

interface FetchResult {
  payloadDir: string;     // where the extracted pack lives (caller mvs it)
  resolvedSource: string; // e.g. '@scope/name@1.0.0' (version frozen) or URL#sha
  resolvedSha?: string;   // git transport only
}

function fetchNpm(source: string, tmpDir: string): FetchResult {
  // Use `npm pack` to grab the tarball without actually installing anything.
  // Capture output to get the produced filename.
  const out = execSync(`npm pack --silent --pack-destination "${tmpDir}" "${source}"`, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const tarball = out.trim().split('\n').filter(Boolean).pop();
  if (!tarball) {
    throw new Error(`npm pack produced no tarball for "${source}"`);
  }
  const tarballPath = path.join(tmpDir, tarball);
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xzf "${tarballPath}" -C "${extractDir}"`);
  // npm tarballs unpack into ./package/
  const payloadDir = path.join(extractDir, 'package');
  if (!fs.existsSync(payloadDir)) {
    throw new Error(`npm tarball layout unexpected — no "package/" in ${tarballPath}`);
  }
  // Freeze version from the resolved tarball filename when caller passed e.g.
  // '@scope/name' (no @version) — fall back to the source string.
  // npm pack writes the filename as scope-name-version.tgz (no leading @).
  const m = /([0-9]+\.[0-9]+\.[0-9]+[^.]*)\.tgz$/.exec(tarball);
  const resolvedSource = m ? `${stripVersion(source)}@${m[1]}` : source;
  return { payloadDir, resolvedSource };
}

function stripVersion(src: string): string {
  // '@scope/name@1.0.0' → '@scope/name'
  const at = src.lastIndexOf('@');
  if (at > 0) return src.slice(0, at);
  return src;
}

function fetchGit(
  source: string,
  tmpDir: string,
  followBranch: boolean
): FetchResult {
  // Split '<url>#<ref>' if present
  let url = source;
  let ref: string | undefined;
  const hashAt = source.indexOf('#');
  if (hashAt >= 0) {
    url = source.slice(0, hashAt);
    ref = source.slice(hashAt + 1);
  }
  const cloneDir = path.join(tmpDir, 'clone');
  // Shallow clone; deepen if we need a specific ref
  execSync(`git clone --depth 1 ${ref ? `--branch "${ref}"` : ''} "${url}" "${cloneDir}"`, {
    stdio: 'inherit',
  });
  if (ref) {
    // Ensure we're actually at that ref (branch clone already is; for SHAs
    // we may need --no-single-branch + fetch)
    try {
      execSync(`git -C "${cloneDir}" checkout "${ref}"`, { stdio: 'inherit' });
    } catch {
      execSync(`git -C "${cloneDir}" fetch --unshallow origin`, { stdio: 'inherit' });
      execSync(`git -C "${cloneDir}" checkout "${ref}"`, { stdio: 'inherit' });
    }
  }
  const resolvedSha = execSync(`git -C "${cloneDir}" rev-parse HEAD`, {
    encoding: 'utf-8',
  }).trim();
  // Drop .git — the pack should be file content, not a nested repo
  fs.rmSync(path.join(cloneDir, '.git'), { recursive: true, force: true });

  // --branch opt-in follows the ref (recorded as ref); default SHA-pins.
  const resolvedSource = followBranch && ref
    ? `${url}#${ref}`
    : `${url}#${resolvedSha}`;
  return { payloadDir: cloneDir, resolvedSource, resolvedSha };
}

function fetchLocal(source: string, tmpDir: string): FetchResult {
  const clean = source.startsWith('file:') ? source.slice('file:'.length) : source;
  const abs = path.resolve(process.cwd(), clean);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Local path not a directory: ${abs}`);
  }
  const payloadDir = path.join(tmpDir, 'local');
  fs.mkdirSync(payloadDir, { recursive: true });
  // rsync -a excluding common noise
  execSync(
    `rsync -a --exclude=.git --exclude=node_modules --exclude=.DS_Store "${abs}/" "${payloadDir}/"`,
    { stdio: 'inherit' }
  );
  return { payloadDir, resolvedSource: clean };
}

// ---------------------------------------------------------------------------
// Manifest validation (spec §Validation, 10 checks)
// ---------------------------------------------------------------------------

function validateManifest(
  payloadDir: string,
  hqVersion: string | null
): PackManifest {
  // 1. parse
  const manifestPath = path.join(payloadDir, 'package.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('package.yaml missing from pack payload');
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    throw new Error(`package.yaml invalid YAML: ${(e as Error).message}`);
  }
  const m = parsed as Partial<PackManifest> & Record<string, unknown>;
  if (!m || typeof m !== 'object') {
    throw new Error('package.yaml must be a YAML mapping');
  }
  // 2. name
  if (!m.name || !/^hq-pack-[a-z0-9][a-z0-9-]*$/.test(m.name)) {
    throw new Error(`Invalid pack name "${m.name}" — must match ^hq-pack-[a-z0-9][a-z0-9-]*$`);
  }
  // 3. version
  if (!m.version || !semverValid(m.version)) {
    throw new Error(`Invalid version "${m.version}" — must be valid semver`);
  }
  // 4. publisher
  if (!m.publisher || !/^@[a-z0-9][a-z0-9-]*$/i.test(m.publisher)) {
    throw new Error(`Invalid publisher "${m.publisher}" — must be a valid npm scope starting with @`);
  }
  // 5. access
  if (m.access !== 'public' && m.access !== 'private') {
    throw new Error(`access must be "public" or "private" (got "${m.access}")`);
  }
  // 6. requires.hqCore
  const range = m.requires?.hqCore;
  if (!range || !semverValidRange(range)) {
    throw new Error(`requires.hqCore must be a valid semver range (got "${range}")`);
  }
  if (hqVersion && !semverSatisfies(hqVersion, range)) {
    throw new Error(
      `Host hqCore ${hqVersion} does not satisfy pack requirement ${range}`
    );
  }
  // 7. contributes has at least one non-empty subfield
  const contributes = (m.contributes ?? {}) as PackManifest['contributes'];
  const nonEmpty = Object.values(contributes).some(
    (v) => Array.isArray(v) && v.length > 0
  );
  if (!nonEmpty) {
    throw new Error('contributes must have at least one non-empty subfield');
  }
  // 10. payload files exist (hooks check happens separately in step 8)
  const subpaths: Record<PackContributeKey, (item: string) => string> = {
    workers:    (i) => path.join('workers', i),
    knowledge:  (i) => path.join('knowledge', i),
    skills:     (i) => path.join('skills', i),
    commands:   (i) => path.join('commands', `${i}.md`),
    hooks:      (i) => path.join('hooks', `${i}.sh`),
    policies:   (i) => path.join('policies', `${i}.md`),
    scripts:    (i) => path.join('scripts', i),
  };
  for (const [key, items] of Object.entries(contributes) as [PackContributeKey, string[]][]) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const rel = subpaths[key](item);
      const abs = path.join(payloadDir, rel);
      if (!fs.existsSync(abs)) {
        throw new Error(
          `contributes.${key} declares "${item}" but payload file missing: ${rel}`
        );
      }
    }
  }
  return m as PackManifest;
}

function readHqVersion(hqRoot: string): string | null {
  const p = path.join(hqRoot, 'core.yaml');
  if (!fs.existsSync(p)) return null;
  try {
    const c = yaml.load(fs.readFileSync(p, 'utf-8')) as { hqVersion?: string };
    return c?.hqVersion ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hooks confirmation
// ---------------------------------------------------------------------------

async function confirmHooks(
  pkg: PackManifest,
  allowHooks: boolean
): Promise<boolean> {
  const hooks = pkg.contributes.hooks ?? [];
  if (hooks.length === 0) return true;
  if (allowHooks) {
    console.log(
      chalk.yellow(
        `--allow-hooks set; installing ${hooks.length} hook(s) without prompting.`
      )
    );
    return true;
  }
  console.log('');
  console.log(
    chalk.yellow(`Pack ${pkg.publisher}/${pkg.name} declares ${hooks.length} hook(s):`)
  );
  for (const h of hooks) console.log(chalk.yellow(`  - ${h}.sh`));
  console.log(
    chalk.yellow(
      'These run automatically on tool events with your shell permissions.'
    )
  );
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) => {
    rl.question('Install anyway? [y/N] ', (a) => {
      rl.close();
      resolve(a);
    });
  });
  return /^(y|yes)$/i.test(answer.trim());
}

// ---------------------------------------------------------------------------
// Conditional predicate
// ---------------------------------------------------------------------------

function evalConditional(expr: string): boolean {
  const r = spawnSync('bash', ['-c', expr], { stdio: 'ignore' });
  return r.status === 0;
}

// ---------------------------------------------------------------------------
// Move into packages/ + update modules.yaml + scan
// ---------------------------------------------------------------------------

function installToPackages(
  payloadDir: string,
  pkg: PackManifest,
  hqRoot: string
): string {
  const packagesDir = path.join(hqRoot, 'packages');
  fs.mkdirSync(packagesDir, { recursive: true });
  const destDir = path.join(packagesDir, pkg.name);
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  // rsync preserves modes/symlinks; tar also works
  execSync(`rsync -a "${payloadDir}/" "${destDir}/"`, { stdio: 'inherit' });
  return destDir;
}

function updateModulesYaml(
  hqRoot: string,
  pkg: PackManifest,
  fetched: FetchResult
): void {
  const manifest: ModulesManifest =
    readManifest(hqRoot) ?? { version: '1', modules: [] };
  // Drop any existing entry for this pack (idempotent re-install)
  manifest.modules = manifest.modules.filter((m) => m.name !== pkg.name);
  const entry: PackModuleDefinition = {
    name: pkg.name,
    strategy: 'package',
    source: fetched.resolvedSource,
    version: pkg.version,
    installed_at: path.posix.join('packages', pkg.name),
    installed_at_iso: new Date().toISOString(),
    access: pkg.access === 'public' ? 'public' : undefined,
  };
  if (fetched.resolvedSha) entry.resolved_sha = fetched.resolvedSha;
  manifest.modules.push(entry);
  writeManifest(hqRoot, manifest);
}

function runScanPackages(hqRoot: string): void {
  const script = path.join(hqRoot, 'scripts', 'scan-packages.sh');
  if (!fs.existsSync(script)) {
    console.log(
      chalk.dim(
        `  (scripts/scan-packages.sh not present — skipping auto-wire; ` +
          `will run on next session start)`
      )
    );
    return;
  }
  const r = spawnSync('bash', [script], {
    cwd: hqRoot,
    env: { ...process.env, HQ_ROOT: hqRoot },
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.log(chalk.yellow('  scan-packages.sh exited non-zero; see output above.'));
  }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface InstallPackOptions {
  allowHooks?: boolean;
  followBranch?: boolean;
}

export async function installPack(
  source: string,
  opts: InstallPackOptions = {}
): Promise<void> {
  const transport = classify(source);
  const hqRoot = findHqRoot();
  const hqVersion = readHqVersion(hqRoot);

  console.log(chalk.dim(`→ transport: ${transport}; source: ${source}`));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-pack-'));
  try {
    let fetched: FetchResult;
    switch (transport) {
      case 'npm':
        fetched = fetchNpm(source, tmpDir);
        break;
      case 'git':
        fetched = fetchGit(source, tmpDir, opts.followBranch ?? false);
        break;
      case 'local':
        fetched = fetchLocal(source, tmpDir);
        break;
    }

    const pkg = validateManifest(fetched.payloadDir, hqVersion);

    if (pkg.conditional) {
      const ok = evalConditional(pkg.conditional);
      if (!ok) {
        console.log(
          chalk.yellow(
            `Skipping ${pkg.name}: conditional "${pkg.conditional}" returned non-zero.`
          )
        );
        return;
      }
    }

    const confirmed = await confirmHooks(pkg, opts.allowHooks ?? false);
    if (!confirmed) {
      console.log(chalk.red('Install aborted (hooks denied).'));
      return;
    }

    const destDir = installToPackages(fetched.payloadDir, pkg, hqRoot);
    updateModulesYaml(hqRoot, pkg, fetched);
    runScanPackages(hqRoot);

    console.log(
      chalk.green(
        `\n✓ Installed ${pkg.name}@${pkg.version} → ${path.relative(hqRoot, destDir)}/`
      )
    );
    console.log(
      chalk.dim(
        `  Wired ${Object.values(pkg.contributes).flat().filter(Boolean).length} ` +
          `contribution(s) into host-side paths.`
      )
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
