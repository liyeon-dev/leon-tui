import { readJson, writeJson } from "./fs.js";
import type { TaskCategory } from "../types.js";

const FILE = "task_categories.json";

// Seed list — created lazily on first run if file is missing. User can edit/add/remove.
const DEFAULT_CATEGORIES: TaskCategory[] = [
  { name: "Personal", created_at: 0 },
  { name: "Work", created_at: 0 },
  { name: "Family", created_at: 0 },
];

export async function loadCategories(): Promise<TaskCategory[]> {
  return await readJson<TaskCategory[]>(FILE, []);
}

export async function saveCategories(cats: TaskCategory[]): Promise<void> {
  await writeJson(FILE, cats);
}

export async function ensureDefaultCategories(): Promise<TaskCategory[]> {
  const existing = await loadCategories();
  if (existing.length > 0) return existing;
  await saveCategories(DEFAULT_CATEGORIES);
  return DEFAULT_CATEGORIES;
}

export function newCategory(name: string): TaskCategory {
  return { name: name.trim(), created_at: Date.now() };
}
