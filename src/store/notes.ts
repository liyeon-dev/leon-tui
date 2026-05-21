import { appendJsonl, readJsonl, readJson, writeJson } from "./fs.js";
import type { Note, UserProfile } from "../types.js";

const NOTES_FILE = "notes.jsonl";
const PROFILE_FILE = "user_profile.json";

const DEFAULT_PROFILE: UserProfile = { summary: "", last_compacted_note_ts: 0 };

export async function appendNote(note: Note): Promise<void> {
  await appendJsonl(NOTES_FILE, note);
}

export async function loadNotes(): Promise<Note[]> {
  return await readJsonl<Note>(NOTES_FILE);
}

export async function notesSince(ts: number): Promise<Note[]> {
  const all = await loadNotes();
  return all.filter((n) => n.ts >= ts).sort((a, b) => a.ts - b.ts);
}

export async function loadProfile(): Promise<UserProfile> {
  return await readJson<UserProfile>(PROFILE_FILE, DEFAULT_PROFILE);
}

export async function saveProfile(p: UserProfile): Promise<void> {
  await writeJson(PROFILE_FILE, p);
}
