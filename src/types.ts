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

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";

export const TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "on_hold", "completed"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
};

// Stages a reminder has progressed through. Used to dedupe Telegram pings.
// Order: t-24h -> t-1h -> at due -> overdue (latter re-fires once per calendar day).
export type ReminderStage = "h24" | "h1" | "due" | "overdue";

export type TaskReminderState = {
  enabled: boolean;
  last_stage?: ReminderStage;
  // For "overdue" we want one ping per day. Stored as YYYY-MM-DD of last overdue ping.
  last_overdue_day?: string;
};

export type TaskCategory = {
  name: string;
  created_at: number;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  category: string;                 // category name (free text but typically from TaskCategory list)
  status: TaskStatus;
  due_date?: number;                // ms epoch; undefined = no due date
  reminders: TaskReminderState;     // Auto Reminder toggle + dedupe state
  created_at: number;
  updated_at: number;
};

export type View =
  | "home"
  | "chatList"
  | "chat"
  | "jobs"
  | "newjob"
  | "editjob"
  | "tasks"
  | "newtask"
  | "edittask"
  | "categories";
