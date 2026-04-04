/**
 * E2E: Dashboard views — validates all dashboard page modules exist,
 * export the right components, and the routing/layout structure is correct.
 *
 * Uses filesystem + module validation (consistent with existing vitest E2E pattern).
 * Browser-based tests can be added later with Playwright when the app is deployed.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_SRC = join(__dirname, '../../../apps/web/src');

describe('e2e: dashboard — navigation shell (US-001)', () => {
  it('Layout.tsx exists with sidebar navigation', () => {
    const layoutPath = join(WEB_SRC, 'components/Layout.tsx');
    expect(existsSync(layoutPath)).toBe(true);

    const content = readFileSync(layoutPath, 'utf-8');
    // Sidebar links present
    expect(content).toContain('Dashboard');
    expect(content).toContain('Files');
    expect(content).toContain('Workers');
    expect(content).toContain('Projects');
    expect(content).toContain('Team');
    expect(content).toContain('Settings');
    // Mobile hamburger menu
    expect(content).toContain('Open menu');
    // HQ branding
    expect(content).toContain('HQ by Indigo');
    // Uses Outlet for nested routing
    expect(content).toContain('Outlet');
  });

  it('App.tsx wraps protected routes in Layout with nested routing', () => {
    const appPath = join(WEB_SRC, 'App.tsx');
    const content = readFileSync(appPath, 'utf-8');

    // Layout import
    expect(content).toContain("import { Layout }");
    // Nested route pattern: Layout as parent element
    expect(content).toContain('<Layout />');
    // All page routes exist
    expect(content).toContain('"/workers"');
    expect(content).toContain('"/projects"');
    expect(content).toContain('"/team"');
    expect(content).toContain('"/settings"');
    expect(content).toContain('"/files/*"');
  });

  it('Dashboard.tsx no longer has inline header (Layout handles it)', () => {
    const dashPath = join(WEB_SRC, 'pages/Dashboard.tsx');
    const content = readFileSync(dashPath, 'utf-8');
    // Should not have the old sign out button or nav links in-page
    expect(content).not.toContain('signOut');
    expect(content).not.toContain('<header');
  });
});

describe('e2e: dashboard — worker registry view (US-002)', () => {
  it('Workers.tsx exists with required features', () => {
    const path = join(WEB_SRC, 'pages/Workers.tsx');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    // Fetches registry via getFile API
    expect(content).toContain('getFile');
    expect(content).toContain('registry.yaml');
    // Search/filter
    expect(content).toContain('Search workers');
    // Grouping by team
    expect(content).toContain('team');
    // Empty state
    expect(content).toContain('Sync your HQ to see workers');
    // Renders worker name and type badge
    expect(content).toContain('w.name');
    expect(content).toContain('w.type');
  });
});

describe('e2e: dashboard — project progress view (US-003)', () => {
  it('Projects.tsx exists with required features', () => {
    const path = join(WEB_SRC, 'pages/Projects.tsx');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    // Scans for prd.json files
    expect(content).toContain('prd.json');
    // Status badges
    expect(content).toContain('Not Started');
    expect(content).toContain('In Progress');
    expect(content).toContain('Complete');
    // Progress bar
    expect(content).toContain('bg-emerald-500');
    // Expandable story list
    expect(content).toContain('story.id');
    expect(content).toContain('story.title');
    // Empty state
    expect(content).toContain('No projects found');
  });
});

describe('e2e: dashboard — team management UI (US-004)', () => {
  it('Team.tsx exists with required features', () => {
    const path = join(WEB_SRC, 'pages/Team.tsx');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    // Team API calls
    expect(content).toContain('listTeams');
    expect(content).toContain('getTeamMembers');
    expect(content).toContain('createInvite');
    expect(content).toContain('removeMember');
    // Invite link display with CLI command
    expect(content).toContain('npx create-hq --join');
    // Copy to clipboard
    expect(content).toContain('clipboard');
    // Member roles
    expect(content).toContain('admin');
    expect(content).toContain('member');
    // Solo user CTA
    expect(content).toContain('Create a Team');
  });

  it('api.ts has team endpoint functions', () => {
    const apiPath = join(WEB_SRC, 'lib/api.ts');
    const content = readFileSync(apiPath, 'utf-8');

    expect(content).toContain('export async function listTeams');
    expect(content).toContain('export async function getTeamMembers');
    expect(content).toContain('export async function createInvite');
    expect(content).toContain('export async function removeMember');
    // Correct endpoints
    expect(content).toContain('/api/teams');
    expect(content).toContain('/api/teams/${teamId}/members');
    expect(content).toContain('/api/teams/${teamId}/invites');
  });
});
