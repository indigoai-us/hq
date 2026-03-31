import { describe, it, expect } from "vitest";
import { getInstallCommand } from "../deps.js";
import type { Dep, InstallCommands } from "../deps.js";
import type { PlatformInfo } from "../platform.js";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeDep(overrides: Partial<Dep> = {}): Dep {
  return {
    name: "test-dep",
    command: "test --version",
    required: true,
    installHint: "brew install test",
    autoInstallable: true,
    installCommands: {},
    ...overrides,
  };
}

function makePlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    os: "macos",
    packageManager: "brew",
    npmAvailable: true,
    ...overrides,
  };
}

const yqDep = makeDep({
  name: "yq",
  command: "yq --version",
  installHint: "brew install yq",
  installCommands: {
    brew: "brew install yq",
    apt: "sudo snap install yq",
    dnf: "sudo dnf install yq",
    pacman: "sudo pacman -S yq",
  },
});

const ghDep = makeDep({
  name: "gh CLI",
  command: "gh --version",
  required: false,
  installHint: "brew install gh",
  installCommands: {
    brew: "brew install gh",
    apt: "sudo apt install gh",
    dnf: "sudo dnf install gh",
    pacman: "sudo pacman -S github-cli",
  },
});

const claudeCodeDep = makeDep({
  name: "Claude Code CLI",
  command: "claude --version",
  installHint: "npm install -g @anthropic-ai/claude-code",
  installCommands: {
    npm: "npm install -g @anthropic-ai/claude-code",
  },
});

const qmdDep = makeDep({
  name: "qmd (search)",
  command: "qmd --version",
  installHint: "npm install -g @tobilu/qmd",
  installCommands: {
    npm: "npm install -g @tobilu/qmd",
  },
});

const vercelDep = makeDep({
  name: "Vercel CLI",
  command: "vercel --version",
  required: false,
  installHint: "npm install -g vercel",
  installCommands: {
    npm: "npm install -g vercel",
  },
});

const hqCliDep = makeDep({
  name: "hq-cli",
  command: "hq --version",
  required: false,
  installHint: "npm install -g @indigoai-us/hq-cli",
  installCommands: {
    npm: "npm install -g @indigoai-us/hq-cli",
  },
});

const nodeDep = makeDep({
  name: "Node.js",
  command: "node --version",
  required: true,
  installHint: "https://nodejs.org",
  autoInstallable: false,
  installCommands: {},
});

// ─── Platforms ──────────────────────────────────────────────────────────────

const macBrew = makePlatform({ os: "macos", packageManager: "brew", npmAvailable: true });
const linuxApt = makePlatform({ os: "linux-debian", packageManager: "apt", npmAvailable: true });
const linuxDnf = makePlatform({ os: "linux-fedora", packageManager: "dnf", npmAvailable: true });
const linuxPacman = makePlatform({ os: "linux-arch", packageManager: "pacman", npmAvailable: true });
const linuxYum = makePlatform({ os: "linux-fedora", packageManager: "yum", npmAvailable: true });
const noPmNoNpm = makePlatform({ os: "unix", packageManager: null, npmAvailable: false });
const noPmWithNpm = makePlatform({ os: "unix", packageManager: null, npmAvailable: true });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("getInstallCommand", () => {
  describe("macOS + brew", () => {
    it("returns brew command for yq", () => {
      expect(getInstallCommand(yqDep, macBrew)).toBe("brew install yq");
    });

    it("returns brew command for gh CLI", () => {
      expect(getInstallCommand(ghDep, macBrew)).toBe("brew install gh");
    });

    it("returns npm command for npm-only deps (prefers system PM, falls back to npm)", () => {
      // Claude Code only has npm install command, no brew
      expect(getInstallCommand(claudeCodeDep, macBrew)).toBe(
        "npm install -g @anthropic-ai/claude-code",
      );
    });
  });

  describe("Linux + apt", () => {
    it("returns apt command for yq", () => {
      expect(getInstallCommand(yqDep, linuxApt)).toBe("sudo snap install yq");
    });

    it("returns apt command for gh CLI", () => {
      expect(getInstallCommand(ghDep, linuxApt)).toBe("sudo apt install gh");
    });
  });

  describe("Linux + dnf", () => {
    it("returns dnf command for yq", () => {
      expect(getInstallCommand(yqDep, linuxDnf)).toBe("sudo dnf install yq");
    });
  });

  describe("Linux + pacman", () => {
    it("returns pacman command for gh CLI", () => {
      expect(getInstallCommand(ghDep, linuxPacman)).toBe("sudo pacman -S github-cli");
    });
  });

  describe("yum → dnf fallback", () => {
    it("maps yum to dnf commands", () => {
      expect(getInstallCommand(yqDep, linuxYum)).toBe("sudo dnf install yq");
    });
  });

  describe("npm-only deps", () => {
    it("returns npm command for Claude Code when npm available", () => {
      expect(getInstallCommand(claudeCodeDep, noPmWithNpm)).toBe(
        "npm install -g @anthropic-ai/claude-code",
      );
    });

    it("returns npm command for qmd when npm available", () => {
      expect(getInstallCommand(qmdDep, noPmWithNpm)).toBe("npm install -g @tobilu/qmd");
    });

    it("returns npm command for Vercel CLI when npm available", () => {
      expect(getInstallCommand(vercelDep, noPmWithNpm)).toBe("npm install -g vercel");
    });

    it("returns npm command for hq-cli when npm available", () => {
      expect(getInstallCommand(hqCliDep, noPmWithNpm)).toBe(
        "npm install -g @indigoai-us/hq-cli",
      );
    });

    it("returns null for npm-only deps when npm not available", () => {
      expect(getInstallCommand(claudeCodeDep, noPmNoNpm)).toBeNull();
    });
  });

  describe("Node.js dep (no install path)", () => {
    it("returns null — empty installCommands", () => {
      expect(getInstallCommand(nodeDep, macBrew)).toBeNull();
    });

    it("returns null even with npm available", () => {
      expect(getInstallCommand(nodeDep, noPmWithNpm)).toBeNull();
    });

    it("has autoInstallable set to false", () => {
      expect(nodeDep.autoInstallable).toBe(false);
    });
  });

  describe("no matching package manager and no npm", () => {
    it("returns null for system deps when no PM and no npm", () => {
      expect(getInstallCommand(yqDep, noPmNoNpm)).toBeNull();
    });

    it("returns null for gh CLI when no PM and no npm", () => {
      expect(getInstallCommand(ghDep, noPmNoNpm)).toBeNull();
    });
  });

  describe("npm fallback for system deps", () => {
    it("falls back to npm when no system PM but npm available (for deps with npm command)", () => {
      // yq has no npm command, so should return null
      expect(getInstallCommand(yqDep, noPmWithNpm)).toBeNull();
    });
  });
});
