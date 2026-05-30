import axios from "axios";

// CoinGecko free API — no key required
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Map ticker → CoinGecko ID
const COIN_ID_MAP: Record<string, string> = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  BNB:   "binancecoin",
  XRP:   "ripple",
  ADA:   "cardano",
  DOGE:  "dogecoin",
  AVAX:  "avalanche-2",
  DOT:   "polkadot",
  MATIC: "matic-network",
  LINK:  "chainlink",
  UNI:   "uniswap",
  ATOM:  "cosmos",
  LTC:   "litecoin",
  TRX:   "tron",
};

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  ath: number;
  ath_change_percentage: number;
}

function fmt(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
}

function fmtPrice(n: number): string {
  return n >= 1
    ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `$${n.toFixed(6)}`;
}

function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

export async function fetchMarketData(coins: string[]): Promise<string> {
  const ids = coins
    .map((c) => COIN_ID_MAP[c.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) return "Market data unavailable (coins not in CoinGecko map)";

  try {
    const res = await axios.get<CoinMarket[]>(`${COINGECKO_BASE}/coins/markets`, {
      params: {
        vs_currency: "usd",
        ids,
        order: "market_cap_desc",
        price_change_percentage: "7d",
        sparkline: false,
      },
      timeout: 12000,
    });

    if (!res.data.length) return "Market data unavailable (empty response)";

    return res.data
      .map((c) => {
        const change24 = fmt(c.price_change_percentage_24h ?? 0);
        const change7d  = fmt(c.price_change_percentage_7d_in_currency ?? 0);
        const athDiff   = fmt(c.ath_change_percentage ?? 0);
        return (
          `${c.symbol.toUpperCase()} (${c.name}): ` +
          `Price=${fmtPrice(c.current_price)} | ` +
          `24h=${change24} | 7d=${change7d} | ` +
          `Vol=${fmtVol(c.total_volume)} | ` +
          `ATH diff=${athDiff}`
        );
      })
      .join("\n");
  } catch (err) {
    console.warn("⚠️  CoinGecko fetch failed:", (err as Error).message);
    return "Market data unavailable (CoinGecko error)";
  }
}
