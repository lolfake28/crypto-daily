import axios, { AxiosError } from "axios";
import type { Tweet, TwitterSearchResponse } from "../types";

// X API v2 — requires Bearer Token from developer.twitter.com
// Minimum plan needed for search: Basic ($100/month)
// Free tier only supports posting, not reading/searching
const X_API_BASE = "https://api.twitter.com/2";

const CRYPTO_QUERIES = [
  "(Bitcoin OR BTC) -is:retweet -is:reply lang:en",
  "(Ethereum OR ETH) -is:retweet -is:reply lang:en",
  "(crypto OR cryptocurrency OR altcoin) -is:retweet -is:reply lang:en",
];

function cleanTweetText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")   // remove URLs
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export async function fetchXTrends(): Promise<string> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return "X/Twitter data unavailable (X_BEARER_TOKEN not set — requires X API Basic plan)";
  }

  const allTweets: Tweet[] = [];

  for (const query of CRYPTO_QUERIES) {
    try {
      const res = await axios.get<TwitterSearchResponse>(
        `${X_API_BASE}/tweets/search/recent`,
        {
          headers: { Authorization: `Bearer ${bearerToken}` },
          params: {
            query,
            max_results: 10,
            "tweet.fields": "public_metrics,created_at",
            sort_order: "relevancy",
          },
          timeout: 12000,
        }
      );

      if (res.data.data) {
        allTweets.push(...res.data.data);
      }
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 401) {
        return "X/Twitter data unavailable (invalid or expired Bearer Token)";
      }
      if (status === 403) {
        return "X/Twitter data unavailable (API plan does not support search — upgrade to Basic $100/month)";
      }
      if (status === 429) {
        return "X/Twitter data unavailable (rate limit reached — try again later)";
      }
      // Non-fatal: skip this query
      console.warn(`⚠️  X API query failed for "${query}":`, (err as Error).message);
    }
  }

  if (allTweets.length === 0) {
    return "X/Twitter data unavailable (no tweets returned)";
  }

  // Deduplicate by id
  const unique = Array.from(new Map(allTweets.map((t) => [t.id, t])).values());

  // Sort by engagement (likes + retweets)
  const sorted = unique
    .filter((t) => t.public_metrics)
    .sort((a, b) => {
      const engA =
        (a.public_metrics?.like_count ?? 0) +
        (a.public_metrics?.retweet_count ?? 0) * 2;
      const engB =
        (b.public_metrics?.like_count ?? 0) +
        (b.public_metrics?.retweet_count ?? 0) * 2;
      return engB - engA;
    })
    .slice(0, 10);

  const lines = sorted.map((t, i) => {
    const likes = t.public_metrics?.like_count ?? 0;
    const rts = t.public_metrics?.retweet_count ?? 0;
    const text = cleanTweetText(t.text);
    return `${i + 1}. [❤️${likes} 🔁${rts}] ${text}`;
  });

  return lines.join("\n");
}
