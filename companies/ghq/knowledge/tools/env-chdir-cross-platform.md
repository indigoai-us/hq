---
title: "env -C (--chdir) Cross-Platform Availability"
category: tools
tags: ["cli", "sandboxing", "agent-tooling", "shell-scripting"]
source: "https://lists.gnu.org/archive/html/info-gnu/2017-09/msg00001.html, https://www.chiark.greenend.org.uk/~cjwatson/blog/env-chdir.html, https://ss64.com/mac/env.html"
confidence: 0.85
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

GNU coreutils `env -C DIR` (long form `--chdir=DIR`) changes the working directory before executing a command, without spawning a shell.

## Availability

| Platform | Status | Notes |
|----------|--------|-------|
| **GNU/Linux** | Available since **coreutils 8.28** (Sep 2017) | All modern distros ship >= 8.28 |
| **macOS** | **Not available** | macOS uses BSD `env`, which lacks `-C` |
| **FreeBSD** | **Not available** | BSD `env` does not support `--chdir` |

### Linux Distro Versions

| Distro | Coreutils Version | `env -C` Support |
|--------|-------------------|------------------|
| Ubuntu 18.04 (Bionic) | 8.28 | Yes (minimum) |
| Ubuntu 20.04 (Focal) | 8.30 | Yes |
| Ubuntu 22.04 (Jammy) | 8.32 | Yes |
| Debian 10 (Buster) | 8.30 | Yes |
| RHEL/CentOS 7 | 8.22 | **No** |
| RHEL 8 | 8.30 | Yes |

## Why It Exists

Colin Watson proposed `env --chdir` as a composable "adverbial" command — it changes directory without invoking a shell. Before this, the only portable way was `sh -c 'cd /path && command'`, which adds quoting complexity and a shell layer.

## Use in Agent Templates

`env -C` is useful in agent subprocess invocations where you need to run a command in a specific directory without `cd` (e.g., inside sandbox wrappers or hook scripts that chain `env -C /dir -- command`).

### Cross-Platform Workarounds

Since macOS lacks `env -C`, agent templates that need portability should use one of:

1. **Subshell**: `(cd /path && command)` — portable but spawns a shell
2. **sh -c**: `sh -c 'cd /path && exec command'` — also spawns a shell, more explicit
3. **Platform detection**: Check `env --version` output for GNU coreutils, fall back to subshell
4. **Install GNU coreutils on macOS**: `brew install coreutils` provides `genv -C`, not `env -C`

### Recommendation for Agent Templates

Do **not** rely on `env -C` in cross-platform agent templates. Use `(cd "$dir" && exec "$@")` instead — it works everywhere and the shell overhead is negligible for subprocess invocations.
