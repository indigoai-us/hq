import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SchemaConflict {
  paths: [string, string];
  slugs: [string, string];
}

export interface DiscoverSchemasResult {
  schemaPaths: string[];
  envLocalPaths: string[];
  companySlug: string | null;
  conflict: SchemaConflict | null;
}

const SLUG_RE = /^# @hqCompany\("([^"]+)"\)/m;

function parseSlug(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const m = SLUG_RE.exec(content);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function discoverSchemas(cwd: string): DiscoverSchemasResult {
  const schemaPaths: string[] = [];
  const envLocalPaths: string[] = [];

  let dir = path.resolve(cwd);

  while (true) {
    const schemaPath = path.join(dir, '.env.schema');
    if (fs.existsSync(schemaPath)) {
      schemaPaths.push(schemaPath);
      const localPath = path.join(dir, '.env.local');
      if (fs.existsSync(localPath)) {
        envLocalPaths.push(localPath);
      }
    }

    const isGitRoot = fs.existsSync(path.join(dir, '.git'));
    if (isGitRoot) break;

    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  // cwd-closest is pushed last during walk-up, so reversing puts it last.
  // (During walk-up cwd is checked first → pushed first → reversed → ends up last.)
  schemaPaths.reverse();
  envLocalPaths.reverse();

  let companySlug: string | null = null;
  let companySlugPath: string | null = null;
  let conflict: SchemaConflict | null = null;

  for (const schemaPath of schemaPaths) {
    const slug = parseSlug(schemaPath);
    if (slug == null) continue;

    if (companySlug == null) {
      companySlug = slug;
      companySlugPath = schemaPath;
    } else if (companySlug !== slug) {
      conflict = {
        paths: [companySlugPath!, schemaPath],
        slugs: [companySlug, slug],
      };
      companySlug = null;
      break;
    }
  }

  return { schemaPaths, envLocalPaths, companySlug, conflict };
}
