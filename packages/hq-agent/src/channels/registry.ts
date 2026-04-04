// Channel registry — singleton map of name → Channel instances.
// Each channel module registers itself at import time.

import type { Channel } from './types.js';

const _registry = new Map<string, Channel>();

export function register(channel: Channel): void {
  if (_registry.has(channel.name)) {
    console.warn(`[registry] Channel "${channel.name}" already registered — skipping duplicate`);
    return;
  }
  _registry.set(channel.name, channel);
  console.log(`[registry] Channel registered: ${channel.name}`);
}

export function get(name: string): Channel | undefined {
  return _registry.get(name);
}

export function list(): Channel[] {
  return Array.from(_registry.values());
}

/** Clear all registered channels — for test isolation only. */
export function clearRegistry(): void {
  _registry.clear();
}

/**
 * Dynamically import all channel modules from src/channels/*.ts (at runtime,
 * from dist/channels/*.js). Skips types.ts and registry.ts.
 *
 * Each channel module is responsible for calling register() at load time.
 */
export async function loadChannels(channelsDir: string): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const skipFiles = new Set(['types.js', 'registry.js', 'webhook-server.js']);

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(channelsDir);
  } catch {
    // Directory may not exist when no channels compiled yet
    console.warn(`[registry] Channels directory not found: ${channelsDir}`);
    return;
  }

  // Only load .js files — dist/ also contains .d.ts declarations which are not importable
  const moduleFiles = entries.filter(
    (f) => f.endsWith('.js') && !skipFiles.has(f)
  );

  for (const file of moduleFiles) {
    const fullPath = path.join(channelsDir, file);
    try {
      await import(fullPath);
      console.log(`[registry] Loaded channel module: ${file}`);
    } catch (err) {
      console.error(`[registry] Failed to load channel module ${file}:`, err);
    }
  }
}
