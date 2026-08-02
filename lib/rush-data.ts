import { Redis } from "@upstash/redis";

// Read-only connection to the rush-taxi project's own Upstash Redis
// instance. Named RUSH_* (not KV_*) since this admin app will eventually
// connect to more than one property's database.
const redis =
  process.env.RUSH_KV_REST_API_URL && process.env.RUSH_KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.RUSH_KV_REST_API_URL,
        token: process.env.RUSH_KV_REST_API_TOKEN,
      })
    : null;

export interface LeadRecord {
  name: string;
  phone: string;
  source: "auto" | "manual";
  ip: string;
  userAgent: string;
  deviceId: string;
  ts: number;
}

export interface ToppingVote {
  name: string;
  votes: number;
}

// Mirrors rush-taxi's lib/toppings.ts id->name mapping — duplicated here
// since the two are separate deployed projects with no shared package.
const TOPPING_NAMES: Record<string, string> = {
  pepperoni: "Pepperoni",
  sausage: "Sausage",
  bacon: "Bacon",
  mushroom: "Mushroom",
  pineapple: "Pineapple",
  peppers: "Bell Peppers",
  onion: "Onion",
  olives: "Black Olives",
  "hot-cheetos": "Hot Cheetos",
};

export interface PairSummary {
  ip: string;
  deviceId: string;
  names: string[];
  leadCount: number;
  voteCount: number;
  banned: boolean;
}

function parseEntry(raw: unknown): LeadRecord {
  return typeof raw === "string" ? JSON.parse(raw) : (raw as LeadRecord);
}

export async function getRushLeads(): Promise<LeadRecord[]> {
  if (!redis) return [];
  const raw = await redis.lrange("rush-taxi:leads", 0, -1);
  return raw.map(parseEntry).reverse();
}

export async function getRushVotes(): Promise<ToppingVote[]> {
  // ZINCRBY only creates a member on its first vote, so toppings with zero
  // votes never make it into the sorted set at all — start from the full
  // known list and default anything missing to 0, rather than silently
  // dropping never-voted toppings from the table.
  const counts = new Map<string, number>();
  if (redis) {
    const raw = await redis.zrange("rush-taxi:topping-votes", 0, -1, {
      withScores: true,
    });
    for (let i = 0; i < raw.length; i += 2) {
      counts.set(String(raw[i]), Number(raw[i + 1]));
    }
  }

  return Object.entries(TOPPING_NAMES)
    .map(([id, name]) => ({ name, votes: counts.get(id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
}

// A "pair" is one (IP, device) combination — the unit that leads, votes,
// and bans are all tracked and enforced by. Never IP alone (would block an
// entire shared WiFi) or device alone (would follow someone onto a
// different, innocent network).
function pairKey(ip: string, deviceId: string): string {
  return `${ip}|${deviceId}`;
}

function splitPairKey(key: string): { ip: string; deviceId: string } {
  const [ip, deviceId] = key.split("|");
  return { ip: ip ?? "", deviceId: deviceId ?? "" };
}

export async function getPairSummaries(): Promise<PairSummary[]> {
  if (!redis) return [];

  const [leadsRaw, votesByPair, bannedPairs] = await Promise.all([
    redis.lrange("rush-taxi:leads", 0, -1),
    redis.hgetall<Record<string, string>>("rush-taxi:votes-by-pair"),
    redis.smembers("rush-taxi:banned-pairs"),
  ]);

  const leads = leadsRaw.map(parseEntry);
  const bannedSet = new Set(bannedPairs as string[]);

  const byPair = new Map<string, { leadCount: number; names: string[] }>();
  for (const lead of leads) {
    const key = pairKey(lead.ip, lead.deviceId);
    const entry = byPair.get(key) ?? { leadCount: 0, names: [] };
    entry.leadCount += 1;
    if (!entry.names.includes(lead.name)) entry.names.push(lead.name);
    byPair.set(key, entry);
  }

  const allPairs = new Set([
    ...byPair.keys(),
    ...Object.keys(votesByPair ?? {}),
    ...bannedSet,
  ]);

  return Array.from(allPairs)
    .map((key) => {
      const { ip, deviceId } = splitPairKey(key);
      return {
        ip,
        deviceId,
        names: byPair.get(key)?.names ?? [],
        leadCount: byPair.get(key)?.leadCount ?? 0,
        voteCount: Number(votesByPair?.[key] ?? 0),
        banned: bannedSet.has(key),
      };
    })
    .sort((a, b) => b.voteCount + b.leadCount - (a.voteCount + a.leadCount));
}

// Banning archives the pair's leads and vote contribution rather than
// deleting them — moved out of the live keys into rush-taxi:archived-*
// so the leaderboard/leads list reflect only trusted activity, while the
// original data stays available for manual review if ever needed. Always
// scoped to the exact (IP, device) pair — never the IP or device alone.
export async function banPair(ip: string, deviceId: string): Promise<void> {
  if (!redis) return;
  const key = pairKey(ip, deviceId);

  const leadsRaw = await redis.lrange("rush-taxi:leads", 0, -1);
  const keepLeads: string[] = [];
  const archivedLeads: string[] = [];
  for (const raw of leadsRaw) {
    const entry = parseEntry(raw);
    const payload = typeof raw === "string" ? raw : JSON.stringify(raw);
    (entry.ip === ip && entry.deviceId === deviceId ? archivedLeads : keepLeads).push(payload);
  }
  if (archivedLeads.length > 0) {
    await redis.del("rush-taxi:leads");
    if (keepLeads.length > 0) await redis.rpush("rush-taxi:leads", ...keepLeads);
    await redis.rpush("rush-taxi:archived-leads", ...archivedLeads);
  }

  const voteDetail =
    (await redis.hgetall<Record<string, string>>(
      "rush-taxi:votes-by-pair-topping",
    )) ?? {};
  const prefix = `${key}|`;
  const breakdown: Record<string, number> = {};
  for (const [field, value] of Object.entries(voteDetail)) {
    if (!field.startsWith(prefix)) continue;
    const toppingId = field.slice(prefix.length);
    const count = Number(value);
    breakdown[toppingId] = count;
    await redis.zincrby("rush-taxi:topping-votes", -count, toppingId);
    await redis.hdel("rush-taxi:votes-by-pair-topping", field);
  }
  if (Object.keys(breakdown).length > 0) {
    await redis.hset("rush-taxi:archived-votes", {
      [key]: JSON.stringify(breakdown),
    });
  }
  await redis.hdel("rush-taxi:votes-by-pair", key);

  await redis.sadd("rush-taxi:banned-pairs", key);
}

export async function unbanPair(ip: string, deviceId: string): Promise<void> {
  if (!redis) return;
  await redis.srem("rush-taxi:banned-pairs", pairKey(ip, deviceId));
}

// Archives the entire current leaderboard (and its per-IP breakdown) as a
// single timestamped snapshot, then clears the live counters to zero.
export async function resetVotes(): Promise<void> {
  if (!redis) return;

  const [votesSnapshot, byPairSnapshot, byPairToppingSnapshot] =
    await Promise.all([
      redis.zrange<string[]>("rush-taxi:topping-votes", 0, -1, {
        withScores: true,
      }),
      redis.hgetall<Record<string, string>>("rush-taxi:votes-by-pair"),
      redis.hgetall<Record<string, string>>("rush-taxi:votes-by-pair-topping"),
    ]);

  const votes: Record<string, number> = {};
  for (let i = 0; i < votesSnapshot.length; i += 2) {
    votes[votesSnapshot[i]] = Number(votesSnapshot[i + 1]);
  }

  await redis.rpush(
    "rush-taxi:archived-topping-votes",
    JSON.stringify({
      archivedAt: Date.now(),
      votes,
      byPair: byPairSnapshot ?? {},
      byPairTopping: byPairToppingSnapshot ?? {},
    }),
  );

  await Promise.all([
    redis.del("rush-taxi:topping-votes"),
    redis.del("rush-taxi:votes-by-pair"),
    redis.del("rush-taxi:votes-by-pair-topping"),
  ]);
}
