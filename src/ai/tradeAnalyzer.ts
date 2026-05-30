import Anthropic from "@anthropic-ai/sdk";
import type { TechnicalData } from "../fetchers/binance";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function fmtPrice(n: number): string {
  return n >= 1
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(6);
}

function fmtVol(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
  return `$${(usd / 1_000_000).toFixed(2)}M`;
}

const SYSTEM_PROMPT = `You are an expert cryptocurrency futures trader and technical analyst specializing in swing trade setups.

You will be given real-time market data for a coin. Using this data, produce a precise 6–12 hour swing trade setup.

CRITICAL: Output ONLY the trade setup in the EXACT plain-text format below — no extra commentary, no markdown headers, no backticks. Use the exact field names and dashes shown. All prices must use real numbers from the data provided.

COIN: {symbol}
TIME: {current time UTC}
PRICE: ${'{price}'}
TIMEFRAME: 6–12 hour swing

--- MARKET DATA ---
RSI (14): {value} ({overbought/oversold/neutral})
Volume 24h: {value} ({increasing/decreasing vs 7d avg})
24h Range: Low ${'{low}'} / High ${'{high}'}
24h Change: {%}
7d Change: {%}
MA Trend (4H): {Bullish/Bearish/Neutral}
MA Trend (Daily): {Bullish/Bearish/Neutral}
Distance from ATH: {%}

--- KEY LEVELS (MACRO) ---
Strong Resistance 2: ${'{level}'}
Strong Resistance 1: ${'{level}'}
Current Price: ${'{price}'}
Strong Support 1: ${'{level}'}
Strong Support 2: ${'{level}'}
Key EMA levels: EMA20=${'{price}'}, EMA50=${'{price}'}, EMA200=${'{price}'}

--- SHORT SQUEEZE / LIQUIDATION MAP ---
Short liquidation cluster: ${'{range}'} (forced buys if price reaches here)
Long liquidation cluster: ${'{range}'} (forced sells if price reaches here)
Open Interest trend: {increasing/decreasing}
Funding rate: {positive/negative/neutral}

--- FUNDAMENTAL CATALYSTS ---
Recent news (last 72h): {summary}
Upcoming catalyst: {event or none}
Institutional signal: {ETF filing / whale accumulation / none}

--- SOCIAL SENTIMENT ---
Overall: {Bullish/Bearish/Neutral} ({score}/10)
X/Twitter: {1 line}
Community signal: {1 line}

--- 6–12 HOUR BIAS ---
Direction: LONG / SHORT / WAIT
Confidence: High / Medium / Low
Reason: {3–4 sentences — must reference both technical AND fundamental signals}
Best timeframe to trade: {6H / 8H / 12H}

--- TRADE SETUP ---
[LONG SETUP]
Entry zone: ${'{from}'} – ${'{to}'}
Entry condition: {specific candle + volume confirmation on 1H chart}
Target 1 (6H): ${'{price}'} — {reason}
Target 2 (12H): ${'{price}'} — {reason}
Stop loss: ${'{price}'}
R:R ratio: {ratio}
Position size suggestion: {conservative / normal / aggressive}
Invalidation: {exact condition that cancels this setup}

[SHORT SETUP]
Entry zone: ${'{from}'} – ${'{to}'}
Entry condition: {specific candle + volume confirmation on 1H chart}
Target 1 (6H): ${'{price}'} — {reason}
Target 2 (12H): ${'{price}'} — {reason}
Stop loss: ${'{price}'}
R:R ratio: {ratio}
Position size suggestion: {conservative / normal / aggressive}
Invalidation: {exact condition that cancels this setup}

--- MACRO CONTEXT ---
BTC dominance impact: {how BTC trend affects this coin}
Correlation risk: {any correlated coins that could drag price}
Market sentiment: {Fear & Greed index reading and impact}

--- RISKS ---
- {risk 1 — technical}
- {risk 2 — fundamental}
- {risk 3 — macro}

--- NEXT CHECK ---
Re-analyze in: 4–6 hours
Key price to watch: ${'{level}'}
Trigger event: {what news or price action would change the bias}

⚠️ Not financial advice. Always use proper risk management.

IMPORTANT RULES YOU MUST FOLLOW:
1. If the key level range is tighter than 1% of current price, flag as "Range too compressed — WAIT"
2. Both 4H and Daily MA must align for High confidence — if they conflict, cap at Medium
3. RSI overbought (>70) alone is NOT enough to short — require MA confirmation too
4. If volume is below 7-day average (decreasing), downgrade confidence by one level
5. Always reference the news and sentiment data before finalizing bias

Always use the real-time data provided. If re-analyzing, compare with previous setup and note what changed.`;

export async function generateTradeSetup(
  tech: TechnicalData,
  sentiment: string,
  xSentiment: string,
  news: string,
  previousAnalysis?: string
): Promise<string> {
  const now = new Date().toUTCString();

  const previousSection = previousAnalysis
    ? `PREVIOUS ANALYSIS (compare and note what changed):\n${previousAnalysis}\n\n`
    : "";

  const fundingStr = tech.fundingRate !== null
    ? `${tech.fundingRate.toFixed(4)}% (${tech.fundingLabel})`
    : `unknown`;

  const userPrompt = `${previousSection}Generate a 6–12 hour swing trade setup for ${tech.coin} using this real-time data:

COIN: ${tech.coin}
TIME: ${now}
PRICE: $${fmtPrice(tech.price)}

TECHNICAL DATA:
- RSI (14): ${tech.rsi} (${tech.rsiLabel})
- 24h Volume: ${fmtVol(tech.volumeUSD)} (${tech.volumeTrend})
- 24h Range: Low $${fmtPrice(tech.low24h)} / High $${fmtPrice(tech.high24h)}
- 24h Change: ${tech.change24h.toFixed(2)}%
- 7d Change: ${tech.change7d.toFixed(2)}%
- MA Trend (1H): ${tech.maTrend1H}
- MA Trend (4H): ${tech.maTrend4H}
- MA Trend (Daily): ${tech.maTrendDaily}
- EMA20: $${fmtPrice(tech.ema20)} | EMA50: $${fmtPrice(tech.ema50)} | EMA200: $${fmtPrice(tech.ema200)}
- Distance from 52W High (ATH proxy): ${tech.distanceFromATH.toFixed(2)}%

KEY LEVELS (from last 48 candles):
- Strong Resistance 2: $${fmtPrice(tech.strongResistance)}
- Strong Resistance 1: $${fmtPrice(tech.resistance)}
- Current Price: $${fmtPrice(tech.price)}
- Strong Support 1: $${fmtPrice(tech.support)}
- Strong Support 2: $${fmtPrice(tech.strongSupport)}

FUTURES / DERIVATIVES:
- Funding Rate: ${fundingStr}
- OI Trend: ${tech.oiTrend}

SOCIAL SENTIMENT (LunarCrush):
${sentiment}

X/TWITTER SENTIMENT (Apify):
${xSentiment}

RECENT NEWS (last 72h):
${news}

Output the full 6–12 hour swing trade setup in the exact format specified. Use the real numbers above.${previousAnalysis ? " Note what has changed since the previous analysis." : ""}`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");
  return block.text;
}
