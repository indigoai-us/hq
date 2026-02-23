#!/usr/bin/env node

/**
 * Seed CRM from existing HQ people data.
 *
 * Reads contacts from:
 *   1. knowledge/integrations/slack.md  (Quick Lookup Directory)
 *   2. knowledge/integrations/linear.md (Key Users table)
 *   3. agents.md                        (self-contact)
 *
 * Merges identifiers where people appear in multiple sources (matched by name).
 * Idempotent: running twice does not create duplicates.
 *
 * Usage:
 *   node scripts/seed-crm.js                     # Seed using C:\hq as workspace root
 *   CRM_WORKSPACE_ROOT=C:/repos/hq node scripts/seed-crm.js  # Custom workspace root
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration: resolve HQ root
// ---------------------------------------------------------------------------

/**
 * Resolve the HQ root directory.
 * Priority: explicit parameter > CRM_WORKSPACE_ROOT env > HQ_ROOT env > C:/hq
 */
function resolveHQRoot(explicitRoot) {
  return explicitRoot || process.env.CRM_WORKSPACE_ROOT || process.env.HQ_ROOT || 'C:/hq';
}

/**
 * Load the CRM utility library from the best available location.
 * Tries: source repo (relative to this script) > installed HQ > explicit root.
 */
function loadCRM(hqRoot) {
  const sourceLibPath = path.join(__dirname, '..', '.claude', 'lib', 'crm.js');
  const installedLibPath = path.join(hqRoot, '.claude', 'lib', 'crm.js');

  let crmModule;
  if (fs.existsSync(sourceLibPath)) {
    crmModule = require(sourceLibPath);
  } else {
    crmModule = require(installedLibPath);
  }
  crmModule.setWorkspaceRoot(hqRoot);
  return crmModule;
}

// ---------------------------------------------------------------------------
// Markdown table parser
// ---------------------------------------------------------------------------

/**
 * Parse a Markdown table into an array of row objects.
 * Expects: | Header1 | Header2 | ... |
 *          |---------|---------|-----|
 *          | val1    | val2    | ... |
 */
function parseMarkdownTable(lines) {
  if (lines.length < 2) return [];

  // Extract headers from first line
  const headerLine = lines[0];
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  // Skip separator line (index 1)
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.startsWith('|')) continue;

    const cells = line
      .split('|')
      .map(c => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length); // trim empty leading/trailing splits

    if (cells.length === 0) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] || '').trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Extract table lines starting from a header pattern.
 * Returns lines from the header row through all subsequent table rows.
 */
function extractTableAfter(content, headerPattern) {
  const lines = content.split('\n');
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(headerPattern)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return [];

  const tableLines = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      tableLines.push(line);
    } else if (tableLines.length > 0) {
      break; // End of table
    }
  }

  return tableLines;
}

// ---------------------------------------------------------------------------
// Source 1: Slack knowledge file
// ---------------------------------------------------------------------------

function parseSlackContacts(hqRoot) {
  const slackPath = path.join(hqRoot, 'knowledge', 'integrations', 'slack.md');
  if (!fs.existsSync(slackPath)) {
    console.log('  SKIP: knowledge/integrations/slack.md not found');
    return [];
  }

  const content = fs.readFileSync(slackPath, 'utf-8');
  const contacts = [];

  // Parse Indigo people table
  const indigoLines = extractTableAfterSection(content, '### Indigo', 'People');
  if (indigoLines.length > 0) {
    const rows = parseMarkdownTable(indigoLines);
    for (const row of rows) {
      const name = row['Name'];
      if (!name) continue;

      const userId = row['User ID'] || '';
      const dmChannel = row['DM Channel'] || '';
      const notes = row['Notes'] || '';

      contacts.push({
        name,
        workspace: 'indigo-ai',
        teamId: 'T043AC36YE4',
        userId,
        dmChannel: dmChannel === '--' ? '' : dmChannel,
        notes,
        isSelf: notes.toLowerCase().includes('self')
      });
    }
  }

  // Parse FrogBear people table
  const frogbearLines = extractTableAfterSection(content, '### FrogBear', 'People');
  if (frogbearLines.length > 0) {
    const rows = parseMarkdownTable(frogbearLines);
    for (const row of rows) {
      const name = row['Name'];
      if (!name) continue;

      const userId = row['User ID'] || '';
      const dmChannel = row['DM Channel'] || '';
      const notes = row['Notes'] || '';

      contacts.push({
        name,
        workspace: 'frogbearventures',
        teamId: 'T08RUDAR21X',
        userId,
        dmChannel: dmChannel === '--' ? '' : dmChannel,
        notes,
        isSelf: notes.toLowerCase().includes('self')
      });
    }
  }

  return contacts;
}

/**
 * Extract the People table under a specific section heading within the
 * Quick Lookup Directory section.
 *
 * The Slack knowledge file has multiple ### Indigo sections (Tokens and
 * Quick Lookup). We first locate "## Quick Lookup Directory", then search
 * within that section for the matching ### heading and **People:** label.
 */
function extractTableAfterSection(content, sectionHeading, tableLabel) {
  const lines = content.split('\n');

  // Step 1: Find the "## Quick Lookup Directory" section boundaries
  let qlStart = -1;
  let qlEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## Quick Lookup Directory')) {
      qlStart = i;
      continue;
    }
    // Next ## heading after Quick Lookup Directory marks the end
    if (qlStart !== -1 && line.startsWith('## ') && i > qlStart) {
      qlEnd = i;
      break;
    }
  }

  if (qlStart === -1) return [];

  // Step 2: Within Quick Lookup Directory, find the matching ### heading
  let inSection = false;
  let foundLabel = false;

  for (let i = qlStart; i < qlEnd; i++) {
    const line = lines[i].trim();

    // Look for section heading (e.g., "### Indigo" matches "### Indigo (`$SLACK_USER_TOKEN`)")
    if (line.startsWith(sectionHeading)) {
      inSection = true;
      continue;
    }

    // If we find another ### heading, stop
    if (inSection && line.startsWith('### ') && !line.startsWith(sectionHeading)) {
      break;
    }

    // Look for the **People:** or **Channels:** label
    if (inSection && line.includes(`**${tableLabel}:**`)) {
      foundLabel = true;
      continue;
    }

    // Once we found the label, collect the table
    if (foundLabel && line.startsWith('|')) {
      const tableLines = [];
      for (let j = i; j < qlEnd; j++) {
        const tl = lines[j].trim();
        if (tl.startsWith('|')) {
          tableLines.push(tl);
        } else if (tableLines.length > 0) {
          break;
        }
      }
      return tableLines;
    }

    // Stop if we hit another label after our target
    if (foundLabel && line.startsWith('**') && !line.includes(`**${tableLabel}:**`)) {
      break;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Source 2: Linear knowledge file
// ---------------------------------------------------------------------------

function parseLinearContacts(hqRoot) {
  const linearPath = path.join(hqRoot, 'knowledge', 'integrations', 'linear.md');
  if (!fs.existsSync(linearPath)) {
    console.log('  SKIP: knowledge/integrations/linear.md not found');
    return [];
  }

  const content = fs.readFileSync(linearPath, 'utf-8');
  const tableLines = extractTableAfter(content, '| Name | ID | Display Name');
  if (tableLines.length === 0) {
    console.log('  SKIP: No Key Users table found in linear.md');
    return [];
  }

  const rows = parseMarkdownTable(tableLines);
  const contacts = [];

  for (const row of rows) {
    const name = row['Name'];
    if (!name) continue;

    const userId = row['ID'] || '';
    const displayName = row['Display Name'] || '';
    const profileUrl = row['Profile URL'] || '';

    // Skip placeholder entries
    if (displayName === '\u2014' || displayName === '--') {
      contacts.push({
        name,
        workspace: 'indigo-ai',
        userId,
        displayName: '',
        profileUrl: profileUrl === '\u2014' || profileUrl === '--' ? '' : profileUrl
      });
    } else {
      contacts.push({
        name,
        workspace: 'indigo-ai',
        userId,
        displayName,
        profileUrl: profileUrl === '\u2014' || profileUrl === '--' ? '' : profileUrl
      });
    }
  }

  return contacts;
}

// ---------------------------------------------------------------------------
// Source 3: agents.md (self-profile)
// ---------------------------------------------------------------------------

function parseSelfProfile(hqRoot) {
  const agentsPath = path.join(hqRoot, 'agents.md');
  if (!fs.existsSync(agentsPath)) {
    console.log('  SKIP: agents.md not found');
    return null;
  }

  const content = fs.readFileSync(agentsPath, 'utf-8');

  // Extract name
  const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim() : 'Stefan';

  // Extract role
  const roleMatch = content.match(/\*\*Role:\*\*\s*(.+)/);
  const role = roleMatch ? roleMatch[1].trim() : '';

  // Extract X/Twitter
  const twitterMatch = content.match(/@(\w+)\]\(https:\/\/x\.com\/(\w+)\)/);
  const twitterHandle = twitterMatch ? twitterMatch[2] : '';

  return {
    name,
    role,
    twitterHandle
  };
}

// ---------------------------------------------------------------------------
// Seeding logic
// ---------------------------------------------------------------------------

function seedCRM(rootOverride) {
  const HQ_ROOT = resolveHQRoot(rootOverride);
  const crm = loadCRM(HQ_ROOT);

  const now = new Date().toISOString();
  const migrationSource = {
    type: 'migration',
    date: now,
    context: 'Initial CRM seed from HQ knowledge files'
  };

  console.log('=== HQ CRM Seeder ===');
  console.log(`Workspace root: ${HQ_ROOT}`);
  console.log('');

  // Ensure contacts directory exists
  const contactsDir = path.join(HQ_ROOT, 'workspace', 'crm', 'contacts');
  if (!fs.existsSync(contactsDir)) {
    fs.mkdirSync(contactsDir, { recursive: true });
    console.log(`Created: ${contactsDir}`);
  }

  // Track stats
  let created = 0;
  let merged = 0;
  let skipped = 0;

  // Build a name-keyed map for merging across sources
  // Key: lowercase display name -> contact data being built
  const contactMap = new Map();

  // ------------------------------------------------------------------
  // Phase 1: Parse Slack contacts
  // ------------------------------------------------------------------
  console.log('\n--- Phase 1: Slack contacts ---');
  const slackContacts = parseSlackContacts(HQ_ROOT);
  console.log(`  Found ${slackContacts.length} Slack entries`);

  for (const sc of slackContacts) {
    const key = sc.name.toLowerCase();
    const slackIdent = {
      workspace: sc.workspace,
      userId: sc.userId,
      ...(sc.dmChannel ? { dmChannel: sc.dmChannel } : {}),
      ...(sc.teamId ? {} : {}) // teamId is workspace metadata, not per-identifier
    };

    if (contactMap.has(key)) {
      // Merge Slack identifiers into existing
      const existing = contactMap.get(key);
      existing.identifiers.slack = existing.identifiers.slack || [];
      // Only add if this workspace/userId combo is not already present
      const isDuplicate = existing.identifiers.slack.some(
        s => s.userId === sc.userId && s.workspace === sc.workspace
      );
      if (!isDuplicate) {
        existing.identifiers.slack.push(slackIdent);
      }
      if (sc.notes && !sc.isSelf) {
        existing.notes = existing.notes
          ? `${existing.notes}; ${sc.notes}`
          : sc.notes;
      }
    } else {
      contactMap.set(key, {
        name: sc.name,
        identifiers: {
          slack: [slackIdent]
        },
        sources: [{
          ...migrationSource,
          ref: 'knowledge/integrations/slack.md'
        }],
        notes: sc.notes && !sc.isSelf ? sc.notes : '',
        isSelf: sc.isSelf,
        tags: []
      });
    }
  }

  // ------------------------------------------------------------------
  // Phase 2: Parse Linear contacts and merge
  // ------------------------------------------------------------------
  console.log('\n--- Phase 2: Linear contacts ---');
  const linearContacts = parseLinearContacts(HQ_ROOT);
  console.log(`  Found ${linearContacts.length} Linear entries`);

  for (const lc of linearContacts) {
    const key = lc.name.toLowerCase();
    const linearIdent = {
      workspace: lc.workspace,
      userId: lc.userId,
      ...(lc.displayName ? { displayName: lc.displayName } : {})
    };

    if (contactMap.has(key)) {
      // Merge Linear identifiers
      const existing = contactMap.get(key);
      existing.identifiers.linear = existing.identifiers.linear || [];
      const isDuplicate = existing.identifiers.linear.some(
        l => l.userId === lc.userId
      );
      if (!isDuplicate) {
        existing.identifiers.linear.push(linearIdent);
      }
      // If this source hasn't been added yet, add it
      const hasLinearSource = existing.sources.some(s => s.ref === 'knowledge/integrations/linear.md');
      if (!hasLinearSource) {
        existing.sources.push({
          ...migrationSource,
          ref: 'knowledge/integrations/linear.md'
        });
      }
      merged++;
    } else {
      contactMap.set(key, {
        name: lc.name,
        identifiers: {
          linear: [linearIdent]
        },
        sources: [{
          ...migrationSource,
          ref: 'knowledge/integrations/linear.md'
        }],
        notes: '',
        isSelf: false,
        tags: []
      });
    }
  }

  // ------------------------------------------------------------------
  // Phase 3: Parse self-profile from agents.md
  // ------------------------------------------------------------------
  console.log('\n--- Phase 3: Self-profile (agents.md) ---');
  const selfProfile = parseSelfProfile(HQ_ROOT);

  if (selfProfile) {
    console.log(`  Found self: ${selfProfile.name} (${selfProfile.role})`);

    // Find the existing Stefan entry (may already have Slack + Linear ids)
    const selfKey = selfProfile.name.toLowerCase();
    // Also try "stefan johnson" since Slack has full name
    const fullNameKey = 'stefan johnson';

    let selfEntry = contactMap.get(fullNameKey) || contactMap.get(selfKey);
    let usedKey = contactMap.has(fullNameKey) ? fullNameKey : selfKey;

    if (selfEntry) {
      // Enhance existing entry with self-profile data
      selfEntry.isSelf = true;
      selfEntry.tags = [...new Set([...(selfEntry.tags || []), 'self'])];
      if (selfProfile.role) {
        selfEntry.title = selfProfile.role;
      }
      if (selfProfile.twitterHandle) {
        selfEntry.identifiers.twitter = selfEntry.identifiers.twitter || [];
        const hasTwit = selfEntry.identifiers.twitter.some(t => t.handle === selfProfile.twitterHandle);
        if (!hasTwit) {
          selfEntry.identifiers.twitter.push({ handle: selfProfile.twitterHandle });
        }
      }
      // Add agents.md as source
      const hasAgentsSource = selfEntry.sources.some(s => s.ref === 'agents.md');
      if (!hasAgentsSource) {
        selfEntry.sources.push({
          ...migrationSource,
          ref: 'agents.md'
        });
      }
    } else {
      // Create new self entry
      contactMap.set(selfKey, {
        name: selfProfile.name,
        identifiers: {
          ...(selfProfile.twitterHandle ? { twitter: [{ handle: selfProfile.twitterHandle }] } : {})
        },
        sources: [{
          ...migrationSource,
          ref: 'agents.md'
        }],
        notes: '',
        isSelf: true,
        title: selfProfile.role,
        tags: ['self']
      });
    }
  }

  // ------------------------------------------------------------------
  // Phase 4: Write contacts to CRM
  // ------------------------------------------------------------------
  console.log('\n--- Phase 4: Writing contacts ---');

  for (const [key, data] of contactMap) {
    const slug = crm.slugify(data.name);

    // Check if contact already exists (idempotency)
    const existing = crm.readContact(slug);
    if (existing) {
      console.log(`  SKIP (exists): ${data.name} -> ${slug}.json`);
      skipped++;
      continue;
    }

    // Build contact data
    const contactData = {
      name: data.name,
      identifiers: data.identifiers || {},
      sources: data.sources || [],
      tags: data.tags || [],
      notes: data.notes || ''
    };

    if (data.title) {
      contactData.title = data.title;
    }

    // Determine companies from context
    const companies = inferCompanies(data);
    if (companies.length > 0) {
      contactData.companies = companies;
    }

    try {
      const contact = crm.createContact(contactData);
      console.log(`  CREATE: ${data.name} -> ${slug}.json`);
      created++;
    } catch (err) {
      console.error(`  ERROR: ${data.name}: ${err.message}`);
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('\n=== Seed Complete ===');
  console.log(`  Created: ${created}`);
  console.log(`  Merged across sources: ${merged}`);
  console.log(`  Skipped (already exist): ${skipped}`);
  console.log(`  Total contacts: ${created + skipped}`);

  return { created, merged, skipped };
}

/**
 * Infer company affiliations from Slack workspace and other context.
 */
function inferCompanies(data) {
  const companies = [];
  const seen = new Set();

  if (data.identifiers && data.identifiers.slack) {
    for (const s of data.identifiers.slack) {
      if (s.workspace === 'indigo-ai' && !seen.has('Indigo')) {
        companies.push({ name: 'Indigo', current: true });
        seen.add('Indigo');
      }
      if (s.workspace === 'frogbearventures' && !seen.has('FrogBear')) {
        companies.push({ name: 'FrogBear', current: true });
        seen.add('FrogBear');
      }
    }
  }

  if (data.identifiers && data.identifiers.linear) {
    for (const l of data.identifiers.linear) {
      if (l.workspace === 'indigo-ai' && !seen.has('Indigo')) {
        companies.push({ name: 'Indigo', current: true });
        seen.add('Indigo');
      }
    }
  }

  return companies;
}

// ---------------------------------------------------------------------------
// Slack knowledge file update
// ---------------------------------------------------------------------------

/**
 * Extract ### subsections from the Quick Lookup Directory, preserving
 * only the channel tables (removing people tables).
 */
function extractChannelSubsections(qlSection) {
  const lines = qlSection.split('\n');
  const subsections = [];
  let current = null;
  let inChannels = false;
  let inPeople = false;
  let channelLines = [];
  let extraLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const trimmed = line.trim();

    // New ### subsection
    if (trimmed.startsWith('### ')) {
      // Save previous subsection
      if (current) {
        current.channels = channelLines.length > 0 ? channelLines.join('\n') : '';
        current.extra = extraLines.join('\n').trim();
        subsections.push(current);
      }
      current = { heading: trimmed };
      channelLines = [];
      extraLines = [];
      inChannels = false;
      inPeople = false;
      continue;
    }

    if (!current) continue;

    // Detect **People:** or **Channels:** labels
    if (trimmed.includes('**People:**')) {
      inPeople = true;
      inChannels = false;
      continue;
    }
    if (trimmed.includes('**Channels:**')) {
      inChannels = true;
      inPeople = false;
      continue;
    }

    // Collect table lines
    if (trimmed.startsWith('|')) {
      if (inChannels) {
        channelLines.push(trimmed);
      }
      // Skip people table lines
      continue;
    }

    // Non-table, non-label content after the subsection heading
    if (!inPeople && !inChannels && !trimmed.startsWith('|')) {
      if (trimmed || extraLines.length > 0) {
        extraLines.push(trimmed);
      }
    }
  }

  // Save last subsection
  if (current) {
    current.channels = channelLines.length > 0 ? channelLines.join('\n') : '';
    current.extra = extraLines.join('\n').trim();
    subsections.push(current);
  }

  return subsections;
}

function updateSlackKnowledgeFile(rootOverride) {
  const HQ_ROOT = resolveHQRoot(rootOverride);
  const slackPath = path.join(HQ_ROOT, 'knowledge', 'integrations', 'slack.md');
  if (!fs.existsSync(slackPath)) return;

  let content = fs.readFileSync(slackPath, 'utf-8');

  // Check if already updated (idempotency)
  if (content.includes('People data now lives in workspace/crm/contacts/')) {
    console.log('\nSlack knowledge file already updated. Skipping.');
    return;
  }

  // Extract the Quick Lookup Directory section
  const quickLookupStart = content.indexOf('## Quick Lookup Directory');
  if (quickLookupStart === -1) {
    console.log('\nWARNING: Could not find Quick Lookup Directory in slack.md');
    return;
  }

  // Find the next ## section after Quick Lookup Directory
  const afterStart = content.indexOf('\n## ', quickLookupStart + 1);
  const sectionEnd = afterStart === -1 ? content.length : afterStart;
  const qlSection = content.substring(quickLookupStart, sectionEnd);

  // Extract existing ### subsections with their channel tables (preserve channels, remove people)
  const subsections = extractChannelSubsections(qlSection);

  // Build replacement
  let replacementNote = `## Quick Lookup Directory

> **People data now lives in workspace/crm/contacts/.** Use CRM utilities for lookups.
>
> \`\`\`javascript
> const crm = require('./.claude/lib/crm.js');
> // Find by name
> crm.findContact({ name: 'Corey' });
> // Find by Slack user ID
> crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });
> // Find by email
> crm.findContact({ email: 'corey@getindigo.ai' });
> \`\`\`
>
> Channel IDs are still listed below for quick reference.
`;

  for (const sub of subsections) {
    replacementNote += `\n${sub.heading}\n`;
    if (sub.channels) {
      replacementNote += `\n**Channels:**\n\n${sub.channels}\n`;
    }
    if (sub.extra) {
      replacementNote += `\n${sub.extra}\n`;
    }
  }

  content = content.substring(0, quickLookupStart) + replacementNote + content.substring(sectionEnd);

  fs.writeFileSync(slackPath, content, 'utf-8');
  console.log('\nUpdated: knowledge/integrations/slack.md (people tables replaced with CRM redirect)');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    const result = seedCRM();
    if (result.created > 0) {
      updateSlackKnowledgeFile();
    }
    process.exit(0);
  } catch (err) {
    console.error('FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { seedCRM, updateSlackKnowledgeFile, parseSlackContacts, parseLinearContacts, parseSelfProfile };
