/**
 * Registry client base — reads registry URL from packages/sources.yaml (US-004)
 * Full client implementation deferred to US-005.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { findHqRoot } from './hq-root.js';

interface SourceEntry {
  name: string;
  url: string;
  type: string;
  auth: string;
}

interface SourcesFile {
  sources: SourceEntry[];
}

/**
 * Read the registry URL from packages/sources.yaml in the user's HQ root.
 * Returns the URL of the first source entry.
 * Throws if sources.yaml is missing or has no sources.
 */
export function getRegistryUrl(): string {
  const hqRoot = findHqRoot();
  const sourcesPath = path.join(hqRoot, 'packages', 'sources.yaml');

  if (!fs.existsSync(sourcesPath)) {
    throw new Error(
      `No packages/sources.yaml found at ${sourcesPath}. Is your HQ packages directory set up?`
    );
  }

  const content = fs.readFileSync(sourcesPath, 'utf-8');
  const parsed = yaml.load(content) as SourcesFile;

  if (!parsed?.sources?.length) {
    throw new Error('No sources defined in packages/sources.yaml');
  }

  return parsed.sources[0].url;
}
