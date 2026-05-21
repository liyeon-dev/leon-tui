import { z } from "zod";
import cron from "node-cron";
import { chatOnce } from "./deepseek.js";
import type { Message, Job, DataSource } from "../types.js";

const JobDraftSchema = z
  .object({
    title: z.string().min(1).max(80),
    cron_expr: z.string().min(1).max(40).optional(),
    fire_at: z.number().int().positive().optional(),
    run_once: z.boolean().optional().default(false),
    timezone: z.string().min(1).max(64),
    prompt_template: z.string().min(1),
    action: z.object({
      type: z.literal("telegram"),
    }),
    memory_enabled: z.boolean().optional().default(false),
    data_sources: z.array(z.string()).optional().default([]),
  })
  .refine(
    (d) => (d.cron_expr ? !d.fire_at : !!d.fire_at),
    { message: "Exactly one of cron_expr or fire_at must be set" }
  );

export type JobDraft = z.infer<typeof JobDraftSchema>;

export type AuthorMsg = { role: "user" | "assistant"; content: string };

export type AuthorOutcome =
  | { kind: "question"; question: string }
  | { kind: "ready"; draft: JobDraft }
  | { kind: "error"; error: string; raw?: string };

const SYSTEM_PROMPT = `You help the user define a scheduled automation. The user describes what they want; you collect any missing details by asking ONE clarifying question at a time, then produce the final JSON job spec.

ALWAYS respond with ONLY a JSON object — no markdown fences, no prose outside the JSON. The object must have EXACTLY one of these two shapes:

1. If you need more information, ask a clarifying question:
{
  "status": "question",
  "question": "Your single, specific question to the user. Be concise."
}

Ask a question if any of these are unclear or missing:
- When the automation should run (time of day, frequency, days of week)
- What the message/action should contain (topic, format, tone, length, language)
- Anything else that would change the schedule or prompt template

Ask AT MOST 2-3 questions in total. Once you have enough to write a reasonable spec, move to "ready". Don't ask about minutiae the user is unlikely to care about.

2. When you have enough information, return the final spec.

Choose between RECURRING and ONE-OFF based on the user's wording:

RECURRING (use "cron_expr", run_once defaults to false):
- "every morning", "weekdays at 6pm", "every Monday", "every 5 minutes"
{
  "status": "ready",
  "job": {
    "title": "Short human label, max 80 chars",
    "cron_expr": "5-field cron: 'min hour day month weekday'",
    "timezone": "IANA tz, e.g. Asia/Kuala_Lumpur",
    "prompt_template": "Self-contained instruction for the LLM that will run at fire time. Include formatting hints (e.g. 'Reply in Markdown with bullet points'). Do not use placeholders.",
    "action": { "type": "telegram" },
    "memory_enabled": false,
    "data_sources": []
  }
}

ONE-OFF (use "fire_at" + "run_once": true, NO cron_expr):
- "remind me Monday 9am", "in 2 hours", "tomorrow at 6pm", "once on Dec 15"
{
  "status": "ready",
  "job": {
    "title": "Short human label",
    "fire_at": 1735689600000,
    "run_once": true,
    "timezone": "IANA tz",
    "prompt_template": "...",
    "action": { "type": "telegram" },
    "memory_enabled": false,
    "data_sources": []
  }
}

fire_at MUST be:
- A Unix timestamp in MILLISECONDS (ms since epoch).
- In the future relative to the current time shown below.
- Computed in the user's timezone (the IANA tz you set).

MEMORY:
The automation can remember the user's Telegram replies between runs and use them as context. Set "memory_enabled": true when continuity matters — when the user says they will reply with what they did, when they want progress tracked, when each run should build on prior runs (workouts, study schedules, habit tracking, journaling, etc).
Set it to false for one-way reminders that do not depend on history (one-off announcements, news digests, simple alarms). One-off jobs almost always have memory_enabled: false.
If the user description is ambiguous about whether they will reply or want continuity, ask: "Should this remember your Telegram replies so future runs can build on them?"

USER NOTES & PROFILE (ALWAYS AVAILABLE — NEVER ASK FOR A SOURCE):
A long-term user profile and the user's recent notes (logged via /note in the TUI or "note: ..." on Telegram) are AUTOMATICALLY injected into every job's context at run time. You do NOT need to attach a data source for them and you MUST NOT ask the user to set one up.
If the user says things like "include my tasks", "from my notes", "what I told you yesterday", "things I need to do", "remind me about commitments I logged", etc. — just write the prompt_template to reference them directly. Examples:
- "Include any tasks or commitments from my recent notes and the long-term profile. If there are no tasks, say so cheerfully."
- "Mention any follow-ups I logged in my notes that are due today."
The runtime will supply the actual notes; the prompt just needs to instruct the LLM to use them.

Cron rules:
- 24-hour time. 6PM => hour 18.
- "every day" => "* * *" in day/month/weekday. "weekdays" => weekday "1-5". "weekends" => weekday "0,6".
- "every 5 minutes" => "*/5 * * * *". "every minute" => "* * * * *".

EDITING / REFINING (CRITICAL):
If a current spec is shown to you (an existing job or a draft you just produced that the user is refining), you MUST treat it as the baseline. Copy ALL fields from the baseline into your "ready" response EXACTLY as-is, then apply ONLY the specific changes the user asked for. In particular:
- "data_sources" must be preserved unless the user explicitly says to remove a source or add one.
- "memory_enabled" must be preserved unless the user says to enable/disable memory.
- "cron_expr" / "fire_at" / "run_once" / "timezone" / "action" must be preserved unless the user changes the schedule or action.
- Never silently drop a field. If you are unsure whether the user wants a source removed, ASK a clarifying question instead of dropping it.

Do NOT re-ask things that haven't changed.`;

type ContinueOpts = {
  existingJob?: Job;
  availableSources?: DataSource[];
};

export async function continueAuthoring(
  messages: AuthorMsg[],
  defaultTimezone: string,
  opts: ContinueOpts = {}
): Promise<AuthorOutcome> {
  const apiMessages: Message[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
    ts: Date.now(),
  }));

  const nowStr = new Date().toLocaleString("en-US", { timeZone: defaultTimezone, hour12: false });
  const nowMs = Date.now();
  let systemAppend =
    `Current date/time in ${defaultTimezone}: ${nowStr}\n` +
    `Current Unix time (ms): ${nowMs}\n` +
    `Default timezone if user does not specify: ${defaultTimezone}\n\n` +
    SYSTEM_PROMPT;

  if (opts.availableSources && opts.availableSources.length > 0) {
    const list = opts.availableSources
      .map((s) => `- "${s.name}": ${s.description}`)
      .join("\n");
    systemAppend +=
      `\n\nAVAILABLE DATA SOURCES (set "data_sources": ["name", ...] on the job to attach any of these — they will be fetched and injected as context every time the job fires):\n${list}\n\nUse data sources whenever the user asks for current/live information (weather, prices, news, etc). Only attach sources that are clearly relevant. If the user wants data that no listed source covers, mention this in the final message rather than attaching irrelevant sources.`;
  }

  if (opts.existingJob) {
    const j = opts.existingJob;
    systemAppend +=
      `\n\nThe user is EDITING this existing job. Apply the changes they ask for, keep everything else identical:\n` +
      JSON.stringify(
        {
          title: j.title,
          cron_expr: j.cron_expr,
          fire_at: j.fire_at,
          run_once: j.run_once,
          timezone: j.timezone,
          prompt_template: j.prompt_template,
          action: j.action,
        },
        null,
        2
      );
  }

  let raw: string;
  try {
    raw = await chatOnce(apiMessages, {
      temperature: 0.2,
      json: true,
      systemAppend,
    });
  } catch (err: any) {
    return { kind: "error", error: `DeepSeek error: ${err?.message || String(err)}` };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "error", error: "DeepSeek returned non-JSON output.", raw };
  }

  if (parsed?.status === "question" && typeof parsed.question === "string") {
    return { kind: "question", question: parsed.question };
  }

  if (parsed?.status === "ready") {
    const result = JobDraftSchema.safeParse(parsed.job);
    if (!result.success) {
      return {
        kind: "error",
        error: `Schema mismatch: ${result.error.issues.map((i) => i.message).join("; ")}`,
        raw,
      };
    }
    const draft = result.data;
    if (draft.cron_expr && !cron.validate(draft.cron_expr)) {
      return { kind: "error", error: `Invalid cron expression: "${draft.cron_expr}"`, raw };
    }
    if (draft.fire_at !== undefined && draft.fire_at <= Date.now()) {
      return { kind: "error", error: `fire_at is in the past: ${new Date(draft.fire_at).toLocaleString()}`, raw };
    }
    return { kind: "ready", draft };
  }

  return { kind: "error", error: 'DeepSeek response had no recognized "status" field.', raw };
}
