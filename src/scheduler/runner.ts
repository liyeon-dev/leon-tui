import cron, { type ScheduledTask } from "node-cron";
import { executeJob } from "./execute.js";
import { loadJobs, saveJobs } from "../store/jobs.js";
import type { Job } from "../types.js";

type TaskHandle = { stop: () => void };

const tasks = new Map<string, TaskHandle>();

async function disableJob(id: string): Promise<void> {
  const jobs = await loadJobs();
  const next = jobs.map((j) => (j.id === id ? { ...j, enabled: false } : j));
  await saveJobs(next);
}

async function runAndMaybeDisable(job: Job): Promise<void> {
  await executeJob(job);
  if (job.run_once) {
    await disableJob(job.id);
    unregister(job.id);
  }
}

export function register(job: Job): { ok: boolean; error?: string } {
  unregister(job.id);
  if (!job.enabled) return { ok: true };

  if (job.fire_at !== undefined) {
    const delta = job.fire_at - Date.now();
    if (delta <= 0) return { ok: false, error: "fire_at is in the past" };
    const timer = setTimeout(() => { void runAndMaybeDisable(job); }, delta);
    tasks.set(job.id, { stop: () => clearTimeout(timer) });
    return { ok: true };
  }

  if (!job.cron_expr) return { ok: false, error: "job has neither cron_expr nor fire_at" };
  if (!cron.validate(job.cron_expr)) {
    return { ok: false, error: `Invalid cron: ${job.cron_expr}` };
  }
  try {
    const task: ScheduledTask = cron.schedule(
      job.cron_expr,
      () => { void runAndMaybeDisable(job); },
      { timezone: job.timezone }
    );
    tasks.set(job.id, { stop: () => { try { task.stop(); } catch { /* ignore */ } } });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function unregister(id: string): void {
  const t = tasks.get(id);
  if (t) {
    try { t.stop(); } catch { /* ignore */ }
    tasks.delete(id);
  }
}

export function syncAll(jobs: Job[]): void {
  const ids = new Set(jobs.map((j) => j.id));
  for (const id of [...tasks.keys()]) {
    if (!ids.has(id)) unregister(id);
  }
  for (const job of jobs) {
    register(job);
  }
}

export function activeCount(): number {
  return tasks.size;
}

export function shutdown(): void {
  for (const id of [...tasks.keys()]) unregister(id);
}
