import { chatOnce } from "./deepseek.js";
import { sendMessage } from "./telegram.js";
import { buildUserContext } from "./userMemory.js";
import { loadSessions, saveSessions, createSession, appendMessage, deriveTitle } from "../store/sessions.js";
import { loadTelegramState, saveTelegramState } from "../store/inbox.js";
import type { Session, Message } from "../types.js";

export const LIVE_IDLE_MS = 30 * 60 * 1000;

export type LiveChatResult = {
  assistantText: string;
  sessionId: string;
};

export async function getLiveSessionId(): Promise<string | null> {
  const s = await loadTelegramState();
  return s.live_session_id ?? null;
}

export async function isLiveTelegramSession(sessionId: string): Promise<boolean> {
  const id = await getLiveSessionId();
  return id !== null && id === sessionId;
}

export async function startLiveChat(): Promise<string> {
  const sessions = await loadSessions();
  let live: Session;
  if (sessions.length > 0) {
    live = [...sessions].sort((a, b) => b.updated_at - a.updated_at)[0]!;
  } else {
    live = createSession("Telegram chat");
    sessions.push(live);
    await saveSessions(sessions);
  }
  const state = await loadTelegramState();
  await saveTelegramState({
    ...state,
    live_session_id: live.id,
    live_started_at: Date.now(),
  });
  return live.id;
}

export async function endLiveChat(): Promise<void> {
  const state = await loadTelegramState();
  await saveTelegramState({
    ...state,
    live_session_id: null,
    live_started_at: undefined,
  });
}

export async function handleIncomingTelegram(sessionId: string, text: string): Promise<LiveChatResult> {
  const sessions = await loadSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Live session ${sessionId} not found`);

  const userMsg: Message = { role: "user", content: text, ts: Date.now() };
  let next = appendMessage(session, userMsg);
  if (session.messages.length === 0 || session.title === "New chat") {
    next = { ...next, title: deriveTitle(next) };
  }

  const userCtx = await buildUserContext().catch(() => ({ contextSystemMessage: null as string | null }));
  const reply = await chatOnce(next.messages, {
    temperature: 0.8,
    systemAppend: userCtx.contextSystemMessage ?? undefined,
  });

  const assistantMsg: Message = { role: "assistant", content: reply, ts: Date.now() };
  const finalSession = appendMessage(next, assistantMsg);

  const updated = sessions.map((s) => (s.id === finalSession.id ? finalSession : s));
  await saveSessions(updated);

  const state = await loadTelegramState();
  await saveTelegramState({ ...state, live_started_at: Date.now() });

  await sendMessage(reply);

  return { assistantText: reply, sessionId };
}

export async function mirrorAssistantToTelegram(sessionId: string, assistantText: string): Promise<void> {
  const liveId = await getLiveSessionId();
  if (liveId !== sessionId) return;
  await sendMessage(assistantText);
  const state = await loadTelegramState();
  await saveTelegramState({ ...state, live_started_at: Date.now() });
}
