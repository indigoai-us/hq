---
title: "Landlock LSM: Filesystem Sandboxing and Limitations"
category: ai-agents
tags: ["sandboxing", "security", "linux", "runtime-isolation", "agent-security"]
source: https://docs.kernel.org/userspace-api/landlock.html, https://landlock.io/, https://lwn.net/Articles/843478/, https://domcyrus.github.io/systems-programming/security/linux/2025/12/06/landlock-sandboxing-network-tools.html, https://man7.org/linux/man-pages/man7/landlock.7.html
confidence: 0.88
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Landlock is an unprivileged Linux LSM for restricting filesystem and network access per-process without root.

## How Landlock Works

Landlock uses three syscalls to define and enforce access policy:

1. `landlock_create_ruleset()` — create a new ruleset (a set of rules for allowed paths/ports)
2. `landlock_add_rule()` — add individual allow rules to the ruleset
3. `landlock_restrict_self()` — apply the ruleset to the calling thread (irreversible)

**Policy model:** Landlock is an *allowlist*. Once enforced, only explicitly-allowed paths/operations are permitted. Restrictions are additive and can never be removed — a sandboxed process can only restrict itself further.

**Inheritance:** Child processes (via `clone(2)`) inherit the parent's Landlock domain. Enforcement propagates down the process tree automatically.

**Stackable:** Landlock is a stackable LSM — it layers on top of DAC, SELinux, AppArmor, and other controls rather than replacing them. All layers must grant access for an operation to succeed.

## ABI Version History

| ABI Version | Kernel | Added |
|-------------|--------|-------|
| v1 | 5.13 | Basic filesystem access rights |
| v2 | 5.19 | `LANDLOCK_ACCESS_FS_REFER` (cross-dir rename/link) |
| v3 | 6.2 | `LANDLOCK_ACCESS_FS_TRUNCATE` |
| v4 | 6.7 | `ioctl(2)` restriction on devices |
| v5 | 6.7–6.9 | TCP network restrictions (bind/connect) |
| v6 | 6.12 | IPC scoping, abstract Unix socket control, signal scoping |

Query the running kernel's ABI version via `landlock_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION)`.

## Typical Usage Pattern

```c
// 1. Create ruleset specifying which rights to restrict
struct landlock_ruleset_attr attr = {
    .handled_access_fs = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE,
};
int ruleset_fd = landlock_create_ruleset(&attr, sizeof(attr), 0);

// 2. Add allow rules for specific paths
struct landlock_path_beneath_attr path = {
    .allowed_access = LANDLOCK_ACCESS_FS_READ_FILE,
    .parent_fd = open("/allowed/path", O_PATH),
};
landlock_add_rule(ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &path, 0);

// 3. Enforce (irreversible) — also requires no-new-privs
prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
landlock_restrict_self(ruleset_fd, 0);
```

## Advantages Over Alternatives

| Property | Landlock | namespaces + cgroups | seccomp | AppArmor/SELinux |
|----------|----------|----------------------|---------|-----------------|
| Unprivileged | ✅ (no root) | ❌ (needs CAP_SYS_ADMIN) | ✅ | ❌ (root to load) |
| Setup overhead | Very low | ~100ms per container | Low | Low |
| Scope | Filesystem + net (v5+) | Full OS isolation | Syscall filtering | Filesystem + net |
| Self-restriction | ✅ | ❌ | ✅ | ❌ |
| Semantic level | Kernel objects (files, ports) | Resource visibility | Syscall numbers | Path labels |

Landlock requires **no root, no mounts, no chroot, no cgroups, no Docker** — a process restricts itself in-place.

## Limitations Compared to Traditional Containerization

### 1. No Root/PID/Network Namespace Isolation
Landlock restricts *access* to filesystem paths, but does not hide other processes, does not create separate network stacks, and does not isolate hostname, IPC, or UID namespaces. A Landlock-sandboxed process can still see all running processes via `/proc`.

### 2. No Resource Limits
Landlock has no concept of CPU, memory, or I/O quotas. Containerization via cgroups handles resource management; Landlock does not.

### 3. Process Hierarchy Constraint
Landlock policies can only be applied by a thread to itself and its descendants. **You cannot apply Landlock to an already-running process** or to processes spawned by a system daemon without parentage. This is a fundamental constraint that containers (which set up isolation before exec) don't share.

### 4. Allowlist Requires Complete Path Knowledge
Because Landlock is allowlist-based, the sandboxing code must enumerate all paths the process legitimately needs access to. Dynamic, plugin-heavy, or reflection-heavy applications (e.g., JVM) can be difficult to sandbox because their access patterns aren't fully known at setup time.

### 5. Kernel Version Dependency
Full functionality (network restriction, IPC scoping) requires Linux 6.7–6.12+. On older kernels, graceful degradation is needed — the recommended approach is to detect the ABI version and skip unsupported features rather than failing.

### 6. No Memory/Execution Control
Landlock cannot prevent `mmap(PROT_EXEC)`, JIT compilation, or shellcode injection. seccomp is still needed for syscall-level control.

### 7. File Descriptor Leakage
If a parent process opens a file descriptor before applying Landlock and passes it to a child, the child can use it — Landlock restrictions apply to *new* open operations, not pre-existing FDs.

## Practical Usage in Agent Sandboxing

Landlock is used in combination with seccomp for lightweight agent process isolation:

- **OpenAI Codex CLI**: uses Landlock + seccomp on Linux for code execution sandboxing
- **NVIDIA OpenShell**: uses Landlock for filesystem path restriction as one layer of a three-layer isolation stack (Landlock + network namespace + seccomp)
- **GNU Make sandboxing** (justine.lol): uses Landlock to restrict build actions to declared inputs/outputs

The typical deployment pattern: `Landlock (FS access) + seccomp (syscall filter) + network namespace (net isolation)` — each tool handles a distinct layer, with Landlock contributing the cheapest, kernel-semantic, unprivileged FS layer.
