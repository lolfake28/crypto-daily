import cron from "node-cron";
import dotenv from "dotenv";
import { fetchCryptoNews } from "./fetchers/cryptopanic";
import { fetchSocialSentiment } from "./fetchers/lunarcrush";
import { fetchXSentiment } from "./fetchers/apify";
import { fetchMarketData, fetchMidCapData } from "./fetchers/coingecko";
import { generateDailySummary } from "./ai/summarizer";
import { sendToTelegram } from "./bot/telegram";
import { startCommandListener } from "./bot/listener";

dotenv.config();

const TRACKED_COINS = (process.env.TRACKED_COINS || "BTC,ETH,SOL")
  .split(",")
  .map((c) => c.trim().toUpperCase());

// chatId is optional — when called from /news command it sends back to that chat
// when called from scheduler it sends to TELEGRAM_CHAT_ID in .env
async function runDailyDigest(chatId?: number): Promise<void> {
  console.log(`🚀 Running daily crypto digest${chatId ? ` (requested by chat ${chatId})` : ""}...`);
  const startTime = Date.now();

  try {
    console.log("📡 Fetching news, sentiment, X trends, and market data...");
    const [news, sentiment, xTrends, marketData, midCapData] = await Promise.all([
      fetchCryptoNews(),
      fetchSocialSentiment(TRACKED_COINS),
      fetchXSentiment(TRACKED_COINS),
      fetchMarketData(TRACKED_COINS),
      fetchMidCapData(),
    ]);

    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    console.log("🤖 Generating summary with Claude...");
    const summary = await generateDailySummary(news, sentiment, date, xTrends, marketData, midCapData);

    console.log("📨 Sending to Telegram...");
    await sendToTelegram(summary, chatId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Done in ${elapsed}s`);
  } catch (err) {
    console.error("❌ Error running digest:", err);
    throw err; // re-throw so command listener can catch it
  }
}

const runNow = process.argv.includes("--run-now") || process.argv.includes("--test");

if (runNow) {
  // One-shot test run
  console.log("🔧 Running immediately (test mode)...");
  runDailyDigest().catch(() => process.exit(1));
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set");
    process.exit(1);
  }

  // Daily scheduled run at 8:00 AM
  cron.schedule("0 8 * * *", () => runDailyDigest());

  // Listen for /news command from Telegram
  startCommandListener(token, (chatId) => runDailyDigest(chatId));

  console.log(`🤖 Crypto News Bot is running!`);
  console.log(`   Tracking: ${TRACKED_COINS.join(", ")}`);
  console.log(`   Scheduled: 8:00 AM daily`);
  console.log(`   Commands: Send /news to @CoinTrade28_bot anytime`);
}
