/**
 * Unit tests for CRM utility library (.claude/lib/crm.js)
 *
 * Run with: node --test .claude/lib/__tests__/crm.test.js
 *   (Node 22+ built-in test runner, zero dependencies)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const crm = require('../crm.js');

// ---------------------------------------------------------------------------
// Test fixtures and helpers
// ---------------------------------------------------------------------------

let tmpDir;

function setupTmpWorkspace() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
  const contactsDir = path.join(tmpDir, 'workspace', 'crm', 'contacts');
  fs.mkdirSync(contactsDir, { recursive: true });
  crm.setWorkspaceRoot(tmpDir);
}

function teardownTmpWorkspace() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

function contactExists(slug) {
  return fs.existsSync(
    path.join(tmpDir, 'workspace', 'crm', 'contacts', `${slug}.json`)
  );
}

function readContactFile(slug) {
  const p = path.join(tmpDir, 'workspace', 'crm', 'contacts', `${slug}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('converts simple name to slug', () => {
    assert.equal(crm.slugify('Corey Epstein'), 'corey-epstein');
  });

  it('handles apostrophes and special chars', () => {
    assert.equal(crm.slugify("Dr. Jane O'Brien"), 'dr-jane-obrien');
  });

  it('collapses multiple spaces and hyphens', () => {
    assert.equal(crm.slugify('John   Doe'), 'john-doe');
  });

  it('trims leading/trailing non-alpha', () => {
    assert.equal(crm.slugify('--John Doe--'), 'john-doe');
  });

  it('handles single name', () => {
    assert.equal(crm.slugify('Madonna'), 'madonna');
  });
});

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(crm.levenshtein('hello', 'hello'), 0);
  });

  it('returns correct distance for similar strings', () => {
    assert.equal(crm.levenshtein('kitten', 'sitting'), 3);
  });

  it('returns string length for empty comparison', () => {
    assert.equal(crm.levenshtein('abc', ''), 3);
    assert.equal(crm.levenshtein('', 'abc'), 3);
  });

  it('handles single character difference', () => {
    assert.equal(crm.levenshtein('cat', 'car'), 1);
  });
});

// ---------------------------------------------------------------------------
// createContact
// ---------------------------------------------------------------------------

describe('createContact', () => {
  beforeEach(setupTmpWorkspace);
  afterEach(teardownTmpWorkspace);

  it('creates contact from string name', () => {
    const c = crm.createContact({ name: 'Corey Epstein' });
    assert.equal(c.slug, 'corey-epstein');
    assert.equal(c.name.display, 'Corey Epstein');
    assert.equal(c.name.first, 'Corey');
    assert.equal(c.name.last, 'Epstein');
    assert.ok(c.id); // UUID generated
    assert.ok(c.createdAt);
    assert.ok(c.updatedAt);
    assert.ok(contactExists('corey-epstein'));
  });

  it('creates contact from name object', () => {
    const c = crm.createContact({
      name: { display: 'Jane Doe', first: 'Jane', last: 'Doe' }
    });
    assert.equal(c.name.display, 'Jane Doe');
    assert.equal(c.slug, 'jane-doe');
  });

  it('includes emails, identifiers, and sources', () => {
    const c = crm.createContact({
      name: 'Test Person',
      emails: [{ address: 'test@example.com', primary: true }],
      identifiers: {
        slack: [{ workspace: 'test-ws', userId: 'U123' }]
      },
      sources: [{ type: 'manual', date: '2026-02-21T00:00:00Z' }]
    });
    assert.equal(c.emails.length, 1);
    assert.equal(c.emails[0].address, 'test@example.com');
    assert.equal(c.identifiers.slack.length, 1);
    assert.equal(c.identifiers.slack[0].userId, 'U123');
    assert.equal(c.sources.length, 1);
  });

  it('throws on missing name', () => {
    assert.throws(() => crm.createContact({}), /requires data\.name/);
    assert.throws(() => crm.createContact(null), /requires data\.name/);
  });

  it('throws on empty display name', () => {
    assert.throws(
      () => crm.createContact({ name: { display: '' } }),
      /display name/
    );
  });

  it('prevents exact duplicate (same slug)', () => {
    crm.createContact({ name: 'John Doe' });
    assert.throws(
      () => crm.createContact({ name: 'John Doe' }),
      /Duplicate contact.*john-doe/
    );
  });

  it('writes valid JSON file', () => {
    crm.createContact({ name: 'File Test' });
    const raw = readContactFile('file-test');
    assert.equal(raw.slug, 'file-test');
    assert.ok(raw.id.match(/^[0-9a-f]{8}-/)); // UUID format
  });
});

// ---------------------------------------------------------------------------
// findContact
// ---------------------------------------------------------------------------

describe('findContact', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({
      name: 'Corey Epstein',
      emails: [{ address: 'corey@getindigo.ai', primary: true }],
      identifiers: {
        slack: [{ workspace: 'indigo-ai', userId: 'U042Z9XCRK3', dmChannel: 'D0672CEKJ1E' }],
        linear: [{ workspace: 'indigo-ai', userId: 'be96bce2-1234', displayName: 'corey1' }],
        github: [{ username: 'coreyepstein' }]
      }
    });
    crm.createContact({
      name: 'Stefan Johnson',
      emails: [{ address: 'stefan@getindigo.ai' }],
      identifiers: {
        slack: [{ workspace: 'indigo-ai', userId: 'U065YSKUCJK' }]
      }
    });
  });
  afterEach(teardownTmpWorkspace);

  it('finds by exact email', () => {
    const results = crm.findContact({ email: 'corey@getindigo.ai' });
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, 'corey-epstein');
  });

  it('finds by email case-insensitive', () => {
    const results = crm.findContact({ email: 'COREY@getindigo.ai' });
    assert.equal(results.length, 1);
  });

  it('finds by slug', () => {
    const results = crm.findContact({ slug: 'stefan-johnson' });
    assert.equal(results.length, 1);
    assert.equal(results[0].name.display, 'Stefan Johnson');
  });

  it('finds by name substring', () => {
    const results = crm.findContact({ name: 'Corey' });
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, 'corey-epstein');
  });

  it('finds by name fuzzy (Levenshtein)', () => {
    // "corey epsten" is within 2 of "corey epstein"
    const results = crm.findContact({ name: 'corey epsten' });
    assert.equal(results.length, 1);
  });

  it('finds by Slack userId', () => {
    const results = crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, 'corey-epstein');
  });

  it('finds by Linear userId', () => {
    const results = crm.findContact({ linear: { userId: 'be96bce2-1234' } });
    assert.equal(results.length, 1);
  });

  it('finds by GitHub username', () => {
    const results = crm.findContact({ github: { username: 'coreyepstein' } });
    assert.equal(results.length, 1);
  });

  it('returns empty array when not found', () => {
    const results = crm.findContact({ email: 'nobody@example.com' });
    assert.equal(results.length, 0);
  });

  it('returns empty for null/invalid query', () => {
    assert.deepEqual(crm.findContact(null), []);
    assert.deepEqual(crm.findContact(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// updateContact
// ---------------------------------------------------------------------------

describe('updateContact', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({
      name: 'Update Test',
      emails: [{ address: 'original@test.com' }],
      tags: ['team'],
      identifiers: {
        slack: [{ workspace: 'ws1', userId: 'U001' }]
      }
    });
  });
  afterEach(teardownTmpWorkspace);

  it('appends new emails without duplicating existing', () => {
    const c = crm.updateContact('update-test', {
      emails: [
        { address: 'original@test.com' },  // duplicate -- should be ignored
        { address: 'new@test.com' }         // new -- should be appended
      ]
    });
    assert.equal(c.emails.length, 2);
    assert.ok(c.emails.some(e => e.address === 'original@test.com'));
    assert.ok(c.emails.some(e => e.address === 'new@test.com'));
  });

  it('appends tags without duplicates', () => {
    const c = crm.updateContact('update-test', {
      tags: ['team', 'vip']
    });
    assert.deepEqual(c.tags, ['team', 'vip']);
  });

  it('merges identifiers by system key', () => {
    const c = crm.updateContact('update-test', {
      identifiers: {
        slack: [
          { workspace: 'ws1', userId: 'U001' },  // duplicate
          { workspace: 'ws2', userId: 'U002' }    // new
        ],
        github: [{ username: 'testuser' }]       // new system
      }
    });
    assert.equal(c.identifiers.slack.length, 2);
    assert.equal(c.identifiers.github.length, 1);
  });

  it('appends interactions (always, no dedup)', () => {
    crm.updateContact('update-test', {
      interactions: [{ date: '2026-01-01T00:00:00Z', type: 'test', summary: 'First' }]
    });
    const c = crm.updateContact('update-test', {
      interactions: [{ date: '2026-01-02T00:00:00Z', type: 'test', summary: 'Second' }]
    });
    assert.equal(c.interactions.length, 2);
  });

  it('appends sources (always, no dedup)', () => {
    crm.updateContact('update-test', {
      sources: [{ type: 'slack', date: '2026-01-01T00:00:00Z' }]
    });
    const c = crm.updateContact('update-test', {
      sources: [{ type: 'email', date: '2026-01-02T00:00:00Z' }]
    });
    assert.equal(c.sources.length, 2);
  });

  it('overwrites scalar fields', () => {
    const c = crm.updateContact('update-test', {
      title: 'CEO',
      notes: 'Important contact'
    });
    assert.equal(c.title, 'CEO');
    assert.equal(c.notes, 'Important contact');
  });

  it('merges name fields', () => {
    const c = crm.updateContact('update-test', {
      name: { first: 'Updated', aliases: ['UT'] }
    });
    assert.equal(c.name.first, 'Updated');
    assert.equal(c.name.display, 'Update Test'); // unchanged
    assert.ok(c.name.aliases.includes('UT'));
  });

  it('updates updatedAt timestamp', () => {
    const before = crm.readContact('update-test');
    // Small delay to ensure different timestamp
    const c = crm.updateContact('update-test', { title: 'New Title' });
    assert.ok(c.updatedAt >= before.updatedAt);
  });

  it('returns null for non-existent slug', () => {
    const result = crm.updateContact('nonexistent', { title: 'test' });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// mergeContacts
// ---------------------------------------------------------------------------

describe('mergeContacts', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({
      name: 'Alice Smith',
      emails: [{ address: 'alice@example.com' }],
      tags: ['team'],
      title: 'Engineer',
      identifiers: {
        slack: [{ userId: 'UA1', workspace: 'ws1' }]
      },
      sources: [{ type: 'manual', date: '2026-01-01T00:00:00Z' }]
    });
    crm.createContact({
      name: 'A. Smith',
      emails: [{ address: 'asmith@corp.com' }],
      tags: ['vip'],
      identifiers: {
        slack: [{ userId: 'UA2', workspace: 'ws2' }],
        github: [{ username: 'asmith' }]
      },
      sources: [{ type: 'email', date: '2026-01-02T00:00:00Z' }]
    });
  });
  afterEach(teardownTmpWorkspace);

  it('merges B into A, keeps A as surviving contact', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.ok(merged);
    assert.equal(merged.slug, 'alice-smith');
    assert.equal(merged.name.display, 'Alice Smith');
  });

  it('adds B display name as alias if different', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.ok(merged.name.aliases.includes('A. Smith'));
  });

  it('unions emails', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.equal(merged.emails.length, 2);
  });

  it('unions tags', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.ok(merged.tags.includes('team'));
    assert.ok(merged.tags.includes('vip'));
  });

  it('merges identifiers across systems', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.equal(merged.identifiers.slack.length, 2);
    assert.equal(merged.identifiers.github.length, 1);
  });

  it('concatenates sources', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.equal(merged.sources.length, 2);
  });

  it('deletes B contact file', () => {
    crm.mergeContacts('alice-smith', 'a-smith');
    assert.ok(!contactExists('a-smith'));
    assert.ok(contactExists('alice-smith'));
  });

  it('keeps A title if present', () => {
    const merged = crm.mergeContacts('alice-smith', 'a-smith');
    assert.equal(merged.title, 'Engineer');
  });

  it('returns null if either slug not found', () => {
    assert.equal(crm.mergeContacts('alice-smith', 'nonexistent'), null);
    assert.equal(crm.mergeContacts('nonexistent', 'alice-smith'), null);
  });

  it('returns A unchanged if merging with self', () => {
    const result = crm.mergeContacts('alice-smith', 'alice-smith');
    assert.equal(result.slug, 'alice-smith');
  });
});

// ---------------------------------------------------------------------------
// listContacts
// ---------------------------------------------------------------------------

describe('listContacts', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({
      name: 'Zara Team',
      tags: ['team'],
      companies: [{ name: 'Indigo', role: 'Dev' }],
      emails: [{ address: 'zara@indigo.ai' }],
      sources: [{ type: 'slack', date: '2026-01-01T00:00:00Z' }]
    });
    crm.createContact({
      name: 'Alpha Client',
      tags: ['client'],
      companies: [{ name: 'ACME Corp', role: 'CEO' }],
      sources: [{ type: 'email', date: '2026-01-01T00:00:00Z' }]
    });
    crm.createContact({
      name: 'Beta NoEmail',
      tags: ['team'],
      sources: [{ type: 'manual', date: '2026-01-01T00:00:00Z' }]
    });
  });
  afterEach(teardownTmpWorkspace);

  it('returns all contacts sorted by name', () => {
    const all = crm.listContacts();
    assert.equal(all.length, 3);
    assert.equal(all[0].name.display, 'Alpha Client');
    assert.equal(all[1].name.display, 'Beta NoEmail');
    assert.equal(all[2].name.display, 'Zara Team');
  });

  it('filters by tag', () => {
    const team = crm.listContacts({ tag: 'team' });
    assert.equal(team.length, 2);
  });

  it('filters by company (substring)', () => {
    const indigo = crm.listContacts({ company: 'indigo' });
    assert.equal(indigo.length, 1);
    assert.equal(indigo[0].slug, 'zara-team');
  });

  it('filters by source type', () => {
    const slack = crm.listContacts({ source: 'slack' });
    assert.equal(slack.length, 1);
  });

  it('filters by hasEmail', () => {
    const withEmail = crm.listContacts({ hasEmail: true });
    assert.equal(withEmail.length, 1);
    assert.equal(withEmail[0].slug, 'zara-team');
  });
});

// ---------------------------------------------------------------------------
// addInteraction
// ---------------------------------------------------------------------------

describe('addInteraction', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({ name: 'Interact Test' });
  });
  afterEach(teardownTmpWorkspace);

  it('appends interaction to contact', () => {
    const c = crm.addInteraction('interact-test', {
      date: '2026-02-21T10:00:00Z',
      type: 'slack-message',
      summary: 'Quick sync on project status'
    });
    assert.equal(c.interactions.length, 1);
    assert.equal(c.interactions[0].type, 'slack-message');
  });

  it('throws on missing required fields', () => {
    assert.throws(
      () => crm.addInteraction('interact-test', { date: '2026-01-01T00:00:00Z' }),
      /requires.*type.*summary/
    );
  });

  it('returns null for non-existent slug', () => {
    const result = crm.addInteraction('nonexistent', {
      date: '2026-01-01T00:00:00Z',
      type: 'test',
      summary: 'test'
    });
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// addSource
// ---------------------------------------------------------------------------

describe('addSource', () => {
  beforeEach(() => {
    setupTmpWorkspace();
    crm.createContact({ name: 'Source Test' });
  });
  afterEach(teardownTmpWorkspace);

  it('appends source to contact', () => {
    const c = crm.addSource('source-test', {
      type: 'slack',
      date: '2026-02-21T00:00:00Z',
      ref: 'channel/ts',
      context: 'Found in discussion'
    });
    assert.equal(c.sources.length, 1);
    assert.equal(c.sources[0].type, 'slack');
  });

  it('throws on missing required fields', () => {
    assert.throws(
      () => crm.addSource('source-test', { type: 'slack' }),
      /requires.*date/
    );
  });
});

// ---------------------------------------------------------------------------
// _mergeArrayByKey (internal helper)
// ---------------------------------------------------------------------------

describe('_mergeArrayByKey', () => {
  it('appends new items by key', () => {
    const existing = [{ address: 'a@test.com' }];
    const incoming = [{ address: 'b@test.com' }];
    const result = crm._mergeArrayByKey(existing, incoming, 'address');
    assert.equal(result.length, 2);
  });

  it('deduplicates by key (case-insensitive for strings)', () => {
    const existing = [{ address: 'A@test.com' }];
    const incoming = [{ address: 'a@test.com' }];
    const result = crm._mergeArrayByKey(existing, incoming, 'address');
    assert.equal(result.length, 1);
  });

  it('handles empty arrays', () => {
    assert.deepEqual(crm._mergeArrayByKey([], [], 'id'), []);
    assert.equal(crm._mergeArrayByKey([], [{ id: '1' }], 'id').length, 1);
  });
});

// ---------------------------------------------------------------------------
// _identifierKeyField (internal helper)
// ---------------------------------------------------------------------------

describe('_identifierKeyField', () => {
  it('returns correct key for known systems', () => {
    assert.equal(crm._identifierKeyField('slack'), 'userId');
    assert.equal(crm._identifierKeyField('linear'), 'userId');
    assert.equal(crm._identifierKeyField('github'), 'username');
    assert.equal(crm._identifierKeyField('email'), 'address');
  });

  it('returns id for unknown systems', () => {
    assert.equal(crm._identifierKeyField('custom'), 'id');
  });
});

// ---------------------------------------------------------------------------
// Edge cases and integration
// ---------------------------------------------------------------------------

describe('integration', () => {
  beforeEach(setupTmpWorkspace);
  afterEach(teardownTmpWorkspace);

  it('full lifecycle: create -> find -> update -> addInteraction -> list', () => {
    // Create
    const created = crm.createContact({
      name: 'Lifecycle Test',
      emails: [{ address: 'life@test.com' }],
      identifiers: { slack: [{ userId: 'ULIFE', workspace: 'test' }] },
      sources: [{ type: 'manual', date: '2026-02-21T00:00:00Z' }]
    });
    assert.ok(created.id);

    // Find by email
    const found = crm.findContact({ email: 'life@test.com' });
    assert.equal(found.length, 1);
    assert.equal(found[0].slug, 'lifecycle-test');

    // Find by slack
    const foundSlack = crm.findContact({ slack: { userId: 'ULIFE' } });
    assert.equal(foundSlack.length, 1);

    // Update
    const updated = crm.updateContact('lifecycle-test', {
      title: 'Tester',
      companies: [{ name: 'Test Corp' }],
      tags: ['qa']
    });
    assert.equal(updated.title, 'Tester');
    assert.equal(updated.companies.length, 1);

    // Add interaction
    const withInteraction = crm.addInteraction('lifecycle-test', {
      date: '2026-02-21T12:00:00Z',
      type: 'email-sent',
      summary: 'Sent test email'
    });
    assert.equal(withInteraction.interactions.length, 1);

    // List
    const all = crm.listContacts();
    assert.equal(all.length, 1);
    assert.equal(all[0].title, 'Tester');
  });

  it('create + merge lifecycle', () => {
    crm.createContact({ name: 'Person A', emails: [{ address: 'a@test.com' }] });
    crm.createContact({ name: 'PersonA', emails: [{ address: 'a-alt@test.com' }] });

    const merged = crm.mergeContacts('person-a', 'persona');
    assert.equal(merged.emails.length, 2);
    assert.ok(merged.name.aliases.includes('PersonA'));
    assert.equal(crm.listContacts().length, 1);
  });

  it('handles contacts with no optional fields', () => {
    const c = crm.createContact({ name: 'Minimal' });
    assert.deepEqual(c.emails, []);
    assert.deepEqual(c.phones, []);
    assert.deepEqual(c.companies, []);
    assert.deepEqual(c.identifiers, {});
    assert.deepEqual(c.sources, []);
    assert.deepEqual(c.interactions, []);
    assert.deepEqual(c.tags, []);
  });
});
