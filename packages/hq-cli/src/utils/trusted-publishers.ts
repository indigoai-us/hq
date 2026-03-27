/**
 * Trust store for package publishers (US-005)
 * Reads / writes ~/.hq/trusted-publishers.json
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const TRUST_FILE = path.join(homedir(), '.hq', 'trusted-publishers.json');

interface TrustStore {
  publishers: string[];
}

async function load(): Promise<TrustStore> {
  try {
    const raw = await readFile(TRUST_FILE, 'utf8');
    return JSON.parse(raw) as TrustStore;
  } catch {
    return { publishers: [] };
  }
}

async function save(store: TrustStore): Promise<void> {
  await mkdir(path.dirname(TRUST_FILE), { recursive: true });
  await writeFile(TRUST_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export async function isTrusted(publisher: string): Promise<boolean> {
  const store = await load();
  return store.publishers.includes(publisher);
}

export async function addTrusted(publisher: string): Promise<void> {
  const store = await load();
  if (!store.publishers.includes(publisher)) {
    store.publishers.push(publisher);
    await save(store);
  }
}

export async function removeTrusted(publisher: string): Promise<void> {
  const store = await load();
  store.publishers = store.publishers.filter(p => p !== publisher);
  await save(store);
}

export async function listTrusted(): Promise<string[]> {
  const store = await load();
  return [...store.publishers];
}
