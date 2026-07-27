import { db } from "@workspace/db";
import { conEdSettings } from "@workspace/db/schema";

export interface PortalSettings {
  annualBudget: number;
  updatedAt: Date;
}

interface CachedSettings {
  settings: PortalSettings;
  fetchedAt: number;
}

/** 30-second TTL — changes take effect within 30 s without hammering the DB. */
const CACHE_TTL_MS = 30_000;
let cache: CachedSettings | null = null;

async function fetchFromDb(): Promise<PortalSettings> {
  const [row] = await db.select().from(conEdSettings).limit(1);
  if (row) {
    return { annualBudget: parseFloat(row.annualBudget), updatedAt: row.updatedAt };
  }
  // No row yet — insert the default and return it.
  const [inserted] = await db
    .insert(conEdSettings)
    .values({ annualBudget: "2000" })
    .returning();
  return { annualBudget: 2000, updatedAt: inserted.updatedAt };
}

export async function getSettings(): Promise<PortalSettings> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.settings;
  }
  const settings = await fetchFromDb();
  cache = { settings, fetchedAt: now };
  return settings;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
