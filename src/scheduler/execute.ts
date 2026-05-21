import { chatOnce } from "../services/deepseek.js";
import { sendMessage } from "../services/telegram.js";
import { loadJobs, saveJobs } from "../store/jobs.js";
import { appendFire } from "../store/fires.js";
import { appendJsonl } from "../store/fs.js";
import { buildMemoryContext } from "../services/memory.js";
import { buildUserContext } from "../services/userMemory.js";
import { fetchSourcesForJob, formatSourcesAsContext } from "../services/dataSources.js";
import type { Job, LogEntry } from "../types.js";

export type ActivityListener = (entry: LogEntry) => void;

const listeners = new Set<ActivityListener>();

export function onActivity(fn: ActivityListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function log(entry: Omit<LogEntry, "ts">): Promise<void> {
  const full: LogEntry = { ...entry, ts: Date.now() };
  for (const l of listeners) {
    try { l(full); } catch { /* ignore */ }
  }
  try { await appendJsonl("log.jsonl", full); } catch { /* ignore */ }
}

export async function executeJob(job: Job): Promise<void> {
  await log({ level: "info", source: job.title, message: "Firing job..." });
  try {
    let memoryPatch: Partial<Job> | null = null;
    const systemChunks: string[] = [];

    try {
      const userCtx = await buildUserContext();
      if (userCtx.contextSystemMessage) systemChunks.push(userCtx.contextSystemMessage);
    } catch (err: any) {
      await log({ level: "error", source: job.title, message: `userMemory: ${err?.message || err}` });
    }

    if (job.data_sources && job.data_sources.length > 0) {
      await log({ level: "info", source: job.title, message: `Fetching ${job.data_sources.length} data source(s)...` });
      const fetched = await fetchSourcesForJob(job.data_sources);
      const sourceContext = formatSourcesAsContext(fetched);
      if (sourceContext) systemChunks.push(sourceContext);
      for (const f of fetched) {
        if (f.error) await log({ level: "error", source: job.title, message: `Source ${f.name}: ${f.error}` });
      }
    }

    if (job.memory?.enabled) {
      await log({ level: "info", source: job.title, message: "Building memory context..." });
      const mem = await buildMemoryContext(job);
      if (mem.contextSystemMessage) systemChunks.push(mem.contextSystemMessage);
      memoryPatch = mem.jobUpdate;
      if (memoryPatch?.memory && memoryPatch.memory.summary !== job.memory.summary) {
        await log({ level: "info", source: job.title, message: "Compacted memory summary" });
      }
    }

    const systemAppend = systemChunks.length > 0 ? systemChunks.join("\n\n---\n\n") : undefined;

    const reply = await chatOnce(
      [{ role: "user", content: job.prompt_template, ts: Date.now() }],
      { temperature: 0.8, systemAppend }
    );

    if (job.action.type === "telegram") {
      await sendMessage(reply, job.action.chat_id);
    }

    await appendFire({ job_id: job.id, ts: Date.now(), output: reply });

    await updateJobAfterRun(job.id, {
      last_fired_at: Date.now(),
      last_status: "ok",
      last_error: undefined,
      ...(memoryPatch ?? {}),
    });
    await log({ level: "info", source: job.title, message: "Delivered" });
  } catch (err: any) {
    const msg = err?.message || String(err);
    await updateJobAfterRun(job.id, { last_fired_at: Date.now(), last_status: "error", last_error: msg });
    await log({ level: "error", source: job.title, message: msg });
  }
}

async function updateJobAfterRun(id: string, patch: Partial<Job>): Promise<void> {
  const jobs = await loadJobs();
  const next = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  await saveJobs(next);
}

export type TestRunResult = {
  ok: boolean;
  output?: string;
  error?: string;
  steps: string[];
};

/**
 * Run the same pipeline as executeJob (data sources → memory → DeepSeek → Telegram)
 * but DO NOT persist anything (no fire record, no last_fired_at, no memory summary update).
 * The Telegram message IS sent — that's the point of the test.
 */
export async function testRunJob(job: Job): Promise<TestRunResult> {
  const steps: string[] = [];
  try {
    const systemChunks: string[] = [];

    try {
      const userCtx = await buildUserContext();
      if (userCtx.contextSystemMessage) {
        systemChunks.push(userCtx.contextSystemMessage);
        steps.push("✓ User profile + notes injected");
      }
    } catch (err: any) {
      steps.push(`! userMemory: ${err?.message || err}`);
    }

    if (job.data_sources && job.data_sources.length > 0) {
      steps.push(`Fetching ${job.data_sources.length} data source(s)...`);
      const fetched = await fetchSourcesForJob(job.data_sources);
      for (const f of fetched) {
        if (f.error) steps.push(`! ${f.name}: ${f.error}`);
        else steps.push(`✓ ${f.name} fetched`);
      }
      const sourceContext = formatSourcesAsContext(fetched);
      if (sourceContext) systemChunks.push(sourceContext);
    }

    if (job.memory?.enabled) {
      steps.push("Building memory context...");
      const mem = await buildMemoryContext(job);
      if (mem.contextSystemMessage) systemChunks.push(mem.contextSystemMessage);
    }

    steps.push("Calling DeepSeek...");
    const systemAppend = systemChunks.length > 0 ? systemChunks.join("\n\n---\n\n") : undefined;
    const reply = await chatOnce(
      [{ role: "user", content: job.prompt_template, ts: Date.now() }],
      { temperature: 0.8, systemAppend }
    );
    steps.push("✓ DeepSeek replied");

    if (job.action.type === "telegram") {
      steps.push("Sending to Telegram...");
      await sendMessage(reply, job.action.chat_id);
      steps.push("✓ Sent");
    }

    return { ok: true, output: reply, steps };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), steps };
  }
}
