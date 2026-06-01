import axios, { AxiosError } from "axios";

const ARKHAM_BASE = "https://api.arkhamintelligence.com";
const WHALE_THRESHOLD_USD = 1_000_000; // $1M minimum

interface ArkhamTransfer {
  blockTimestamp: number;
  unitValue: number;       // USD value
  tokenSymbol: string;
  fromAddress?: { address?: string; arkhamEntity?: { name?: string } };
  toAddress?:   { address?: string; arkhamEntity?: { name?: string } };
}

interface ArkhamResponse {
  transfers: ArkhamTransfer[];
}

function fmtUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

function entityLabel(side?: ArkhamTransfer["fromAddress"]): string {
  return side?.arkhamEntity?.name ?? side?.address?.slice(0, 8) ?? "unknown";
}

export async function fetchWhaleActivity(coin: string): Promise<string> {
  const apiKey = process.env.ARKHAM_API_KEY;
  if (!apiKey) return "Whale data unavailable (ARKHAM_API_KEY not set)";

  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // last 24h

  try {
    const [inRes, outRes] = await Promise.all([
      axios.get<ArkhamResponse>(`${ARKHAM_BASE}/transfers`, {
        params: { base: coin.toUpperCase(), flow: "in", usd_gte: WHALE_THRESHOLD_USD, time_gte: since, limit: 10 },
        headers: { "API-Key": apiKey },
        timeout: 10000,
      }),
      axios.get<ArkhamResponse>(`${ARKHAM_BASE}/transfers`, {
        params: { base: coin.toUpperCase(), flow: "out", usd_gte: WHALE_THRESHOLD_USD, time_gte: since, limit: 10 },
        headers: { "API-Key": apiKey },
        timeout: 10000,
      }),
    ]);

    const buys  = inRes.data.transfers  ?? [];
    const sells = outRes.data.transfers ?? [];

    if (!buys.length && !sells.length) {
      return `No whale transactions >$1M detected for ${coin} in last 24h`;
    }

    const lines: string[] = [];

    if (buys.length) {
      const totalBuy = buys.reduce((s, t) => s + (t.unitValue ?? 0), 0);
      lines.push(`Whale BUYS (last 24h): ${buys.length} tx, total ${fmtUSD(totalBuy)}`);
      buys.slice(0, 3).forEach((t) => {
        lines.push(`  • ${fmtUSD(t.unitValue)} from ${entityLabel(t.fromAddress)} → ${entityLabel(t.toAddress)}`);
      });
    }

    if (sells.length) {
      const totalSell = sells.reduce((s, t) => s + (t.unitValue ?? 0), 0);
      lines.push(`Whale SELLS (last 24h): ${sells.length} tx, total ${fmtUSD(totalSell)}`);
      sells.slice(0, 3).forEach((t) => {
        lines.push(`  • ${fmtUSD(t.unitValue)} from ${entityLabel(t.fromAddress)} → ${entityLabel(t.toAddress)}`);
      });
    }

    return lines.join("\n");
  } catch (err) {
    const status = (err as AxiosError)?.response?.status;
    const body   = (err as AxiosError)?.response?.data;
    console.warn(`⚠️  Arkham whale fetch failed for ${coin} [HTTP ${status ?? "no-response"}]:`, (err as Error).message);
    if (body) console.warn("    Arkham error body:", JSON.stringify(body));
    return "Whale data unavailable (Arkham API error)";
  }
}
