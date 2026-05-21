import { loadTasks, saveTasks } from "../store/tasks.js";
import { sendMessage, telegramStatus } from "../services/telegram.js";
import { TASK_STATUS_LABELS, type ReminderStage, type Task } from "../types.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const DUE_WINDOW_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let scanning = false;

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickStage(task: Task, now: number): ReminderStage | null {
  if (task.due_date === undefined) return null;
  if (task.reminders.enabled === false) return null;
  if (task.status === "completed") return null;

  const remaining = task.due_date - now;
  const last = task.reminders.last_stage;

  if (remaining > 0 && remaining <= ONE_HOUR_MS && (last === undefined || last === "h24")) {
    return "h1";
  }
  if (remaining > 0 && remaining <= ONE_DAY_MS && last === undefined) {
    return "h24";
  }
  if (remaining <= 0 && remaining > -DUE_WINDOW_MS && (last === undefined || last === "h24" || last === "h1")) {
    return "due";
  }
  if (remaining <= -DUE_WINDOW_MS && task.reminders.last_overdue_day !== todayKey()) {
    return "overdue";
  }
  return null;
}

function stageLabel(stage: ReminderStage, dueDate: number): string {
  switch (stage) {
    case "h24": return "Due in less than 24 hours";
    case "h1": return "Due in less than 1 hour";
    case "due": return "Due now";
    case "overdue": return `Overdue since ${new Date(dueDate).toLocaleString()}`;
  }
}

function buildMessage(task: Task, stage: ReminderStage): string {
  const status = TASK_STATUS_LABELS[task.status];
  const category = task.category && task.category.trim() ? task.category : "uncategorized";
  const due = task.due_date !== undefined ? new Date(task.due_date).toLocaleString() : "—";
  const label = stageLabel(stage, task.due_date!);

  const lines = [
    `🔔 *Task reminder: ${task.title}*`,
    "",
    `*Status:* ${status}`,
    `*Category:* ${category}`,
    `*Due:* ${due}`,
    `*${label}*`,
  ];
  if (task.description && task.description.trim()) {
    lines.push("", task.description);
  }
  return lines.join("\n");
}

export async function scanOnce(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    if (!telegramStatus().configured) return;

    const tasks = await loadTasks();
    const now = Date.now();
    let mutated = false;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const stage = pickStage(task, now);
      if (!stage) continue;

      try {
        await sendMessage(buildMessage(task, stage));
        const nextReminders = { ...task.reminders, last_stage: stage };
        if (stage === "overdue") {
          nextReminders.last_overdue_day = todayKey();
        }
        tasks[i] = { ...task, reminders: nextReminders, updated_at: Date.now() };
        mutated = true;
      } catch (err: any) {
        console.error(`taskReminders: failed to send for task ${task.id} (${task.title}): ${err?.message || err}`);
      }
    }

    if (mutated) {
      await saveTasks(tasks);
    }
  } catch (err: any) {
    console.error(`taskReminders: scan failed: ${err?.message || err}`);
  } finally {
    scanning = false;
  }
}

export function startReminderScan(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => { void scanOnce(); }, intervalMs);
  void scanOnce();
}

export function stopReminderScan(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
