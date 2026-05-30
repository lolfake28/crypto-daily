import Anthropic from "@anthropic-ai/sdk";

// Lazy init so dotenv.config() in index.ts runs first
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set in .env");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a professional cryptocurrency market analyst and news curator.
Your job is to analyze daily crypto news, social sentiment, X/Twitter trends, and live market data,
then produce a concise, clear, and insightful daily digest for a retail crypto investor.

Always respond using ONLY Telegram-compatible formatting (no ## headers, no --- dividers, no HTML):
- Use *bold* for section titles
- Use plain bullet points with •
- Use emojis for visual structure

Respond in this exact structure:

*📊 Market Mood*
[1 sentence: Bullish / Bearish / Neutral + reason]

*🔥 Top Stories*
• [story 1 — max 2 sentences]
• [story 2]
• [story 3]
• [story 4]
• [story 5]

*📣 Social Buzz*
[2-3 sentences on what people are talking about on X/Twitter today]

*⚠️ Risks to Watch*
• [risk 1]
• [risk 2]
• [risk 3]

*💡 Coins to Watch Today*
• *COIN* — [1-line reason]
• *COIN* — [1-line reason]
• *COIN* — [1-line reason]

*🆕 New Launches & Listings*
• *COIN* — [1-line: what it is + why it matters, or "nothing notable today" if none]
• *COIN* — [1-line]

*💎 Hidden Gems (Mid-Cap Movers, rank #11–100)*
• *COIN* (#rank) — [direction: 🟢 UP / 🔴 DOWN] [1-line reason based on price action or news]
• *COIN* (#rank) — [direction] [1-line reason]
• *COIN* (#rank) — [direction] [1-line reason]

*📈 Top 5 Predictions*
🟢 *BULLISH — COIN* | Confidence: High/Medium/Low
[1 sentence reason]

🔴 *BEARISH — COIN* | Confidence: High/Medium/Low
[1 sentence reason]

(repeat for 5 coins total)

_Disclaimer: Not financial advice. Always do your own research._

Keep the tone professional but easy to understand. Do not use excessive jargon.
Always respond in English regardless of the language of the input data.
Total response must be under 1000 words.`;

export async function generateDailySummary(
  news: string,
  sentiment: string,
  date: string,
  xTrends?: string,
  marketData?: string,
  midCapData?: string
): Promise<string> {
  const xSection = xTrends
    ? `\n--- X (TWITTER) TRENDING TWEETS ---\n${xTrends}\n`
    : "";

  const marketSection = marketData
    ? `\n--- LIVE MARKET DATA (price, 24h/7d change, volume, ATH diff) ---\n${marketData}\n`
    : "";

  const midCapSection = midCapData
    ? `\n--- MID-CAP MOVERS (rank #11–100, sorted by biggest 24h move) ---\n${midCapData}\n`
    : "";

  const userPrompt = `Here is today's crypto data. Date: ${date}

--- NEWS HEADLINES ---
${news}
${xSection}${marketSection}${midCapSection}
--- SOCIAL SENTIMENT DATA (LunarCrush) ---
${sentiment}

Please generate today's daily crypto digest. Use the mid-cap movers data for the Hidden Gems section and the news headlines for the New Launches & Listings section. Include the Top 5 Bullish/Bearish predictions based on all data above.`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }
  return block.text;
}
