import { nanoid } from "nanoid";
import { readJson, writeJson } from "./fs.js";
import type { Task } from "../types.js";

const FILE = "tasks.json";

export async function loadTasks(): Promise<Task[]> {
  return await readJson<Task[]>(FILE, []);
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await writeJson(FILE, tasks);
}

export function newTask(partial: Omit<Task, "id" | "created_at" | "updated_at" | "reminders"> & {
  reminders?: Task["reminders"];
}): Task {
  const now = Date.now();
  return {
    id: nanoid(10),
    created_at: now,
    updated_at: now,
    reminders: partial.reminders ?? { enabled: false },
    ...partial,
  };
}
