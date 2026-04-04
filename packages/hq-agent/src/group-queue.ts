/**
 * GroupQueue — per-group serialized concurrency manager.
 *
 * Each group_id gets its own queue. Within a group, only one job runs at a time.
 * Across groups, up to MAX_CONCURRENT_CONTAINERS jobs may run in parallel.
 */

export interface QueueJob {
  teamId: string;
  groupId: string;
  messageId: number;
  run: () => Promise<void>;
}

interface GroupState {
  running: boolean;
  queue: QueueJob[];
}

export class GroupQueue {
  private groups: Map<string, GroupState> = new Map();
  private activeCount = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Enqueue a job for a group. Returns immediately; job runs when slot available.
   */
  enqueue(job: QueueJob): void {
    let state = this.groups.get(job.groupId);
    if (!state) {
      state = { running: false, queue: [] };
      this.groups.set(job.groupId, state);
    }
    state.queue.push(job);
    this.tryDrain(job.groupId);
  }

  private tryDrain(groupId: string): void {
    const state = this.groups.get(groupId);
    if (!state) return;

    // Group already has a job running — respect per-group serialization
    if (state.running) return;

    // Global concurrency cap reached
    if (this.activeCount >= this.maxConcurrent) return;

    const job = state.queue.shift();
    if (!job) {
      this.groups.delete(groupId);
      return;
    }

    state.running = true;
    this.activeCount++;

    job.run().catch(() => {
      // Swallow errors — callers are responsible for their own error handling.
      // The queue must continue even if individual jobs throw.
    }).finally(() => {
      state.running = false;
      this.activeCount--;
      // Process next item for this group (may allow other groups too)
      this.tryDrain(groupId);
      // Also kick other groups that may have been blocked on global cap
      this.kickWaitingGroups();
    });
  }

  private kickWaitingGroups(): void {
    for (const [groupId, state] of this.groups) {
      if (!state.running && state.queue.length > 0 && this.activeCount < this.maxConcurrent) {
        this.tryDrain(groupId);
      }
    }
  }

  /** Number of jobs currently running across all groups. */
  get active(): number {
    return this.activeCount;
  }

  /** Total jobs queued (not yet running) across all groups. */
  get pending(): number {
    let count = 0;
    for (const state of this.groups.values()) {
      count += state.queue.length;
    }
    return count;
  }

  /** Total depth: running + queued. */
  get depth(): number {
    return this.activeCount + this.pending;
  }

  /** Wait for all currently running jobs to finish (does not prevent new enqueues). */
  async drain(): Promise<void> {
    while (this.activeCount > 0 || this.pending > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
}
