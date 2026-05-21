import { fetch } from "undici";
import type { DataSource } from "../types.js";
import { getSource } from "../store/sources.js";

function interpolate(template: string): string {
  return template.replace(/\{env:([A-Z0-9_]+)\}/g, (_m, name: string) => {
    const v = process.env[name];
    if (v == null) {
      throw new Error(`Missing env var ${name} referenced by a data source. Add it to .env.`);
    }
    return v;
  });
}

function interpolateAll(source: DataSource): DataSource {
  const headers: Record<string, string> = {};
  if (source.headers) {
    for (const [k, v] of Object.entries(source.headers)) {
      headers[k] = interpolate(v);
    }
  }
  return {
    ...source,
    url: interpolate(source.url),
    headers,
    body: source.body ? interpolate(source.body) : undefined,
  };
}

export type FetchedSource = {
  name: string;
  description: string;
  data: unknown;       // parsed JSON if response was JSON, else raw string
  error?: string;
};

export async function fetchSource(source: DataSource): Promise<FetchedSource> {
  const resolved = interpolateAll(source);
  try {
    const res = await fetch(resolved.url, {
      method: resolved.method || "GET",
      headers: resolved.headers,
      body: resolved.body,
    });
    const text = await res.text();
    if (!res.ok) {
      return { name: source.name, description: source.description, data: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep as text
    }
    return { name: source.name, description: source.description, data: parsed };
  } catch (err: any) {
    return { name: source.name, description: source.description, data: null, error: err?.message || String(err) };
  }
}

export async function fetchSourcesForJob(sourceNames: string[]): Promise<FetchedSource[]> {
  if (sourceNames.length === 0) return [];
  const results: FetchedSource[] = [];
  for (const name of sourceNames) {
    const source = await getSource(name);
    if (!source) {
      results.push({ name, description: "(unknown source)", data: null, error: `Source "${name}" not registered in data/sources.json` });
      continue;
    }
    results.push(await fetchSource(source));
  }
  return results;
}

export function formatSourcesAsContext(sources: FetchedSource[]): string | null {
  if (sources.length === 0) return null;
  const lines: string[] = ["[LIVE DATA SOURCES — fetched fresh just now]"];
  for (const s of sources) {
    lines.push("");
    lines.push(`## ${s.name}`);
    lines.push(`(${s.description})`);
    if (s.error) {
      lines.push(`ERROR: ${s.error}`);
    } else {
      const text = typeof s.data === "string" ? s.data : JSON.stringify(s.data, null, 2);
      // Truncate very large payloads
      const trimmed = text.length > 4000 ? text.slice(0, 4000) + "\n...(truncated)" : text;
      lines.push(trimmed);
    }
  }
  lines.push("");
  lines.push("Use the above live data to make your message accurate and current. Do not invent values that contradict it.");
  return lines.join("\n");
}
