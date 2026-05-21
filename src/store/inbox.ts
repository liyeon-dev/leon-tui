import { appendJsonl, readJsonl, readJson, writeJson } from "./fs.js";
import type { InboxMessage } from "../types.js";

const INBOX_FILE = "inbox.jsonl";
const TG_STATE_FILE = "telegram.json";

export type TelegramState = {
  last_update_id: number;
  live_session_id?: string | null;
  live_started_at?: number;
};

const DEFAULT_STATE: TelegramState = { last_update_id: 0, live_session_id: null };

export async function loadInbox(): Promise<InboxMessage[]> {
  return await readJsonl<InboxMessage>(INBOX_FILE);
}

export async function appendInbox(msg: InboxMessage): Promise<void> {
  await appendJsonl(INBOX_FILE, msg);
}

export async function loadTelegramState(): Promise<TelegramState> {
  return await readJson<TelegramState>(TG_STATE_FILE, DEFAULT_STATE);
}

export async function saveTelegramState(state: TelegramState): Promise<void> {
  await writeJson(TG_STATE_FILE, state);
}

export async function inboxSince(ts: number): Promise<InboxMessage[]> {
  const all = await loadInbox();
  return all.filter((m) => m.ts >= ts);
}
