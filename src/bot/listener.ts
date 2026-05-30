import TelegramBot from "node-telegram-bot-api";
import { fetchTechnicalData } from "../fetchers/binance";
import { fetchSocialSentiment } from "../fetchers/lunarcrush";
import { fetchXSentiment } from "../fetchers/apify";
import { fetchCryptoNews } from "../fetchers/cryptopanic";
import { generateTradeSetup } from "../ai/tradeAnalyzer";

const DIGEST_COOLDOWN_MS    = 5 * 60 * 1000;  // 5 min between /news calls
const ANALYZE_COOLDOWN_MS   = 2 * 60 * 1000;  // 2 min between /analyze calls
const REANALYZE_COOLDOWN_MS = 30 * 1000;       // 30s between /reanalyze calls

let lastDigestAt  = 0;
const lastAnalyzeAt: Record<string, number> = {};
// Stores the last trade setup per coin symbol for re-analysis context
const lastSetup: Record<string, string> = {};

const WELCOME = `👋 Welcome to *Crypto Daily Digest Bot!*

Commands:
/news — Get the latest crypto digest
/analyze BTC — 3-hour trade setup for any coin
/trade ETH — Same as /analyze
/update BTC — Re-fetch fresh data and re-analyze
/reanalyze BTC — Same as /update
/help — Show this menu`;

const HELP = `📖 *Available Commands:*

/news — Generate a fresh daily crypto digest
/analyze BTC — 3-hour futures trade setup for BTC
/trade SOL — Same as /analyze
/update BTC — Re-fetch fresh data and re-analyze
/reanalyze ETH — Same as /update
/help — Show this menu

_Example: /analyze BTC or /update ETH_`;

export function startCommandListener(
  token: string,
  onNewsCommand: (chatId: number) => Promise<void>
): void {
  const bot = new TelegramBot(token, { polling: true });
  console.log("🎧 Bot is listening for commands (/news, /analyze, /help)...");

  // /start
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, WELCOME, { parse_mode: "Markdown" });
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, HELP, { parse_mode: "Markdown" });
  });

  // /news
  bot.onText(/\/news/, async (msg) => {
    const chatId = msg.chat.id;
    const now = Date.now();

    if (now - lastDigestAt < DIGEST_COOLDOWN_MS) {
      const remaining = Math.ceil((DIGEST_COOLDOWN_MS - (now - lastDigestAt)) / 60000);
      bot.sendMessage(chatId, `⏳ Please wait ${remaining} minute(s) before requesting again.`);
      return;
    }

    lastDigestAt = now;
    bot.sendMessage(chatId, "⏳ Fetching latest crypto digest... (~30 seconds)");

    try {
      await onNewsCommand(chatId);
    } catch (err) {
      console.error("❌ /news error:", err);
      bot.sendMessage(chatId, "❌ Failed to generate digest. Please try again later.");
    }
  });

  // /analyze {COIN} or /trade {COIN} or /update {COIN} or /reanalyze {COIN}
  bot.onText(/\/(analyze|trade|update|reanalyze)\s+([A-Za-z]{2,10})/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const coin   = (match?.[2] ?? "BTC").toUpperCase();
    const now    = Date.now();

    const commandName   = (match?.[1] ?? "").toLowerCase();
    const isReAnalyze   = ["update", "reanalyze"].includes(commandName);
    const cooldownMs    = isReAnalyze ? REANALYZE_COOLDOWN_MS : ANALYZE_COOLDOWN_MS;
    const cooldownKey   = `${chatId}:${coin}`;

    if (now - (lastAnalyzeAt[cooldownKey] ?? 0) < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - (lastAnalyzeAt[cooldownKey] ?? 0))) / 1000);
      bot.sendMessage(chatId, `⏳ Wait ${remaining}s before re-analyzing ${coin}.`);
      return;
    }
    lastAnalyzeAt[cooldownKey] = now;
    const fetchMsg = isReAnalyze
      ? `🔄 Re-fetching fresh data for *${coin}*... (~20 seconds)`
      : `📡 Fetching real-time data for *${coin}*... (~20 seconds)`;
    bot.sendMessage(chatId, fetchMsg, { parse_mode: "Markdown" });

    try {
      // Fetch all data in parallel
      const [tech, sentiment, xSentiment, news] = await Promise.all([
        fetchTechnicalData(coin),
        fetchSocialSentiment([coin]),
        fetchXSentiment([coin]),
        fetchCryptoNews(),
      ]);

      // Filter news to only coin-relevant headlines
      const coinNews = news
        .split("\n")
        .filter((line) => line.toLowerCase().includes(coin.toLowerCase()))
        .slice(0, 5)
        .join("\n") || "No specific news found for this coin in the last 24h.";

      const previous = isReAnalyze ? lastSetup[coin] : undefined;

      console.log(`📊 Generating trade setup for ${coin}${previous ? " (with previous context)" : ""}...`);
      const setup = await generateTradeSetup(tech, sentiment, xSentiment, coinNews, previous);

      // Store as latest setup for this coin
      lastSetup[coin] = setup;

      // Send as plain text (no parse_mode) to preserve the exact format
      await bot.sendMessage(chatId, setup);
    } catch (err) {
      const msg403 = (err as Error).message?.includes("400")
        ? `❌ *${coin}* USDT pair not found on Gate.io. Try BTC, ETH, SOL, BNB, XRP, TRX, ADA, DOGE, etc.`
        : `❌ Failed to analyze *${coin}*. Please try again.`;
      console.error(`❌ /analyze ${coin} error:`, err);
      bot.sendMessage(chatId, msg403, { parse_mode: "Markdown" });
    }
  });

  // /analyze or /update with no coin
  bot.onText(/^\/(analyze|trade|update|reanalyze)$/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Please specify a coin. Example: `/analyze BTC` or `/update ETH`",
      { parse_mode: "Markdown" }
    );
  });

  bot.on("polling_error", (err) => {
    console.error("Telegram polling error:", err.message);
  });
}
