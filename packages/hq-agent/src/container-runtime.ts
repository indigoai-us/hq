/**
 * container-runtime.ts — in-process tracking of active containers.
 */

export interface ContainerRecord {
  containerId: string;
  groupId: string;
  messageId: number;
  sessionId: string;
  startedAt: number;
  timeoutMs: number;
}

class ContainerRuntime {
  private containers: Map<string, ContainerRecord> = new Map();

  register(record: ContainerRecord): void {
    this.containers.set(record.containerId, record);
  }

  deregister(containerId: string): void {
    this.containers.delete(containerId);
  }

  get(containerId: string): ContainerRecord | undefined {
    return this.containers.get(containerId);
  }

  all(): ContainerRecord[] {
    return Array.from(this.containers.values());
  }

  get count(): number {
    return this.containers.size;
  }

  /** Returns containers that have exceeded their timeout. */
  timedOut(): ContainerRecord[] {
    const now = Date.now();
    return this.all().filter((r) => now - r.startedAt > r.timeoutMs);
  }
}

/** Singleton runtime tracker. */
export const runtime = new ContainerRuntime();
