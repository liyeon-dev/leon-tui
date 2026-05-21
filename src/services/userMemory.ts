import { chatOnce } from "./deepseek.js";
import { loadProfile, notesSince, saveProfile } from "../store/notes.js";
import type { Note, UserProfile } from "../types.js";

const COMPACT_NOTE_THRESHOLD = 5;
const COMPACT_BYTES_THRESHOLD = 1500;

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatNotes(notes: Note[]): string {
  return notes.map((n) => `[${fmtTs(n.ts)}] (${n.source}) ${n.text}`).join("\n");
}

async function compactSummary(existingSummary: string, notes: Note[]): Promise<string> {
  const system = `You maintain a compact long-term memory profile about the user.

Your job: read the existing profile summary and the new notes the user has logged, then return an UPDATED summary that captures what matters for future interactions — preferences, routines, recurring people/projects/places, ongoing commitments, recent progress, things they've asked to be reminded of, anything that helps future replies be more personally relevant.

Rules:
- Maximum ~200 words.
- Be specific and dense (dates, numbers, names, project codes).
- Drop info that is no longer relevant or has been resolved.
- Keep commitments and follow-ups the user has not confirmed as done.
- Return ONLY the new summary text. No preamble, no markdown headings, no "Summary:" prefix.`;

  const userBody =
    `EXISTING SUMMARY:\n${existingSummary || "(none yet)"}\n\n` +
    `NEW NOTES (oldest to newest):\n${formatNotes(notes)}`;

  const updated = await chatOnce(
    [{ role: "user", content: userBody, ts: Date.now() }],
    { temperature: 0.2, systemAppend: system }
  );
  return updated.trim();
}

export type UserContext = {
  contextSystemMessage: string | null;
};

export async function buildUserContext(): Promise<UserContext> {
  const profile = await loadProfile();
  const fresh = await notesSince(profile.last_compacted_note_ts);

  if (!profile.summary && fresh.length === 0) {
    return { contextSystemMessage: null };
  }

  let summary = profile.summary;
  let recentNotes = fresh;

  const rawBytes = fresh.reduce((n, x) => n + x.text.length, 0);
  const shouldCompact = fresh.length >= COMPACT_NOTE_THRESHOLD || rawBytes > COMPACT_BYTES_THRESHOLD;

  if (shouldCompact && fresh.length > 0) {
    try {
      summary = await compactSummary(profile.summary, fresh);
      const latestTs = fresh[fresh.length - 1]!.ts;
      const nextProfile: UserProfile = { summary, last_compacted_note_ts: latestTs };
      await saveProfile(nextProfile);
      recentNotes = [];
    } catch {
      // compaction failed — fall through with existing summary + raw notes
    }
  }

  const lines: string[] = ["[USER PROFILE & RECENT NOTES]"];
  lines.push("Long-term context about the user:");
  lines.push(summary || "(none yet)");
  if (recentNotes.length > 0) {
    lines.push("");
    lines.push("Recent notes the user has logged (not yet folded into summary):");
    lines.push(formatNotes(recentNotes));
  }
  lines.push("");
  lines.push(
    "Use this to make replies personally relevant. Reference recent notes when appropriate; ask about commitments they mentioned."
  );

  return { contextSystemMessage: lines.join("\n") };
}
