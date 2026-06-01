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
  WLD:   "worldcoin-wld",
  ENA:   "ethena",
  SUI:   "sui",
  APT:   "aptos",
  ARB:   "arbitrum",
  OP:    "optimism",
  NEAR:  "near",
  INJ:   "injective-protocol",
  AAVE:  "aave",
  CRV:   "curve-dao-token",
  LDO:   "lido-dao",
  STX:   "blockstack",
  AXS:   "axie-infinity",
  APE:   "apecoin",
  GMX:   "gmx",
  RUNE:  "thorchain",
  FTM:   "fantom",
  ICP:   "internet-computer",
  HBAR:  "hedera-hashgraph",
  GRT:   "the-graph",
  SNX:   "havven",
  COMP:  "compound-governance-token",
  YFI:   "yearn-finance",
  SUSHI: "sushi",
  CAKE:  "pancakeswap-token",
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
  fully_diluted_valuation: number | null;
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

export async function fetchMidCapData(): Promise<string> {
  try {
    // Fetch coins ranked 11–100, sorted by market cap
    const [page1, page2] = await Promise.all([
      axios.get<CoinMarket[]>(`${COINGECKO_BASE}/coins/markets`, {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 50,
          page: 1,
          price_change_percentage: "7d",
          sparkline: false,
        },
        timeout: 12000,
      }),
      axios.get<CoinMarket[]>(`${COINGECKO_BASE}/coins/markets`, {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 50,
          page: 2,
          price_change_percentage: "7d",
          sparkline: false,
        },
        timeout: 12000,
      }),
    ]);

    // Skip top 10, take ranks 11–100
    const midCaps = [...page1.data.slice(10), ...page2.data];

    if (!midCaps.length) return "Mid-cap data unavailable";

    // Sort by absolute 24h change to surface the biggest movers
    const sorted = midCaps
      .filter((c) => c.price_change_percentage_24h != null)
      .sort((a, b) =>
        Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h)
      )
      .slice(0, 20);

    return sorted
      .map((c) => {
        const change24 = fmt(c.price_change_percentage_24h ?? 0);
        const change7d  = fmt(c.price_change_percentage_7d_in_currency ?? 0);
        return (
          `#${c.market_cap_rank} ${c.symbol.toUpperCase()} (${c.name}): ` +
          `Price=${fmtPrice(c.current_price)} | ` +
          `24h=${change24} | 7d=${change7d} | ` +
          `Vol=${fmtVol(c.total_volume)}`
        );
      })
      .join("\n");
  } catch (err) {
    console.warn("⚠️  CoinGecko mid-cap fetch failed:", (err as Error).message);
    return "Mid-cap data unavailable (CoinGecko error)";
  }
}

interface CoinDetail {
  market_data: {
    total_volume: { usd: number };
  };
}

// Returns aggregated 24h volume across all exchanges, or null if coin not in map
export async function fetchAggregatedVolume(symbol: string): Promise<number | null> {
  const coinId = COIN_ID_MAP[symbol.toUpperCase()];
  if (!coinId) return null;

  try {
    const res = await axios.get<CoinDetail>(`${COINGECKO_BASE}/coins/${coinId}`, {
      params: { localization: false, tickers: false, community_data: false, developer_data: false },
      timeout: 10000,
    });
    return res.data.market_data.total_volume.usd ?? null;
  } catch (err) {
    console.warn(`⚠️  CoinGecko aggregated volume fetch failed for ${symbol}:`, (err as Error).message);
    return null;
  }
}
