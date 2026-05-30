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

const SYSTEM_PROMPT = `You are an expert cryptocurrency futures trader and technical analyst.
You will be given real-time market data for a coin. Using this data, produce a precise 3-hour trade setup.

CRITICAL: Output ONLY the trade setup in the EXACT plain-text format below — no extra commentary, no markdown headers, no backticks.
Use the exact field names and dashes shown. All prices must use real numbers from the data provided.

COIN: {symbol}
TIME: {current time UTC}
PRICE: ${'{price}'}

--- MARKET DATA ---
RSI: {value} ({overbought/oversold/neutral})
Volume 24h: {value} ({increasing/decreasing})
24h Range: Low ${'{low}'} / High ${'{high}'}
24h Change: {%}
MA Trend: {Bullish/Bearish/Neutral}

--- KEY LEVELS ---
Strong Resistance: ${'{level}'}
Resistance: ${'{level}'}
Current Price: ${'{price}'}
Support: ${'{level}'}
Strong Support: ${'{level}'}

--- SENTIMENT ---
Overall: {Bullish/Bearish/Neutral} ({score}/10)
News: {1 line}
Social: {1 line}
Whale activity: {1 line}

--- 3-HOUR BIAS ---
Direction: LONG / SHORT / WAIT
Confidence: High / Medium / Low
Reason: {2-3 sentences}

--- TRADE SETUP ---
[LONG]
Entry: ${'{from}'} - ${'{to}'}
Target 1: ${'{price}'}
Target 2: ${'{price}'}
Stop loss: ${'{price}'}
R:R: {ratio}
Valid when: {condition}

[SHORT]
Entry: ${'{from}'} - ${'{to}'}
Target 1: ${'{price}'}
Target 2: ${'{price}'}
Stop loss: ${'{price}'}
R:R: {ratio}
Valid when: {condition}

--- RISKS ---
- {risk 1}
- {risk 2}

--- NEXT CHECK ---
Re-analyze in: 1-2 hours
Watch for: {key level or event}

⚠️ Not financial advice. Always manage your risk.

Always use the real-time data provided before producing the setup. If the user says "update" or "re-analyze", treat it as a fresh request and repeat the full format with the latest data.`;

export async function generateTradeSetup(
  tech: TechnicalData,
  sentiment: string,
  news: string,
  previousAnalysis?: string
): Promise<string> {
  const now = new Date().toUTCString();

  const previousSection = previousAnalysis
    ? `\nPREVIOUS ANALYSIS (for context — compare what has changed):
${previousAnalysis}

`
    : "";

  const userPrompt = `${previousSection}Generate a 3-hour trade setup for ${tech.coin} using this real-time data:

COIN: ${tech.coin}
TIME: ${now}
PRICE: $${fmtPrice(tech.price)}

TECHNICAL DATA:
- RSI (14): ${tech.rsi} (${tech.rsiLabel})
- 24h Volume: ${fmtVol(tech.volumeUSD)} (${tech.volumeTrend})
- 24h Range: Low $${fmtPrice(tech.low24h)} / High $${fmtPrice(tech.high24h)}
- 24h Change: ${tech.change24h.toFixed(2)}%
- EMA20: $${fmtPrice(tech.ema20)} | EMA50: $${fmtPrice(tech.ema50)}
- MA Trend: ${tech.maTrend}

KEY LEVELS (from last 48 candles):
- Strong Resistance: $${fmtPrice(tech.strongResistance)}
- Resistance: $${fmtPrice(tech.resistance)}
- Current Price: $${fmtPrice(tech.price)}
- Support: $${fmtPrice(tech.support)}
- Strong Support: $${fmtPrice(tech.strongSupport)}

SOCIAL SENTIMENT (LunarCrush):
${sentiment}

RECENT NEWS:
${news}

Output the full trade setup in the exact format specified. Use the real numbers above.${previousAnalysis ? " Where relevant, note what has changed since the previous analysis (price movement, level breaks, bias shift)." : ""}`;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");
  return block.text;
}
