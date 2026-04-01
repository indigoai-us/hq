import { execSync } from "child_process";

export type SystemPackageManager = "brew" | "apt" | "dnf" | "yum" | "pacman" | null;

export type OsType = "macos" | "linux-debian" | "linux-fedora" | "linux-arch" | "linux" | "unix";

export interface PlatformInfo {
  os: OsType;
  packageManager: SystemPackageManager;
  npmAvailable: boolean;
}

function hasBin(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function detectOs(): OsType {
  const platform = process.platform;
  if (platform === "darwin") return "macos";
  if (platform !== "linux") return "unix";

  // Detect Linux distro family
  try {
    const release = execSync("cat /etc/os-release", { stdio: "pipe" }).toString();
    if (/ID_LIKE=.*debian|ID=ubuntu|ID=debian/i.test(release)) return "linux-debian";
    if (/ID_LIKE=.*fedora|ID_LIKE=.*rhel|ID=fedora/i.test(release)) return "linux-fedora";
    if (/ID=arch|ID_LIKE=.*arch/i.test(release)) return "linux-arch";
  } catch {
    // /etc/os-release missing — generic linux
  }
  return "linux";
}

function detectSystemPm(os: OsType): SystemPackageManager {
  switch (os) {
    case "macos":
      return hasBin("brew") ? "brew" : null;
    case "linux-debian":
      return hasBin("apt") ? "apt" : null;
    case "linux-fedora":
      if (hasBin("dnf")) return "dnf";
      if (hasBin("yum")) return "yum";
      return null;
    case "linux-arch":
      return hasBin("pacman") ? "pacman" : null;
    default:
      // Best-effort for generic linux/unix
      if (hasBin("apt")) return "apt";
      if (hasBin("dnf")) return "dnf";
      if (hasBin("yum")) return "yum";
      if (hasBin("pacman")) return "pacman";
      if (hasBin("brew")) return "brew";
      return null;
  }
}

export function detectPlatform(): PlatformInfo {
  const os = detectOs();
  return {
    os,
    packageManager: detectSystemPm(os),
    npmAvailable: hasBin("npm"),
  };
}
