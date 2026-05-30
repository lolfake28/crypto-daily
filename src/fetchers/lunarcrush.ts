import axios from "axios";
import type { LunarCrushResponse } from "../types";

export async function fetchSocialSentiment(coins: string[]): Promise<string> {
  const apiKey = process.env.LUNARCRUSH_API_KEY;
  if (!apiKey) throw new Error("LUNARCRUSH_API_KEY is not set");

  const results: string[] = [];

  for (const coin of coins) {
    try {
      const res = await axios.get<LunarCrushResponse>(
        `https://lunarcrush.com/api4/public/coins/${coin.toLowerCase()}/v1`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }
      );

      const d = res.data.data;
      const sentiment =
        d.sentiment !== undefined
          ? `${d.sentiment > 0 ? "+" : ""}${d.sentiment}`
          : "N/A";
      const galaxyScore =
        d.galaxy_score !== undefined ? d.galaxy_score.toFixed(1) : "N/A";
      const socialVol =
        d.social_volume_24h !== undefined
          ? d.social_volume_24h.toLocaleString()
          : "N/A";

      results.push(
        `${coin}: Social Volume=${socialVol}, Sentiment=${sentiment}, Galaxy Score=${galaxyScore}`
      );
    } catch {
      results.push(`${coin}: sentiment data unavailable`);
    }
  }

  return results.join("\n");
}
