import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PlatformInfo, OsType, SystemPackageManager } from "../platform.js";

// We need to mock child_process before importing the module
const mockExecSync = vi.fn();
vi.mock("child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Dynamic import so mocks are in place
const { detectPlatform } = await import("../platform.js");

describe("detectPlatform", () => {
  const validOsTypes: OsType[] = [
    "macos",
    "linux-debian",
    "linux-fedora",
    "linux-arch",
    "linux",
    "unix",
  ];

  const validPackageManagers: (SystemPackageManager)[] = [
    "brew",
    "apt",
    "dnf",
    "yum",
    "pacman",
    null,
  ];

  beforeEach(() => {
    mockExecSync.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a PlatformInfo object with valid os field matching process.platform", () => {
    // Let hasBin calls succeed for common tools
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "which brew") return Buffer.from("/opt/homebrew/bin/brew");
      if (cmd === "which npm") return Buffer.from("/usr/local/bin/npm");
      throw new Error("not found");
    });

    const result = detectPlatform();

    expect(result).toHaveProperty("os");
    expect(result).toHaveProperty("packageManager");
    expect(result).toHaveProperty("npmAvailable");
    expect(validOsTypes).toContain(result.os);

    // On macOS CI/local, process.platform is "darwin" → os should be "macos"
    if (process.platform === "darwin") {
      expect(result.os).toBe("macos");
    } else if (process.platform === "linux") {
      expect(result.os).toMatch(/^linux/);
    }
  });

  it("npmAvailable is a boolean", () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "which npm") return Buffer.from("/usr/local/bin/npm");
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(typeof result.npmAvailable).toBe("boolean");
  });

  it("packageManager is a valid value or null", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(validPackageManagers).toContain(result.packageManager);
  });

  it("detects brew on macOS when brew is available", () => {
    // Mock process.platform to darwin
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "which brew") return Buffer.from("/opt/homebrew/bin/brew");
      if (cmd === "which npm") return Buffer.from("/usr/local/bin/npm");
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(result.os).toBe("macos");
    expect(result.packageManager).toBe("brew");
    expect(result.npmAvailable).toBe(true);

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("returns null packageManager on macOS when brew is not available", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });

    mockExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(result.os).toBe("macos");
    expect(result.packageManager).toBeNull();

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("detects apt on linux-debian", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", writable: true });

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === "cat /etc/os-release") {
        return Buffer.from('ID=ubuntu\nID_LIKE=debian\nVERSION_ID="22.04"');
      }
      if (cmd === "which apt") return Buffer.from("/usr/bin/apt");
      if (cmd === "which npm") return Buffer.from("/usr/bin/npm");
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(result.os).toBe("linux-debian");
    expect(result.packageManager).toBe("apt");

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("returns 'unix' for non-darwin non-linux platforms", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "freebsd", writable: true });

    mockExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = detectPlatform();
    expect(result.os).toBe("unix");

    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });
});
