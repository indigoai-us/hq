# Test Results: [Platform] - [YYYY-MM-DD]

Copy this template for each test run. Name the file: `YYYY-MM-DD-platform.md`

## Environment

| Property | Value |
|----------|-------|
| OS Version | [e.g., Windows 11 23H2, macOS 14.3] |
| VM/Hardware | [e.g., Hyper-V, VMware, Physical M2 Mac] |
| Network | [e.g., Home WiFi, Corporate proxy, VPN] |
| Tester | [Your name] |
| Installer Version | [e.g., 1.0.0] |
| Test Date | [YYYY-MM-DD HH:MM] |

## Pre-Installation State

- [ ] No Node.js installed (`node --version` fails)
- [ ] No npm installed (`npm --version` fails)
- [ ] No Claude CLI installed (`claude --version` fails)
- [ ] Fresh OS install or clean user account

Notes on pre-install state:
> [Any relevant notes about the initial system state]

## Installation Process

| Step | Status | Notes |
|------|--------|-------|
| Installer launches | Pass/Fail | |
| Welcome screen displays | Pass/Fail | |
| License/agreement shown | Pass/Fail | |
| Install location selected | Pass/Fail | Default: [path] |
| Node.js installation | Pass/Fail/Skipped | Version installed: |
| Claude CLI installation | Pass/Fail | |
| Claude OAuth page | Pass/Fail/Skipped | |
| my-hq files extracted | Pass/Fail | |
| Setup wizard launched | Pass/Fail/Skipped | |
| Installation complete | Pass/Fail | |

**Total installation time:** [X] minutes

## Post-Installation Verification

### Automated Test Results

```
[Paste output from test-windows.ps1 or test-macos.sh here]
```

### Manual Verification

| Check | Result | Notes |
|-------|--------|-------|
| `node --version` | v[X.X.X] | |
| `npm --version` | v[X.X.X] | |
| `claude --version` | v[X.X.X] | |
| my-hq folder exists | Pass/Fail | Path: |
| CLAUDE.md exists | Pass/Fail | |
| agents.md exists | Pass/Fail | |
| USER-GUIDE.md exists | Pass/Fail | |
| Desktop shortcut works | Pass/Fail | |
| Start Menu shortcuts work | Pass/Fail | (Windows only) |
| `claude --help` works | Pass/Fail | |

## Issues Found

### Issue 1: [Title]

**Severity:** Blocker / Major / Minor / Cosmetic

**Steps to reproduce:**
1. Step one
2. Step two
3. Step three

**Expected behavior:**
> What should happen

**Actual behavior:**
> What actually happened

**Screenshots:**
> Attach if applicable

**Workaround:**
> If any

---

### Issue 2: [Title]

(Copy format from Issue 1)

---

## Edge Cases Tested

| Scenario | Result | Notes |
|----------|--------|-------|
| Interrupted installation | | |
| Reinstall over existing | | |
| Low disk space | | |
| No internet connection | | |
| Slow network | | |
| Non-admin user | | |

## Screenshots

(Attach relevant screenshots here or link to folder)

## Overall Assessment

- [ ] **PASS** - Ready for release
- [ ] **PASS WITH ISSUES** - Releasable with known issues documented
- [ ] **FAIL** - Blockers must be fixed before release

### Summary

> [1-2 paragraph summary of the test run and overall quality assessment]

### Recommendations

1. [Any recommendations for improvements]
2. [...]

---

## Appendix

### System Information (detailed)

```
[Paste output of systeminfo (Windows) or system_profiler (macOS)]
```

### Installation Log

```
[Paste relevant log entries if available]
```
