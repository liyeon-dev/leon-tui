import { nanoid } from "nanoid";
import { readJson, writeJson } from "./fs.js";
import type { Message, Session } from "../types.js";

const FILE = "sessions.json";

export async function loadSessions(): Promise<Session[]> {
  return await readJson<Session[]>(FILE, []);
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await writeJson(FILE, sessions);
}

export function createSession(title?: string): Session {
  const now = Date.now();
  return {
    id: nanoid(10),
    title: title?.trim() || "New chat",
    created_at: now,
    updated_at: now,
    messages: [],
  };
}

export function appendMessage(session: Session, message: Message): Session {
  return {
    ...session,
    messages: [...session.messages, message],
    updated_at: Date.now(),
  };
}

export function renameSession(session: Session, title: string): Session {
  return { ...session, title: title.trim() || session.title, updated_at: Date.now() };
}

export function deriveTitle(session: Session): string {
  const firstUser = session.messages.find((m) => m.role === "user");
  if (!firstUser) return session.title;
  const oneLine = firstUser.content.replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? oneLine.slice(0, 37) + "..." : oneLine;
}
