/**
 * Tests for the CRM seed script.
 *
 * Tests parsing of Slack knowledge file, Linear knowledge file,
 * agents.md, and the seeding/idempotency behavior.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Create a temporary directory for each test
let tmpDir;

function setupTestDir() {
  tmpDir = path.join(os.tmpdir(), `crm-seed-test-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(path.join(tmpDir, 'workspace', 'crm', 'contacts'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'knowledge', 'integrations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'knowledge', 'hq-core'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'lib'), { recursive: true });

  // Copy CRM library
  const crmSrc = path.join(__dirname, '..', '..', '.claude', 'lib', 'crm.js');
  const crmDst = path.join(tmpDir, '.claude', 'lib', 'crm.js');
  fs.copyFileSync(crmSrc, crmDst);
}

function teardownTestDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Load the seed module functions
const seedModule = require('../seed-crm.js');

// ---------------------------------------------------------------------------
// Test: parseSlackContacts
// ---------------------------------------------------------------------------

function testParseSlackContacts() {
  setupTestDir();
  try {
    // Write a test Slack knowledge file
    const slackContent = `# Slack Integration

## Quick Lookup Directory

### Indigo (\`$SLACK_USER_TOKEN\`)

**People:**

| Name | User ID | DM Channel | Notes |
|------|---------|------------|-------|
| Alice Smith | U001 | D001 | Team lead |
| Bob Jones | U002 | -- | Self |
| Charlie | U003 | | |

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|

### FrogBear (\`$FROGBEAR_SLACK_USER_TOKEN\`)

**People:**

| Name | User ID | DM Channel | Notes |
|------|---------|------------|-------|
| Dave Wilson | U010 | D010 | Co-founder |
| Bob Jones | U011 | -- | Self |

## API Patterns
`;

    fs.writeFileSync(
      path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'),
      slackContent
    );

    const contacts = seedModule.parseSlackContacts(tmpDir);

    // Should find 5 entries (3 Indigo + 2 FrogBear)
    console.assert(contacts.length === 5, `Expected 5 Slack contacts, got ${contacts.length}`);

    // Check first Indigo contact
    const alice = contacts.find(c => c.name === 'Alice Smith');
    console.assert(alice, 'Alice Smith not found');
    console.assert(alice.workspace === 'indigo-ai', `Alice workspace: ${alice.workspace}`);
    console.assert(alice.userId === 'U001', `Alice userId: ${alice.userId}`);
    console.assert(alice.dmChannel === 'D001', `Alice dmChannel: ${alice.dmChannel}`);
    console.assert(alice.notes === 'Team lead', `Alice notes: ${alice.notes}`);
    console.assert(!alice.isSelf, 'Alice should not be self');

    // Check self contact (-- means no DM channel)
    const bobIndigo = contacts.find(c => c.name === 'Bob Jones' && c.workspace === 'indigo-ai');
    console.assert(bobIndigo, 'Bob (Indigo) not found');
    console.assert(bobIndigo.dmChannel === '', `Bob dmChannel should be empty, got: ${bobIndigo.dmChannel}`);
    console.assert(bobIndigo.isSelf, 'Bob should be self');

    // Check empty DM channel (blank cell)
    const charlie = contacts.find(c => c.name === 'Charlie');
    console.assert(charlie, 'Charlie not found');
    console.assert(charlie.dmChannel === '', `Charlie dmChannel should be empty, got: ${charlie.dmChannel}`);

    // Check FrogBear contact
    const dave = contacts.find(c => c.name === 'Dave Wilson');
    console.assert(dave, 'Dave Wilson not found');
    console.assert(dave.workspace === 'frogbearventures', `Dave workspace: ${dave.workspace}`);
    console.assert(dave.dmChannel === 'D010', `Dave dmChannel: ${dave.dmChannel}`);

    // Check Bob appears in both workspaces
    const bobs = contacts.filter(c => c.name === 'Bob Jones');
    console.assert(bobs.length === 2, `Expected 2 Bob entries, got ${bobs.length}`);

    console.log('  PASS: parseSlackContacts');
  } catch (err) {
    console.error('  FAIL: parseSlackContacts -', err.message);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Test: parseLinearContacts
// ---------------------------------------------------------------------------

function testParseLinearContacts() {
  setupTestDir();
  try {
    const linearContent = `# Linear Integration

## Key Users

| Name | ID | Display Name | Profile URL |
|------|-----|-------------|-------------|
| Stefan Johnson | 0f41fe7e-test | therealstefan | https://linear.app/indigo-ai/profiles/therealstefan |
| Corey Epstein | be96bce2-test | corey1 | https://linear.app/indigo-ai/profiles/corey1 |
| Yousuf Kalim | 308407ca-test | -- | -- |
`;

    fs.writeFileSync(
      path.join(tmpDir, 'knowledge', 'integrations', 'linear.md'),
      linearContent
    );

    const contacts = seedModule.parseLinearContacts(tmpDir);

    console.assert(contacts.length === 3, `Expected 3 Linear contacts, got ${contacts.length}`);

    const stefan = contacts.find(c => c.name === 'Stefan Johnson');
    console.assert(stefan, 'Stefan not found');
    console.assert(stefan.userId === '0f41fe7e-test', `Stefan userId: ${stefan.userId}`);
    console.assert(stefan.displayName === 'therealstefan', `Stefan displayName: ${stefan.displayName}`);
    console.assert(stefan.workspace === 'indigo-ai', `Stefan workspace: ${stefan.workspace}`);

    // Yousuf has -- for display name (should be empty string)
    const yousuf = contacts.find(c => c.name === 'Yousuf Kalim');
    console.assert(yousuf, 'Yousuf not found');
    console.assert(yousuf.displayName === '', `Yousuf displayName should be empty, got: "${yousuf.displayName}"`);

    console.log('  PASS: parseLinearContacts');
  } catch (err) {
    console.error('  FAIL: parseLinearContacts -', err.message);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Test: parseSelfProfile
// ---------------------------------------------------------------------------

function testParseSelfProfile() {
  setupTestDir();
  try {
    const agentsContent = `# Stefan - Agent Profile

## Identity
- **Name:** Stefan
- **Role:** Software Engineer

## Social
- X/Twitter: [@sfstefan](https://x.com/sfstefan)
`;

    fs.writeFileSync(path.join(tmpDir, 'agents.md'), agentsContent);

    const profile = seedModule.parseSelfProfile(tmpDir);

    console.assert(profile, 'Profile should not be null');
    console.assert(profile.name === 'Stefan', `Name: ${profile.name}`);
    console.assert(profile.role === 'Software Engineer', `Role: ${profile.role}`);
    console.assert(profile.twitterHandle === 'sfstefan', `Twitter: ${profile.twitterHandle}`);

    console.log('  PASS: parseSelfProfile');
  } catch (err) {
    console.error('  FAIL: parseSelfProfile -', err.message);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Test: Full seed idempotency
// ---------------------------------------------------------------------------

function testSeedIdempotency() {
  setupTestDir();
  try {
    // Set up all knowledge files
    const slackContent = `# Slack Integration

## Quick Lookup Directory

### Indigo (\`$SLACK_USER_TOKEN\`)

**People:**

| Name | User ID | DM Channel | Notes |
|------|---------|------------|-------|
| Alice Smith | U001 | D001 | Team lead |

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|

### Synesis (not yet configured)

## API Patterns
`;
    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'), slackContent);
    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'integrations', 'linear.md'), '# Linear\n');
    fs.writeFileSync(path.join(tmpDir, 'agents.md'), '# Agent\n- **Name:** Test\n- **Role:** Dev\n');

    // First run - pass explicit root
    const result1 = seedModule.seedCRM(tmpDir);
    console.assert(result1.created > 0, `First run should create contacts, got ${result1.created}`);

    const firstCount = fs.readdirSync(path.join(tmpDir, 'workspace', 'crm', 'contacts'))
      .filter(f => f.endsWith('.json')).length;

    // Second run (should not create duplicates)
    const result2 = seedModule.seedCRM(tmpDir);
    console.assert(result2.created === 0, `Second run should create 0, got ${result2.created}`);
    console.assert(result2.skipped > 0, `Second run should skip > 0, got ${result2.skipped}`);

    const secondCount = fs.readdirSync(path.join(tmpDir, 'workspace', 'crm', 'contacts'))
      .filter(f => f.endsWith('.json')).length;

    console.assert(firstCount === secondCount, `File count changed: ${firstCount} -> ${secondCount}`);

    console.log('  PASS: seedIdempotency');
  } catch (err) {
    console.error('  FAIL: seedIdempotency -', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Test: Cross-source merge (Slack + Linear same person)
// ---------------------------------------------------------------------------

function testCrossSourceMerge() {
  setupTestDir();
  try {
    const slackContent = `# Slack Integration

## Quick Lookup Directory

### Indigo (\`$SLACK_USER_TOKEN\`)

**People:**

| Name | User ID | DM Channel | Notes |
|------|---------|------------|-------|
| Alice Smith | U001 | D001 | Engineer |

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|

## API Patterns
`;
    const linearContent = `# Linear

## Key Users

| Name | ID | Display Name | Profile URL |
|------|-----|-------------|-------------|
| Alice Smith | uuid-alice | alice1 | https://linear.app/test/profiles/alice1 |
`;

    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'), slackContent);
    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'integrations', 'linear.md'), linearContent);
    fs.writeFileSync(path.join(tmpDir, 'agents.md'), '# Agent\n- **Name:** Test\n');

    const result = seedModule.seedCRM(tmpDir);

    // Alice should be created once (Slack + Linear merged)
    const contactFiles = fs.readdirSync(path.join(tmpDir, 'workspace', 'crm', 'contacts'))
      .filter(f => f.endsWith('.json'));

    const aliceFile = contactFiles.find(f => f === 'alice-smith.json');
    console.assert(aliceFile, `alice-smith.json should exist. Files: ${contactFiles.join(', ')}`);

    const alice = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'workspace', 'crm', 'contacts', 'alice-smith.json'), 'utf-8')
    );

    // Should have both Slack and Linear identifiers
    console.assert(alice.identifiers.slack && alice.identifiers.slack.length === 1, 'Alice should have 1 Slack identifier');
    console.assert(alice.identifiers.linear && alice.identifiers.linear.length === 1, 'Alice should have 1 Linear identifier');
    console.assert(alice.identifiers.slack[0].userId === 'U001', 'Slack userId should be U001');
    console.assert(alice.identifiers.linear[0].userId === 'uuid-alice', 'Linear userId should be uuid-alice');

    // Should have 2 sources (slack + linear)
    console.assert(alice.sources.length === 2, `Expected 2 sources, got ${alice.sources.length}`);

    console.log('  PASS: crossSourceMerge');
  } catch (err) {
    console.error('  FAIL: crossSourceMerge -', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Test: Slack file gets updated with CRM redirect
// ---------------------------------------------------------------------------

function testSlackFileUpdate() {
  setupTestDir();
  try {
    const slackContent = `# Slack Integration

## Quick Lookup Directory

### Indigo (\`$SLACK_USER_TOKEN\`)

**People:**

| Name | User ID | DM Channel | Notes |
|------|---------|------------|-------|
| Alice Smith | U001 | D001 | Engineer |

**Channels:**

| Channel | Channel ID | Notes |
|---------|------------|-------|
| #general | C001 | Main channel |

## API Patterns

Some API docs here.
`;

    fs.writeFileSync(path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'), slackContent);

    seedModule.updateSlackKnowledgeFile(tmpDir);

    const updated = fs.readFileSync(
      path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'),
      'utf-8'
    );

    // Should contain CRM redirect
    console.assert(
      updated.includes('People data now lives in workspace/crm/contacts/'),
      'Should contain CRM redirect note'
    );

    // Should preserve channels
    console.assert(
      updated.includes('#general'),
      'Should preserve channel entries'
    );

    // Should not contain the old people table
    console.assert(
      !updated.includes('Alice Smith'),
      'Should not contain old people table'
    );

    // Should still have API Patterns section
    console.assert(
      updated.includes('## API Patterns'),
      'Should preserve API Patterns section'
    );

    // Running again should be idempotent (skip)
    seedModule.updateSlackKnowledgeFile(tmpDir);
    const secondRun = fs.readFileSync(
      path.join(tmpDir, 'knowledge', 'integrations', 'slack.md'),
      'utf-8'
    );
    console.assert(updated === secondRun, 'Second run should not change the file');

    console.log('  PASS: slackFileUpdate');
  } catch (err) {
    console.error('  FAIL: slackFileUpdate -', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    teardownTestDir();
  }
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log('\nRunning seed-crm tests...\n');

testParseSlackContacts();
testParseLinearContacts();
testParseSelfProfile();
testSeedIdempotency();
testCrossSourceMerge();
testSlackFileUpdate();

console.log('\nDone.');
