import axios, { AxiosError } from "axios";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apidojo~tweet-scraper";
const POLL_INTERVAL_MS = 4000;  // check every 4s
const MAX_WAIT_MS = 90000;      // give up after 90s

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
}

interface ApifyRunResponse {
  data: ApifyRun;
}

interface ApifyTweet {
  author?: { userName?: string; name?: string };
  text?: string;
  fullText?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  createdAt?: string;
}

// Poll until the run finishes or we time out
async function waitForRun(runId: string, token: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  const terminalStates = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await axios.get<ApifyRunResponse>(
      `${APIFY_BASE}/acts/${ACTOR_ID}/runs/${runId}`,
      { params: { token }, timeout: 10000 }
    );

    const { status } = res.data.data;

    if (status === "SUCCEEDED") return;
    if (terminalStates.has(status)) {
      throw new Error(`Apify run ended with status: ${status}`);
    }
    // READY or RUNNING — keep polling
  }

  throw new Error("Timed out waiting for Apify run to finish");
}

export async function fetchXSentiment(coins: string[]): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return "X/Twitter data unavailable (APIFY_API_TOKEN not set — get free token at apify.com)";
  }

  // Build cashtag query: "$BTC OR $ETH OR $SOL"
  const query = coins.map((k) => `$${k.toUpperCase()}`).join(" OR ");

  try {
    // 1. Start the scraper run
    const runRes = await axios.post<ApifyRunResponse>(
      `${APIFY_BASE}/acts/${ACTOR_ID}/runs`,
      {
        searchTerms: [query],
        maxTweets: 50,
        sort: "Latest",
      },
      {
        params: { token },
        timeout: 15000,
      }
    );

    const { id: runId, defaultDatasetId } = runRes.data.data;
    console.log(`  ⏳ Apify X scraper running (id: ${runId})...`);

    // 2. Wait for the run to finish before reading results
    await waitForRun(runId, token);
    console.log("  ✅ Apify run complete, fetching tweets...");

    // 3. Fetch results from the dataset
    const dataRes = await axios.get<ApifyTweet[]>(
      `${APIFY_BASE}/datasets/${defaultDatasetId}/items`,
      {
        params: { token, limit: 30 },
        timeout: 15000,
      }
    );

    const tweets = dataRes.data;
    if (!tweets.length) {
      return "X/Twitter: no tweets found for tracked coins today";
    }

    // Sort by engagement (likes + retweets weighted 2x)
    const sorted = tweets
      .filter((t) => t.text ?? t.fullText)
      .sort((a, b) => {
        const engA = (a.likeCount ?? 0) + (a.retweetCount ?? 0) * 2;
        const engB = (b.likeCount ?? 0) + (b.retweetCount ?? 0) * 2;
        return engB - engA;
      })
      .slice(0, 15);

    return sorted
      .map((t, i) => {
        const handle = t.author?.userName ? `@${t.author.userName}` : "anon";
        const text = (t.text ?? t.fullText ?? "")
          .replace(/https?:\/\/\S+/g, "")  // strip URLs
          .replace(/\n/g, " ")
          .trim()
          .slice(0, 140);
        return `${i + 1}. ${handle}: ${text} [❤️${t.likeCount ?? 0} 🔁${t.retweetCount ?? 0}]`;
      })
      .join("\n");

  } catch (err) {
    const axiosErr = err as AxiosError;
    const status = axiosErr?.response?.status;
    const body = axiosErr?.response?.data;
    if (status === 401) {
      return "X/Twitter data unavailable (invalid Apify token)";
    }
    console.warn(`⚠️  Apify X fetch failed [HTTP ${status ?? "no-response"}]:`, (err as Error).message);
    if (body) console.warn("    Apify error body:", JSON.stringify(body));
    return "X/Twitter data unavailable (Apify scraper error)";
  }
}
