/**
 * Background sync daemon management
 * Manages a child process that runs the file watcher
 */

import * as fs from "fs";
import * as path from "path";
import { fork } from "child_process";
import { fileURLToPath } from "url";
import type { DaemonState } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getPidFile(hqRoot: string): string {
  return path.join(hqRoot, ".hq-sync.pid");
}

function getStateFile(hqRoot: string): string {
  return path.join(hqRoot, ".hq-sync-daemon.json");
}

export function isDaemonRunning(hqRoot: string): boolean {
  const pidFile = getPidFile(hqRoot);
  if (!fs.existsSync(pidFile)) return false;

  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  try {
    // signal 0 tests if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, clean up stale PID file
    fs.unlinkSync(pidFile);
    return false;
  }
}

export function startDaemon(hqRoot: string): void {
  if (isDaemonRunning(hqRoot)) {
    console.log("  Sync daemon is already running.");
    return;
  }

  const workerScript = path.join(__dirname, "daemon-worker.js");

  const child = fork(workerScript, [hqRoot], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();

  if (child.pid) {
    // Write PID file
    fs.writeFileSync(getPidFile(hqRoot), String(child.pid));

    // Write state
    const state: DaemonState = {
      pid: child.pid,
      startedAt: new Date().toISOString(),
      hqRoot,
    };
    fs.writeFileSync(getStateFile(hqRoot), JSON.stringify(state, null, 2));
  }
}

export function stopDaemon(hqRoot: string): void {
  const pidFile = getPidFile(hqRoot);
  if (!fs.existsSync(pidFile)) {
    console.log("  No sync daemon running.");
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already dead
  }

  // Clean up files
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  const stateFile = getStateFile(hqRoot);
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
}

export function getDaemonState(hqRoot: string): DaemonState | null {
  const stateFile = getStateFile(hqRoot);
  if (!fs.existsSync(stateFile)) return null;
  try {
    const content = fs.readFileSync(stateFile, "utf-8");
    return JSON.parse(content) as DaemonState;
  } catch {
    return null;
  }
}
