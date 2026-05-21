import { chatOnce } from "./deepseek.js";
import { firesForJob } from "../store/fires.js";
import { inboxSince } from "../store/inbox.js";
import type { Job, FireRecord, InboxMessage } from "../types.js";

const COMPACT_FIRE_THRESHOLD = 3;
const COMPACT_BYTES_THRESHOLD = 2000;

type Event =
  | { kind: "fire"; ts: number; output: string }
  | { kind: "reply"; ts: number; text: string };

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString();
}

function eventsFromFiresAndReplies(fires: FireRecord[], replies: InboxMessage[]): Event[] {
  const events: Event[] = [
    ...fires.map<Event>((f) => ({ kind: "fire", ts: f.ts, output: f.output })),
    ...replies.map<Event>((r) => ({ kind: "reply", ts: r.ts, text: r.text })),
  ];
  events.sort((a, b) => a.ts - b.ts);
  return events;
}

function formatEvents(events: Event[]): string {
  return events
    .map((e) =>
      e.kind === "fire"
        ? `[${fmtTs(e.ts)}] AUTOMATION SENT:\n${e.output}`
        : `[${fmtTs(e.ts)}] USER REPLIED:\n${e.text}`
    )
    .join("\n\n");
}

async function compactSummary(job: Job, existingSummary: string, events: Event[]): Promise<string> {
  const system = `You maintain a compact memory summary for a recurring automation.

AUTOMATION TITLE: ${job.title}
AUTOMATION PURPOSE (prompt template):
${job.prompt_template}

Your job: read the existing summary and the new events, then return an UPDATED summary that captures only what matters for future runs of this automation — user preferences, patterns, recent progress, items already covered, anything that helps generate better, more relevant messages going forward.

Rules:
- Maximum ~200 words.
- Be specific and dense (dates, numbers, names).
- Drop info that is no longer relevant.
- Return ONLY the new summary text. No preamble, no markdown headings, no "Summary:" prefix.`;

  const userBody =
    `EXISTING SUMMARY:\n${existingSummary || "(none yet)"}\n\n` +
    `NEW EVENTS (oldest to newest):\n${formatEvents(events)}`;

  const updated = await chatOnce(
    [{ role: "user", content: userBody, ts: Date.now() }],
    { temperature: 0.2, systemAppend: system }
  );
  return updated.trim();
}

export type MemoryContext = {
  contextSystemMessage: string | null;
  jobUpdate: Partial<Job> | null;   // patch to persist (e.g. new summary)
};

export async function buildMemoryContext(job: Job): Promise<MemoryContext> {
  if (!job.memory?.enabled) {
    return { contextSystemMessage: null, jobUpdate: null };
  }

  const summary = job.memory.summary || "";
  const sinceTs = job.memory.last_summarized_fire_ts ?? job.created_at ?? 0;

  const [fires, replies] = await Promise.all([
    firesForJob(job.id, sinceTs),
    inboxSince(sinceTs),
  ]);

  const events = eventsFromFiresAndReplies(fires, replies);

  // Decide whether to compact
  const rawBytes = events.reduce((n, e) => n + (e.kind === "fire" ? e.output.length : e.text.length), 0);
  const shouldCompact = fires.length >= COMPACT_FIRE_THRESHOLD || rawBytes > COMPACT_BYTES_THRESHOLD;

  let nextSummary = summary;
  let nextSummarizedTs = job.memory.last_summarized_fire_ts;
  let recentEvents = events;

  if (shouldCompact && events.length > 0) {
    try {
      nextSummary = await compactSummary(job, summary, events);
      // After compaction, drop the raw buffer entirely — everything is in the summary.
      const latestFire = fires[fires.length - 1];
      const latestReply = replies[replies.length - 1];
      const latestTs = Math.max(latestFire?.ts ?? 0, latestReply?.ts ?? 0);
      nextSummarizedTs = latestTs || nextSummarizedTs;
      recentEvents = [];
    } catch {
      // compaction failed — fall through with existing summary + raw events
    }
  }

  const lines: string[] = ["[AUTOMATION MEMORY]"];
  lines.push("Rolling summary of prior runs and user replies:");
  lines.push(nextSummary ? nextSummary : "(no history yet)");
  if (recentEvents.length > 0) {
    lines.push("");
    lines.push("Recent events not yet summarized (oldest to newest):");
    lines.push(formatEvents(recentEvents));
  }
  lines.push("");
  lines.push(
    "Use this memory to make the new message MORE relevant: build on prior progress, avoid repeating what was just covered, and acknowledge anything the user mentioned in their replies."
  );

  const contextSystemMessage = lines.join("\n");

  const jobUpdate: Partial<Job> | null =
    nextSummary !== summary || nextSummarizedTs !== job.memory.last_summarized_fire_ts
      ? {
          memory: {
            enabled: true,
            summary: nextSummary,
            last_summarized_fire_ts: nextSummarizedTs,
          },
        }
      : null;

  return { contextSystemMessage, jobUpdate };
}
