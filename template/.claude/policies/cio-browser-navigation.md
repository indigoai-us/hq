---
id: cio-browser-navigation
title: Customer.io Browser Automation Gotchas
scope: cross-cutting
trigger: agent-browser, customer.io, CIO dashboard
enforcement: soft
---

## Rule

When navigating Customer.io via agent-browser:

1. **Campaign list filter doesn't work** — the "FILTER BY" text input on the campaigns page does not actually filter results. Use `agent-browser eval` with JS to find campaign link URLs: `document.querySelectorAll('a').filter(a => a.textContent.includes('...')).map(a => a.href)`
2. **Navigate by direct URL** — `fly.customer.io/workspaces/{workspace-id}/journeys/campaigns/{id}/workflow`. Campaign IDs documented in `companies/{company}/knowledge/engineering/systems/customer-io/campaigns.md`
3. **Workflow canvas doesn't scroll normally** — use `node.scrollIntoView()` to bring workflow nodes into view, or zoom out with the zoom controls
4. **Slack template textarea** — uses class `ember-text-area`. Must use native setter + event dispatch for Ember to detect changes: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, newVal); ta.dispatchEvent(new Event('input', {bubbles:true}))`
5. **Browser state expires** — CIO auth cookies expire. Always be prepared to re-auth via headed mode

