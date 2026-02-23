/**
 * HQ CRM Utility Library
 *
 * Zero-dependency contact CRUD for the HQ CRM system.
 * All contacts stored as JSON files at workspace/crm/contacts/{slug}.json.
 *
 * Schema: knowledge/hq-core/crm-schema.json
 *
 * Usage:
 *   const crm = require('./.claude/lib/crm.js');
 *   const contact = crm.findContact({ email: 'corey@getindigo.ai' });
 *   crm.addInteraction('corey-epstein', { date: '...', type: 'slack-message', summary: '...' });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Resolve the HQ workspace root. Callers can override via CRM_WORKSPACE_ROOT
 * env var or by calling crm.setWorkspaceRoot(path).
 */
let _workspaceRoot = process.env.CRM_WORKSPACE_ROOT || null;

function getWorkspaceRoot() {
  if (_workspaceRoot) return _workspaceRoot;

  // Walk up from this file to find the HQ root (directory containing workspace/)
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'workspace', 'crm', 'contacts'))) {
      _workspaceRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: try C:/hq
  if (fs.existsSync(path.join('C:', 'hq', 'workspace', 'crm', 'contacts'))) {
    _workspaceRoot = path.join('C:', 'hq');
    return _workspaceRoot;
  }

  throw new Error(
    'Cannot locate HQ workspace root. Set CRM_WORKSPACE_ROOT env var or call setWorkspaceRoot().'
  );
}

function setWorkspaceRoot(root) {
  _workspaceRoot = root;
}

function contactsDir() {
  return path.join(getWorkspaceRoot(), 'workspace', 'crm', 'contacts');
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from a display name.
 * "Corey Epstein" -> "corey-epstein"
 * "Dr. Jane O'Brien" -> "dr-jane-obrien"
 */
function slugify(displayName) {
  return displayName
    .toLowerCase()
    .replace(/['']/g, '')           // Remove apostrophes/quotes
    .replace(/[^a-z0-9]+/g, '-')   // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')        // Trim leading/trailing hyphens
    .replace(/-{2,}/g, '-');        // Collapse multiple hyphens
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function contactPath(slug) {
  return path.join(contactsDir(), `${slug}.json`);
}

function readContact(slug) {
  const p = contactPath(slug);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

function writeContact(contact) {
  const dir = contactsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    contactPath(contact.slug),
    JSON.stringify(contact, null, 2) + '\n',
    'utf-8'
  );
  return contact;
}

function allContactFiles() {
  const dir = contactsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
}

function allContacts() {
  return allContactFiles().map(f => {
    const slug = f.replace(/\.json$/, '');
    return readContact(slug);
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// findContact(query)
// ---------------------------------------------------------------------------

/**
 * Find contacts matching a query. Supports:
 *   findContact({ name: 'Corey' })          -- fuzzy name match
 *   findContact({ email: 'corey@...' })      -- exact email match
 *   findContact({ slug: 'corey-epstein' })   -- exact slug match
 *   findContact({ slack: { userId: 'U042...' } })  -- identifier match
 *   findContact({ linear: { userId: '...' } })
 *   findContact({ github: { username: '...' } })
 *
 * Returns array of matching contacts (may be empty).
 */
function findContact(query) {
  if (!query || typeof query !== 'object') return [];

  const contacts = allContacts();
  const results = [];

  for (const c of contacts) {
    if (_matchesQuery(c, query)) {
      results.push(c);
    }
  }

  return results;
}

function _matchesQuery(contact, query) {
  // Exact slug match
  if (query.slug) {
    if (contact.slug === query.slug) return true;
  }

  // Email match (case-insensitive)
  if (query.email) {
    const needle = query.email.toLowerCase();
    if (contact.emails && contact.emails.some(e => e.address.toLowerCase() === needle)) return true;
    if (contact.identifiers && contact.identifiers.email &&
        contact.identifiers.email.some(e => e.address.toLowerCase() === needle)) return true;
  }

  // Name match (fuzzy: substring or Levenshtein)
  if (query.name) {
    const needle = query.name.toLowerCase();
    const display = (contact.name && contact.name.display || '').toLowerCase();
    const first = (contact.name && contact.name.first || '').toLowerCase();
    const last = (contact.name && contact.name.last || '').toLowerCase();
    const aliases = (contact.name && contact.name.aliases || []).map(a => a.toLowerCase());

    // Substring match
    if (display.includes(needle) || first.includes(needle) || last.includes(needle)) return true;
    if (aliases.some(a => a.includes(needle))) return true;

    // Levenshtein distance match (for fuzzy matching)
    if (levenshtein(display, needle) <= 2) return true;
  }

  // Identifier matches (slack, linear, github, or any system)
  for (const [system, matchObj] of Object.entries(query)) {
    if (['name', 'email', 'slug'].includes(system)) continue;
    if (typeof matchObj !== 'object' || matchObj === null) continue;

    const identifiers = contact.identifiers && contact.identifiers[system];
    if (!identifiers || !Array.isArray(identifiers)) continue;

    for (const ident of identifiers) {
      const allMatch = Object.entries(matchObj).every(([k, v]) => ident[k] === v);
      if (allMatch) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// createContact(data)
// ---------------------------------------------------------------------------

/**
 * Create a new contact. Requires at minimum: data.name (string or object).
 *
 *   createContact({ name: 'Corey Epstein', emails: [{ address: 'corey@getindigo.ai' }] })
 *   createContact({ name: { display: 'Corey Epstein', first: 'Corey', last: 'Epstein' } })
 *
 * Auto-generates: id, slug, createdAt, updatedAt.
 * Prevents exact duplicates (same slug already exists).
 *
 * Returns the created contact object, or throws if duplicate found.
 */
function createContact(data) {
  if (!data || !data.name) {
    throw new Error('createContact requires data.name (string or { display, first?, last? })');
  }

  // Normalize name to object form
  let nameObj;
  if (typeof data.name === 'string') {
    const parts = data.name.trim().split(/\s+/);
    nameObj = {
      display: data.name.trim(),
      first: parts[0] || '',
      last: parts.slice(1).join(' ') || '',
      aliases: []
    };
  } else {
    nameObj = {
      display: data.name.display || '',
      first: data.name.first || '',
      last: data.name.last || '',
      aliases: data.name.aliases || []
    };
  }

  if (!nameObj.display) {
    throw new Error('Contact must have a display name');
  }

  const slug = data.slug || slugify(nameObj.display);

  // Check for exact duplicate (same slug)
  const existing = readContact(slug);
  if (existing) {
    throw new Error(`Duplicate contact: ${slug} already exists. Use updateContact() or mergeContacts() instead.`);
  }

  const now = new Date().toISOString();
  const contact = {
    id: crypto.randomUUID(),
    slug,
    name: nameObj,
    emails: data.emails || [],
    phones: data.phones || [],
    companies: data.companies || [],
    title: data.title || '',
    identifiers: data.identifiers || {},
    sources: data.sources || [],
    interactions: data.interactions || [],
    tags: data.tags || [],
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now
  };

  return writeContact(contact);
}

// ---------------------------------------------------------------------------
// updateContact(slug, patch)
// ---------------------------------------------------------------------------

/**
 * Update a contact by slug. Deep-merges:
 *   - Arrays (emails, phones, companies, sources, interactions, tags) are APPENDED (deduplicated where sensible)
 *   - identifiers are merged by system key (arrays within each system are appended)
 *   - Scalar fields (title, notes) are overwritten
 *   - name fields are merged (display/first/last overwrite if provided, aliases appended)
 *
 * Returns the updated contact, or null if slug not found.
 */
function updateContact(slug, patch) {
  const contact = readContact(slug);
  if (!contact) return null;

  const now = new Date().toISOString();

  // Name merge
  if (patch.name) {
    if (typeof patch.name === 'string') {
      contact.name.display = patch.name;
    } else {
      if (patch.name.display) contact.name.display = patch.name.display;
      if (patch.name.first) contact.name.first = patch.name.first;
      if (patch.name.last) contact.name.last = patch.name.last;
      if (patch.name.aliases) {
        contact.name.aliases = _uniqueArray([
          ...(contact.name.aliases || []),
          ...patch.name.aliases
        ]);
      }
    }
  }

  // Simple array append with dedup
  if (patch.emails) {
    contact.emails = _mergeArrayByKey(contact.emails, patch.emails, 'address');
  }
  if (patch.phones) {
    contact.phones = _mergeArrayByKey(contact.phones, patch.phones, 'number');
  }
  if (patch.companies) {
    contact.companies = _mergeArrayByKey(contact.companies, patch.companies, 'name');
  }
  if (patch.tags) {
    contact.tags = _uniqueArray([...(contact.tags || []), ...patch.tags]);
  }

  // Append-only arrays (sources, interactions) -- always append, no dedup
  if (patch.sources) {
    contact.sources = [...(contact.sources || []), ...patch.sources];
  }
  if (patch.interactions) {
    contact.interactions = [...(contact.interactions || []), ...patch.interactions];
  }

  // Identifiers: merge by system key
  if (patch.identifiers) {
    contact.identifiers = contact.identifiers || {};
    for (const [system, newEntries] of Object.entries(patch.identifiers)) {
      if (!Array.isArray(newEntries)) continue;
      const existing = contact.identifiers[system] || [];
      // Merge by primary key for each system
      const keyField = _identifierKeyField(system);
      contact.identifiers[system] = _mergeArrayByKey(existing, newEntries, keyField);
    }
  }

  // Scalar overwrites
  if (patch.title !== undefined) contact.title = patch.title;
  if (patch.notes !== undefined) contact.notes = patch.notes;

  contact.updatedAt = now;

  return writeContact(contact);
}

// ---------------------------------------------------------------------------
// mergeContacts(slugA, slugB)
// ---------------------------------------------------------------------------

/**
 * Merge two contacts into one. The first slug (slugA) becomes the surviving contact.
 * slugB's data is merged into slugA and the slugB file is deleted.
 *
 * Returns the merged contact, or null if either slug not found.
 * If names differ, the slugA name is kept but slugB's display name is added as an alias.
 */
function mergeContacts(slugA, slugB) {
  const a = readContact(slugA);
  const b = readContact(slugB);

  if (!a || !b) return null;
  if (slugA === slugB) return a;

  // If names differ, add B's display name as an alias on A
  if (a.name.display.toLowerCase() !== b.name.display.toLowerCase()) {
    a.name.aliases = _uniqueArray([
      ...(a.name.aliases || []),
      b.name.display
    ]);
  }

  // Merge all array fields
  a.emails = _mergeArrayByKey(a.emails || [], b.emails || [], 'address');
  a.phones = _mergeArrayByKey(a.phones || [], b.phones || [], 'number');
  a.companies = _mergeArrayByKey(a.companies || [], b.companies || [], 'name');
  a.tags = _uniqueArray([...(a.tags || []), ...(b.tags || [])]);
  a.sources = [...(a.sources || []), ...(b.sources || [])];
  a.interactions = [...(a.interactions || []), ...(b.interactions || [])];

  // Merge identifiers
  a.identifiers = a.identifiers || {};
  b.identifiers = b.identifiers || {};
  for (const [system, entries] of Object.entries(b.identifiers)) {
    if (!Array.isArray(entries)) continue;
    const existing = a.identifiers[system] || [];
    const keyField = _identifierKeyField(system);
    a.identifiers[system] = _mergeArrayByKey(existing, entries, keyField);
  }

  // Scalars: keep A's unless empty
  if (!a.title && b.title) a.title = b.title;
  if (!a.notes && b.notes) a.notes = b.notes;

  // Add B's name aliases
  if (b.name.aliases) {
    a.name.aliases = _uniqueArray([...(a.name.aliases || []), ...b.name.aliases]);
  }

  a.updatedAt = new Date().toISOString();

  // Write merged contact and delete B
  writeContact(a);
  const bPath = contactPath(slugB);
  if (fs.existsSync(bPath)) {
    fs.unlinkSync(bPath);
  }

  return a;
}

// ---------------------------------------------------------------------------
// listContacts(filter)
// ---------------------------------------------------------------------------

/**
 * List contacts, optionally filtered.
 *
 *   listContacts()                           -- all contacts
 *   listContacts({ tag: 'team' })            -- contacts with tag 'team'
 *   listContacts({ company: 'Indigo' })      -- contacts at company (substring match)
 *   listContacts({ source: 'slack' })        -- contacts with source type 'slack'
 *   listContacts({ hasEmail: true })          -- contacts with at least one email
 *
 * Returns array of contacts sorted by name.display.
 */
function listContacts(filter) {
  let contacts = allContacts();

  if (filter) {
    if (filter.tag) {
      contacts = contacts.filter(c => (c.tags || []).includes(filter.tag));
    }
    if (filter.company) {
      const needle = filter.company.toLowerCase();
      contacts = contacts.filter(c =>
        (c.companies || []).some(co => co.name.toLowerCase().includes(needle))
      );
    }
    if (filter.source) {
      contacts = contacts.filter(c =>
        (c.sources || []).some(s => s.type === filter.source)
      );
    }
    if (filter.hasEmail) {
      contacts = contacts.filter(c => (c.emails || []).length > 0);
    }
  }

  contacts.sort((a, b) => {
    const nameA = (a.name && a.name.display || '').toLowerCase();
    const nameB = (b.name && b.name.display || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return contacts;
}

// ---------------------------------------------------------------------------
// addInteraction(slug, interaction)
// ---------------------------------------------------------------------------

/**
 * Append an interaction entry to a contact.
 *
 *   addInteraction('corey-epstein', {
 *     date: '2026-02-21T14:30:00Z',
 *     type: 'slack-message',
 *     summary: 'Discussed deployment timeline',
 *     ref: 'indigo-ai/#hq-dev/1708123456.789'
 *   })
 *
 * Returns the updated contact, or null if slug not found.
 */
function addInteraction(slug, interaction) {
  if (!interaction || !interaction.date || !interaction.type || !interaction.summary) {
    throw new Error('Interaction requires: date, type, summary');
  }
  return updateContact(slug, { interactions: [interaction] });
}

// ---------------------------------------------------------------------------
// addSource(slug, source)
// ---------------------------------------------------------------------------

/**
 * Append a source entry to a contact.
 *
 *   addSource('corey-epstein', {
 *     type: 'slack',
 *     ref: 'indigo-ai/#general/1708123456.789',
 *     date: '2026-02-21T12:00:00Z',
 *     context: 'Mentioned in project discussion'
 *   })
 *
 * Returns the updated contact, or null if slug not found.
 */
function addSource(slug, source) {
  if (!source || !source.type || !source.date) {
    throw new Error('Source requires: type, date');
  }
  return updateContact(slug, { sources: [source] });
}

// ---------------------------------------------------------------------------
// Helper: Levenshtein distance
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// ---------------------------------------------------------------------------
// Helper: Array merge utilities
// ---------------------------------------------------------------------------

function _uniqueArray(arr) {
  return [...new Set(arr)];
}

/**
 * Merge two arrays of objects by a key field.
 * New items are appended if their key value is not already present.
 * If key is present, existing item is kept (no overwrite).
 */
function _mergeArrayByKey(existing, incoming, keyField) {
  const merged = [...existing];
  const seenKeys = new Set(existing.map(item => {
    const val = item[keyField];
    return typeof val === 'string' ? val.toLowerCase() : val;
  }));

  for (const item of incoming) {
    const key = item[keyField];
    const normalizedKey = typeof key === 'string' ? key.toLowerCase() : key;
    if (!seenKeys.has(normalizedKey)) {
      merged.push(item);
      seenKeys.add(normalizedKey);
    }
  }

  return merged;
}

/**
 * Determine the primary key field for identifier deduplication per system.
 */
function _identifierKeyField(system) {
  switch (system) {
    case 'slack': return 'userId';
    case 'linear': return 'userId';
    case 'github': return 'username';
    case 'email': return 'address';
    default: return 'id';
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Core CRUD
  findContact,
  createContact,
  updateContact,
  mergeContacts,
  listContacts,

  // Convenience
  addInteraction,
  addSource,

  // Utilities (exposed for testing and advanced use)
  slugify,
  levenshtein,
  setWorkspaceRoot,
  readContact,
  allContacts,

  // Internal (exposed for testing)
  _mergeArrayByKey,
  _identifierKeyField,
  _uniqueArray
};
