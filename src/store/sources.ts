import { readJson, writeJson } from "./fs.js";
import type { DataSource } from "../types.js";

const FILE = "sources.json";

type SourcesFile = { sources: DataSource[] };

const DEFAULT_SOURCES: DataSource[] = [
  {
    name: "weather",
    description:
      "Current weather and next-24h hourly forecast from Open-Meteo (free, no key). " +
      "Configured for Shah Alam, Selangor (lat 3.07, lon 101.52). " +
      "Returns JSON with current temperature, weather_code, wind, humidity, and an hourly array. " +
      "Edit data/sources.json to change location.",
    url:
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude={env:LEON_LATITUDE}" +
      "&longitude={env:LEON_LONGITUDE}" +
      "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m" +
      "&hourly=temperature_2m,precipitation_probability,weather_code" +
      "&forecast_days=2" +
      "&timezone=auto",
    method: "GET",
  },
];

export async function loadSources(): Promise<DataSource[]> {
  const data = await readJson<SourcesFile>(FILE, { sources: [] });
  return data.sources;
}

export async function saveSources(sources: DataSource[]): Promise<void> {
  await writeJson(FILE, { sources });
}

export async function getSource(name: string): Promise<DataSource | undefined> {
  const all = await loadSources();
  return all.find((s) => s.name === name);
}

export async function ensureDefaultSources(): Promise<void> {
  const existing = await loadSources();
  if (existing.length > 0) return;
  await saveSources(DEFAULT_SOURCES);
}
