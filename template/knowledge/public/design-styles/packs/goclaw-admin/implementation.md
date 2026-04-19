---
type: implementation
pack: goclaw-admin
version: "1.0.0"
status: canonical
stack: "Next.js 15 (App Router) + Tailwind v4 + React 19"
---

# Goclaw Admin — Implementation

This document is the code-level system for the pack. It is stack-opinionated: **Next.js 15 App Router + Tailwind v4 + React 19**. Adapters for other stacks are a consumer concern.

Everything in code fences below is a sketch, not production source. Consumers copy patterns, not files.

---

## 1. Install the pack in a fresh project

### 1.1 Dependencies

```bash
# Next.js 15 + React 19
pnpm add next@^15 react@^19 react-dom@^19

# Tailwind v4 (PostCSS plugin ships as a separate package)
pnpm add -D tailwindcss@^4 @tailwindcss/postcss@^4
```

No font packages are required — the pack pulls fonts via `@import url(...)` directly inside `globals.css` (see 1.3). For self-hosting, substitute `@fontsource/inter`, `@fontsource/barlow-condensed`, and `@fontsource/ibm-plex-mono`.

### 1.2 Copy tokens into the repo

Copy `design-tokens.css` from the pack into the repo at `src/app/design-tokens.css`. Do not symlink across repo boundaries.

### 1.3 `src/app/globals.css` — base stylesheet

```css
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
@import 'tailwindcss';
@import './design-tokens.css';

@theme {
  /* Alias pack font tokens into Tailwind utilities:
     `font-sans`, `font-display`, `font-mono`. */
  --font-sans: var(--ga-font-sans);
  --font-display: var(--ga-font-display);
  --font-mono: var(--ga-font-mono);
}
```

### 1.4 PostCSS

```js
// postcss.config.mjs
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

Tailwind v4 does not need a `tailwind.config.ts`. If a consumer wants one for plugin or content-path customization, the `@theme` block in `globals.css` stays the source of truth for tokens.

---

## 2. Root layout — `src/app/layout.tsx`

The root layout is intentionally minimal. Auth providers and shell chrome live in route-group layouts below it.

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin Console',
  description: 'Operations console',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 font-sans text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
```

Notes
- `html.dark` activates Tailwind's `dark:` variants even though the pack is dark-only — downstream utilities may still key off it.
- Do not set a page-level font on `<body>`; the shell relies on component-level typography.
- The auth provider is layered in by the consumer (e.g. a `<SessionProvider>`) — this pack is auth-agnostic.

---

## 3. Dashboard shell — `src/app/(shell)/layout.tsx`

A route group wraps every authenticated page with the sidebar. Rename the group to match your product's nav (`(dashboard)`, `(shell)`, `(console)` — all fine).

```tsx
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

---

## 4. Sidebar — `src/components/sidebar.tsx`

A fixed-width vertical rail with three regions: brand / grouped nav / bottom account rail. Canonical width is **240 px** (`w-60` in Tailwind v4, since `w-60` = 15 rem = 240 px). Ultra-dense admins can drop to `w-48` (192 px) at their own risk.

Key className strings — match these exactly to stay on-pack.

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem { label: string; href: string; icon: ReactNode }
interface NavGroup { heading: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { heading: 'Fleet', items: [
    { label: 'Dashboard', href: '/', icon: <DashboardIcon /> },
    { label: 'Deployments', href: '/deployments', icon: <DeploymentsIcon /> },
  ]},
  { heading: 'Operations', items: [
    { label: 'Team',  href: '/team',  icon: <TeamIcon /> },
    { label: 'Usage', href: '/usage', icon: <UsageIcon /> },
  ]},
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href) ?? false;

  const linkClasses = (href: string) =>
    `flex items-center gap-2 px-2 py-1 text-[12px] tracking-wide transition-colors ${
      isActive(href)
        ? 'bg-white/[0.06] text-white'
        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
    }`;

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0b]">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2 px-3 py-4 border-b border-white/[0.06]">
        <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-white">
          Console
        </span>
      </Link>

      {/* Grouped nav */}
      <div className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading} className="mb-1">
            <div className="px-3 py-1 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
              {group.heading}
            </div>
            <ul>
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClasses(item.href)}>
                    <span className="text-zinc-600">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom rail */}
      <div className="border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-2">
          {/* Consumer drops their account avatar here */}
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-700">
            v0.1.0
          </span>
        </div>
      </div>
    </nav>
  );
}

// Icons are plain inline SVGs at h-3.5 w-3.5. No icon library required.
function DashboardIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Z" />
    </svg>
  );
}
function DeploymentsIcon() { /* swap in a Heroicons outline path — 24×24, strokeWidth 1.5 */ return null; }
function TeamIcon() { return null; }
function UsageIcon() { return null; }
```

Conventions that matter
- Icons are inline SVG, 14 px (`h-3.5 w-3.5`), `strokeWidth={1.5}`, `currentColor`. No icon libraries — the pack assumes you paste Heroicons outline paths directly.
- Active-row treatment: `bg-white/[0.06] text-white`. Inactive: `text-zinc-500`. Hover: `text-zinc-300 hover:bg-white/[0.03]`.
- Section headings: always `font-display`, 9 px, `font-semibold`, uppercase, `tracking-[0.2em]`, `text-zinc-600`.
- Bottom rail mono version string: `font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-700`.

---

## 5. StatusBadge — `src/components/status-badge.tsx`

Two-color pairs per semantic. Dot + text label, always together.

```tsx
type Status = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const STYLES: Record<Status, { bg: string; text: string; dot: string }> = {
  success: { bg: 'bg-emerald-950', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  danger:  { bg: 'bg-red-950',     text: 'text-red-400',     dot: 'bg-red-400' },
  warning: { bg: 'bg-amber-950',   text: 'text-amber-400',   dot: 'bg-amber-400' },
  info:    { bg: 'bg-blue-950',    text: 'text-blue-400',    dot: 'bg-blue-400' },
  neutral: { bg: 'bg-white/[0.02]', text: 'text-zinc-400',   dot: 'bg-zinc-400' },
};

export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 ${s.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
```

---

## 6. MetricCard — dense stat card

A single headline number + a 9 px uppercase caption, optionally a 30-day sparkline, all inside a hairline-bordered card.

```tsx
import { Sparkline } from '@/components/sparkline';

interface MetricCardProps {
  caption: string;
  value: string | number;
  unit?: string;
  series?: number[];
}

export function MetricCard({ caption, value, unit, series }: MetricCardProps) {
  return (
    <div className="border border-white/[0.06] p-4">
      <div className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {caption}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[24px] font-medium text-zinc-100">{value}</span>
        {unit ? <span className="font-mono text-[10px] uppercase text-zinc-500">{unit}</span> : null}
      </div>
      {series?.length ? (
        <div className="mt-3">
          <Sparkline data={series} />
        </div>
      ) : null}
    </div>
  );
}
```

Rules
- No rounded corners on cards.
- Numeric value is mono, always.
- Caption is display-family, 9 px, uppercase — never body copy.

---

## 7. Sparkline — inline SVG

Dependency-free. Inline SVG polyline, default 80 × 24. Stroke is `zinc-400` at `strokeWidth={1.5}`.

```tsx
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string; // default: zinc-400
}

export function Sparkline({ data, width = 80, height = 24, color = '#a1a1aa' }: SparklineProps) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
```

---

## 8. DataTable — dense list pattern

Pure Tailwind table. No virtualization, no row highlighting beyond the hairline rule. Dense row padding (`py-1.5`) is what makes this read as a console.

```tsx
interface Column<T> { key: keyof T; header: string; align?: 'left' | 'right'; render?: (row: T) => React.ReactNode }
interface DataTableProps<T> { columns: Column<T>[]; rows: T[]; getRowKey: (row: T) => string }

export function DataTable<T>({ columns, rows, getRowKey }: DataTableProps<T>) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-white/[0.06]">
          {columns.map((c) => (
            <th
              key={String(c.key)}
              className={`px-2.5 py-1.5 font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500 ${
                c.align === 'right' ? 'text-right' : 'text-left'
              }`}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={getRowKey(row)}
            className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
          >
            {columns.map((c) => (
              <td
                key={String(c.key)}
                className={`px-2.5 py-1.5 text-zinc-300 ${c.align === 'right' ? 'text-right font-mono' : ''}`}
              >
                {c.render ? c.render(row) : String(row[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Conventions
- Every cell holding an ID, timestamp, or number renders with `font-mono`.
- Headers are display-family, 9 px, uppercase — the same treatment as sidebar section labels.
- Row hover is `hover:bg-white/[0.02]` only. Do not swap foreground color on hover.

---

## 9. Modal — consumer-authored, pack-compliant skeleton

No library recommendation; this sketch is the visual contract, not an implementation guide.

```tsx
export function ModalFrame({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[480px] border border-white/[0.06] bg-zinc-900">
        <div className="border-b border-white/[0.06] px-6 py-3">
          <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-zinc-100">{title}</h2>
        </div>
        <div className="px-6 py-4 text-sm text-zinc-300">{children}</div>
        {footer ? (
          <div className="border-t border-white/[0.06] px-6 py-3 flex justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
```

---

## 10. Buttons

```tsx
// Primary — for confirming destructive actions and submitting forms
<button className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors">
  Deactivate
</button>

// Ghost — default for row actions
<button className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] transition-colors">
  Edit
</button>

// Destructive confirm — same skeleton, red text
<button className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide bg-red-950 text-red-400 hover:bg-red-900 transition-colors">
  Delete permanently
</button>
```

---

## 11. Inputs

```tsx
// Standard text input
<input
  type="text"
  className="w-full px-2.5 py-1.5 text-sm text-zinc-100 bg-zinc-800 border border-white/[0.06] focus:border-white/20 focus:outline-none"
/>

// ID-ish input (subdomain, token) — mono family
<input
  type="text"
  className="w-full px-2.5 py-1.5 font-mono text-xs text-zinc-100 bg-zinc-800 border border-white/[0.06] focus:border-white/20 focus:outline-none"
/>
```

---

## 12. Quality gate checklist

When reviewing a page before ship, verify:

- [ ] Background is `bg-zinc-950` on the page and `bg-[#0a0a0b]` on the rail.
- [ ] Every structural border is `border-white/[0.06]`. No 1px solid colors. No shadows.
- [ ] Color appears **only** on status affordances.
- [ ] Numbers, IDs, timestamps render in `font-mono`.
- [ ] Section headings are `font-display` 9 px uppercase at `tracking-[0.2em]`.
- [ ] Row padding on any data table is `py-1.5` (6 px).
- [ ] No rounded corners on cards or tables.
- [ ] Focus-visible rings are present on every interactive element.
- [ ] Every icon-only button has a `title` or `aria-label`.

If any of these fail, the page is off-pack — fix before landing.
