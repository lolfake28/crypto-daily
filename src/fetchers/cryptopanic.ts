import Parser from "rss-parser";
import axios, { AxiosError } from "axios";

const parser = new Parser({ timeout: 10000 });

// Free RSS feeds — no API key needed
const FEEDS = [
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Decrypt",       url: "https://decrypt.co/feed" },
  { name: "BeInCrypto",    url: "https://beincrypto.com/feed/" },
  { name: "CoinGape",      url: "https://coingape.com/feed/" },
  { name: "AMBCrypto",     url: "https://ambcrypto.com/feed/" },
  { name: "Blockworks",    url: "https://blockworks.co/feed" },
];

interface NewsItem {
  title: string;
  source: string;
  pubDate?: string;
}

interface CMCNewsItem {
  title?: string;
  source?: { name?: string };
  publishedAt?: string;
}

export async function fetchCMCNews(symbol: string): Promise<string> {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await axios.get<{ data: CMCNewsItem[] }>(
      "https://api.coinmarketcap.com/v1/cryptocurrency/news",
      {
        params: { symbol: symbol.toUpperCase(), limit: 10 },
        headers: { "X-CMC_PRO_API_KEY": apiKey },
        timeout: 10000,
      }
    );

    const items = res.data?.data ?? [];
    if (!items.length) return "";

    return items
      .filter((item) => item.title)
      .map((item) => `[CMC] ${item.title}`)
      .join("\n");
  } catch (err) {
    const status = (err as AxiosError)?.response?.status;
    const body = (err as AxiosError)?.response?.data;
    console.warn(`⚠️  CMC news fetch failed for ${symbol} [HTTP ${status ?? "no-response"}]:`, (err as Error).message);
    if (body) console.warn("    CMC error body:", JSON.stringify(body));
    return "";
  }
}

export async function fetchCryptoNews(): Promise<string> {
  const allItems: NewsItem[] = [];

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return parsed.items.slice(0, 10).map((item) => ({
        title: item.title?.trim() ?? "",
        source: feed.name,
        pubDate: item.pubDate ?? item.isoDate,
      }));
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value.filter((i) => i.title));
    } else {
      console.warn("⚠️  RSS feed failed:", result.reason?.message ?? result.reason);
    }
  }

  if (!allItems.length) {
    throw new Error("All RSS feeds failed — check internet connection");
  }

  // Sort newest first
  allItems.sort((a, b) => {
    const tA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tB - tA;
  });

  return allItems
    .slice(0, 20)
    .map((item, i) => `${i + 1}. [${item.source}] ${item.title}`)
    .join("\n");
}
