import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

let dirReady: Promise<void> | null = null;
export async function ensureDataDir(): Promise<void> {
  if (!dirReady) {
    dirReady = fs.mkdir(DATA_DIR, { recursive: true }).then(() => undefined);
  }
  try {
    await dirReady;
  } catch {
    // Retry once on the next call if it failed (e.g. transient AV lock on Windows)
    dirReady = null;
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export function dataPath(file: string): string {
  return path.join(DATA_DIR, file);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const p = dataPath(file);
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const p = dataPath(file);
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function appendJsonl(file: string, entry: unknown): Promise<void> {
  await ensureDataDir();
  const p = dataPath(file);
  await fs.appendFile(p, JSON.stringify(entry) + "\n", "utf8");
}

export async function readJsonl<T>(file: string): Promise<T[]> {
  await ensureDataDir();
  const p = dataPath(file);
  try {
    const raw = await fs.readFile(p, "utf8");
    const out: T[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as T);
      } catch {
        // skip corrupt line
      }
    }
    return out;
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}
