import { appendJsonl, readJsonl } from "./fs.js";
import type { FireRecord } from "../types.js";

const FILE = "fires.jsonl";

export async function appendFire(record: FireRecord): Promise<void> {
  await appendJsonl(FILE, record);
}

export async function loadFires(): Promise<FireRecord[]> {
  return await readJsonl<FireRecord>(FILE);
}

export async function firesForJob(job_id: string, sinceTs = 0): Promise<FireRecord[]> {
  const all = await loadFires();
  return all
    .filter((f) => f.job_id === job_id && f.ts > sinceTs)
    .sort((a, b) => a.ts - b.ts);
}
