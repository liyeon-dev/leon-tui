import { nanoid } from "nanoid";
import { readJson, writeJson } from "./fs.js";
import type { Job } from "../types.js";

const FILE = "jobs.json";

export async function loadJobs(): Promise<Job[]> {
  return await readJson<Job[]>(FILE, []);
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  await writeJson(FILE, jobs);
}

export function newJob(partial: Omit<Job, "id" | "created_at" | "enabled">): Job {
  return {
    id: nanoid(10),
    created_at: Date.now(),
    enabled: true,
    ...partial,
  };
}
