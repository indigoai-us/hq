# Indigo App — User Stories (Draft)

Generated from app mapping (agent-browser + e2e test analysis) — 2026-03-10

---

## Legend
- **P0** — Core value prop, must work flawlessly
- **P1** — Important supporting feature
- **P2** — Nice to have, secondary flow
- **Existing E2E** — Already has Playwright/Jest coverage

---

## 1. Authentication & Onboarding

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 1.1 | As a new user, I can sign up via email/SSO and create an organization | P0 | Partial (login spec) |
| 1.2 | As a new user, I complete onboarding: confirm company → invite team → select calendars → start trial | P0 | **Yes** (onboarding.spec.ts) |
| 1.3 | As an invited user, I can accept an invite and complete a shortened onboarding (skip to calendar selection) | P1 | **Yes** (onboarding.spec.ts) |
| 1.4 | As a returning user, I can log in via Clerk (email/SSO) on webapp or desktop | P0 | **Yes** (auth.spec.ts) |
| 1.5 | As a desktop user, I can authenticate via browser OAuth bridge (deep link `indigo://auth`) | P0 | Partial |
| 1.6 | As a user with multiple accounts, I can add/switch/remove accounts in the desktop app | P1 | **Yes** (auth.spec.ts) |

---

## 2. Meeting Intelligence (Core Value Prop)

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 2.1 | As a user, I can connect my Google Calendar and see upcoming meetings on `/meetings` | P0 | No |
| 2.2 | As a user, when a calendar meeting starts, Recall.ai bot auto-joins and transcribes | P0 | No |
| 2.3 | As a user, I can view a meeting's full transcript with speaker attribution and timestamps | P0 | No |
| 2.4 | As a user, I can see auto-extracted insights from a meeting: decisions, actions, accomplishments, key facts | P0 | No |
| 2.5 | As a user, I can share a meeting page (public/private link) with my team | P1 | No |
| 2.6 | As a user, I can import past recordings from Fireflies | P2 | No |
| 2.7 | As a user, I can search across all my meetings by keyword | P1 | No |

---

## 3. AI Assistant / Chat (Core Value Prop)

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 3.1 | As a user, I can open a new chat and send a message to the AI assistant | P0 | **Yes** (assistant-chat.spec.ts) |
| 3.2 | As a user, the assistant responds using my configured AI model (OpenAI/Claude/Gemini/xAI) | P0 | Partial |
| 3.3 | As a user, the assistant can reference my meeting transcripts and signals in its responses | P0 | No |
| 3.4 | As a user, I can see my chat history in the sidebar, organized by date | P1 | No |
| 3.5 | As a user, I can pin, rename, and delete chat sessions | P1 | No |
| 3.6 | As a user, I can switch between different assistants (custom personas with meta-prompts) | P1 | No |
| 3.7 | As a user, I can trigger deep research mode for extended multi-step analysis | P1 | No |
| 3.8 | As a user, I can generate images through the assistant | P2 | No |
| 3.9 | As a user, I can view chain-of-thought reasoning in an insights panel | P1 | **Yes** (chain-of-thought.spec.ts) |

---

## 4. Commands

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 4.1 | As a user, I can browse my personal and team command libraries on `/commands` | P1 | No |
| 4.2 | As a user, I can create a custom command with a prompt, variables, and data sources | P1 | No |
| 4.3 | As a user, I can trigger commands via voice using the global shortcut (Alt/Option+I) | P1 | No |
| 4.4 | As a user, I can browse and install commands from the marketplace | P2 | No |
| 4.5 | As a user, I can edit an existing command's prompt and variables | P1 | **Yes** (commands-edit.spec.ts) |

---

## 5. Assistants Library

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 5.1 | As a user, I can create a new assistant with a name, description, meta-prompt, model, and tools | P1 | **Yes** (commands-edit.spec.ts) |
| 5.2 | As a user, I can edit an existing assistant's configuration | P1 | **Yes** |
| 5.3 | As a user, I can set team visibility for an assistant (personal vs. shared) | P2 | No |

---

## 6. Insights & Signals

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 6.1 | As a user, I can view the Decision Ledger with owner, timestamp, and source citation | P0 | No |
| 6.2 | As a user, I can browse insights filtered by time, owner, and type (decision/action/accomplishment/fact) | P1 | No |
| 6.3 | As a user, I can see trend and risk detection across meetings | P1 | No |
| 6.4 | As a user, I can click a citation to jump to the source meeting/email/doc | P1 | No |
| 6.5 | As a user, I receive a Daily Brief aggregating recent decisions, actions, and key facts | P1 | No |

---

## 7. Knowledge & Data

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 7.1 | As a user, I can connect Google Drive folders as a knowledge source | P1 | No |
| 7.2 | As a user, I can connect Gmail as a knowledge source | P1 | No |
| 7.3 | As a user, I can manage team data: snippets and variables on `/team-data` | P2 | No |
| 7.4 | As a user, I can browse my data library on `/data` | P2 | No |
| 7.5 | As a user, my personal and company data are properly isolated (RBAC) | P0 | No |

---

## 8. MCP & External Agent Access

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 8.1 | As a user, I can generate an MCP URL for connecting Claude Desktop to my Indigo data | P1 | No |
| 8.2 | As a user, external agents can query my signals, meetings, and taxonomy via MCP | P1 | No |
| 8.3 | As a user, MCP queries are tenant-isolated (I only see my org's data) | P0 | No |

---

## 9. Settings & Admin

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 9.1 | As an admin, I can manage organization members (invite, remove, roles) | P1 | No |
| 9.2 | As an admin, I can manage teams | P1 | No |
| 9.3 | As an admin, I can manage billing, view usage, and change subscription plan | P1 | No |
| 9.4 | As an admin, I can manage API keys for MCP access | P1 | No |
| 9.5 | As a user, I can update my profile settings | P2 | No |
| 9.6 | As a user, I can configure AI model preferences | P1 | No |
| 9.7 | As a user, I can manage Google integrations (Calendar, Drive, Gmail) | P1 | No |
| 9.8 | As a user, I can configure meeting settings (which calendars to sync) | P1 | No |

---

## 10. Desktop App (Electron-Specific)

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 10.1 | As a user, I can launch the desktop app and it auto-authenticates from saved state | P0 | Partial |
| 10.2 | As a user, the app lives in the system tray and I can invoke it with Alt/Option+I | P1 | No |
| 10.3 | As a user, the app auto-updates when a new version is available | P1 | No |
| 10.4 | As a user, I can use the Daily Brief screen to review my day's insights | P1 | No |
| 10.5 | As a user, I see a clear error screen when something goes wrong (not a crash) | P2 | No |

---

## 11. CLI

| # | Story | Priority | E2E Coverage |
|---|-------|----------|--------------|
| 11.1 | As a user, I can authenticate via CLI (`indigo auth login`) using browser OAuth | P2 | No |
| 11.2 | As a user, I can search and view signals via CLI (`indigo signals search`) | P2 | No |
| 11.3 | As a user, I can list and view meetings via CLI (`indigo meetings list`) | P2 | No |
| 11.4 | As a user, I can set up calendar + API key + MCP via `indigo setup` | P2 | No |

---

## Summary

| Category | Stories | P0 | P1 | P2 | Has E2E |
|----------|---------|----|----|----|---------|
| Auth & Onboarding | 6 | 3 | 2 | 0 | 4 |
| Meeting Intelligence | 7 | 4 | 2 | 1 | 0 |
| AI Assistant / Chat | 9 | 3 | 5 | 1 | 3 |
| Commands | 5 | 0 | 3 | 1 | 1 |
| Assistants Library | 3 | 0 | 2 | 1 | 2 |
| Insights & Signals | 5 | 1 | 4 | 0 | 0 |
| Knowledge & Data | 5 | 1 | 2 | 2 | 0 |
| MCP & External | 3 | 1 | 2 | 0 | 0 |
| Settings & Admin | 8 | 0 | 6 | 1 | 0 |
| Desktop App | 5 | 1 | 3 | 1 | 0 |
| CLI | 4 | 0 | 0 | 4 | 0 |
| **TOTAL** | **60** | **14** | **31** | **12** | **10** |

### Key Gaps
- **Meeting Intelligence has ZERO e2e coverage** — this is the #1 value prop
- **Insights/Signals have ZERO e2e coverage** — core differentiator
- **Settings/Admin have ZERO e2e coverage** — critical for self-serve
- Auth & Onboarding are the best-covered area (4/6 stories)
