export type Role = "user" | "assistant" | "system";

export type Message = {
  role: Role;
  content: string;
  ts: number;
};

export type Session = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: Message[];
};

export type TelegramAction = {
  type: "telegram";
  chat_id?: string;
};

export type Action = TelegramAction;

export type JobMemory = {
  enabled: boolean;
  summary: string;
  last_summarized_fire_ts?: number;
};

export type Job = {
  id: string;
  title: string;
  // Recurring jobs use cron_expr. One-off jobs use fire_at (ms epoch) instead.
  // Exactly one of the two should be set.
  cron_expr?: string;
  fire_at?: number;
  run_once?: boolean;
  timezone: string;
  prompt_template: string;
  action: Action;
  enabled: boolean;
  created_at: number;
  last_fired_at?: number;
  last_status?: "ok" | "error";
  last_error?: string;
  memory?: JobMemory;
  data_sources?: string[];   // names from sources.json
};

export type Note = {
  ts: number;
  source: "tui" | "telegram";
  text: string;
};

export type UserProfile = {
  summary: string;                       // AI-compacted long-term context
  last_compacted_note_ts: number;        // notes after this are still "raw"
};

export type DataSource = {
  name: string;
  description: string;          // helps the AI decide when this is relevant
  url: string;                  // supports {env:VAR_NAME} placeholders
  method?: "GET" | "POST";
  headers?: Record<string, string>;  // values support {env:VAR_NAME}
  body?: string;                // for POST, supports {env:VAR_NAME}
};

export type InboxMessage = {
  update_id: number;
  ts: number;
  text: string;
};

export type FireRecord = {
  job_id: string;
  ts: number;
  output: string;
};

export type LogEntry = {
  ts: number;
  level: "info" | "error";
  source: string;
  message: string;
};

export type View = "home" | "chatList" | "chat" | "jobs" | "newjob" | "editjob";
