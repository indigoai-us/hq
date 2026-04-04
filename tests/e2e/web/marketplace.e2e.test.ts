/**
 * E2E: Marketplace — validates registry client, browse/search page,
 * package detail page, and install trigger are wired correctly.
 *
 * Uses filesystem + module validation (consistent with dashboard.e2e.test.ts pattern).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_SRC = join(__dirname, '../../../apps/web/src');

describe('e2e: marketplace — registry API client (US-001)', () => {
  const registryPath = join(WEB_SRC, 'lib/registry.ts');

  it('registry.ts exists', () => {
    expect(existsSync(registryPath)).toBe(true);
  });

  it('exports searchPackages, getPackage, listCategories, getPublisher', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('export async function searchPackages');
    expect(content).toContain('export async function getPackage');
    expect(content).toContain('export async function listCategories');
    expect(content).toContain('export async function getPublisher');
  });

  it('does not import auth — registry is public', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).not.toContain("from '../lib/auth'");
    expect(content).not.toContain('from "./auth"');
    expect(content).not.toContain('Bearer');
  });

  it('uses AbortSignal.timeout for request safety', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('AbortSignal.timeout');
  });

  it('targets registry URL with fallback', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('VITE_REGISTRY_URL');
    expect(content).toContain('admin.getindigo.ai');
  });
});

describe('e2e: marketplace — browse + search page (US-002)', () => {
  const marketplacePath = join(WEB_SRC, 'pages/Marketplace.tsx');

  it('Marketplace.tsx exists', () => {
    expect(existsSync(marketplacePath)).toBe(true);
  });

  it('has debounced search input', () => {
    const content = readFileSync(marketplacePath, 'utf-8');
    expect(content).toContain('Search packages');
    expect(content).toContain('debouncedSearch');
    expect(content).toContain('setTimeout');
    expect(content).toContain('clearTimeout');
  });

  it('has category filter pills', () => {
    const content = readFileSync(marketplacePath, 'utf-8');
    expect(content).toContain('worker-packs');
    expect(content).toContain('knowledge-bases');
    expect(content).toContain('tools');
    expect(content).toContain('skills');
  });

  it('renders a responsive package grid', () => {
    const content = readFileSync(marketplacePath, 'utf-8');
    expect(content).toContain('grid-cols-1');
    expect(content).toContain('sm:grid-cols-2');
    expect(content).toContain('lg:grid-cols-3');
  });

  it('has skeleton loading and empty state', () => {
    const content = readFileSync(marketplacePath, 'utf-8');
    expect(content).toContain('animate-pulse');
    expect(content).toContain('No packages found');
  });

  it('App.tsx has /marketplace route', () => {
    const appContent = readFileSync(join(WEB_SRC, 'App.tsx'), 'utf-8');
    expect(appContent).toContain('"/marketplace"');
    expect(appContent).toContain('Marketplace');
  });

  it('Layout.tsx has Marketplace nav link', () => {
    const layoutContent = readFileSync(join(WEB_SRC, 'components/Layout.tsx'), 'utf-8');
    expect(layoutContent).toContain('/marketplace');
    expect(layoutContent).toContain('Marketplace');
  });
});

describe('e2e: marketplace — package detail page (US-003)', () => {
  const detailPath = join(WEB_SRC, 'pages/PackageDetail.tsx');

  it('PackageDetail.tsx exists', () => {
    expect(existsSync(detailPath)).toBe(true);
  });

  it('fetches package by name from route params', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('useParams');
    expect(content).toContain('getPackage');
  });

  it('renders README with ReactMarkdown and prose styling', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('ReactMarkdown');
    expect(content).toContain('prose prose-invert prose-sm');
  });

  it('has copy-to-clipboard for install command', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('clipboard');
    expect(content).toContain('hq modules add');
  });

  it('has 404 not-found state', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('Package Not Found');
    expect(content).toContain('Back to Marketplace');
  });

  it('App.tsx has /marketplace/:name route', () => {
    const appContent = readFileSync(join(WEB_SRC, 'App.tsx'), 'utf-8');
    expect(appContent).toContain('"/marketplace/:name"');
    expect(appContent).toContain('PackageDetail');
  });
});

describe('e2e: marketplace — install trigger (US-004)', () => {
  const detailPath = join(WEB_SRC, 'pages/PackageDetail.tsx');

  it('uses getFile and putFile for S3 modules.yaml sync', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('getFile');
    expect(content).toContain('putFile');
    expect(content).toContain('modules/modules.yaml');
  });

  it('has install state machine with all states', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('"idle"');
    expect(content).toContain('"installing"');
    expect(content).toContain('"installed"');
    expect(content).toContain('"already"');
    expect(content).toContain('"uninstalling"');
    expect(content).toContain('"error"');
  });

  it('builds module entry with name, repo, branch, strategy', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('buildModuleEntry');
    expect(content).toContain('strategy: link');
  });

  it('supports uninstall via removeModuleEntry', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('removeModuleEntry');
    expect(content).toContain('handleUninstall');
  });

  it('shows sync instructions after install', () => {
    const content = readFileSync(detailPath, 'utf-8');
    expect(content).toContain('hq modules sync');
  });
});
