# 🤖 Crypto News Daily Summarizer Bot
### Powered by Claude AI + Telegram

---

## 📋 Project Overview

A daily automated bot that:
1. Fetches the latest crypto news from free APIs
2. Fetches social sentiment data (X/Twitter mentions, Reddit, etc.)
3. Sends everything to **Claude AI** to summarize and analyze
4. Delivers a clean daily digest to your **Telegram** — for free

---

## 🗂️ Project Structure

```
crypto-news-bot/
├── src/
│   ├── index.ts              # Entry point + scheduler
│   ├── fetchers/
│   │   ├── cryptopanic.ts    # Fetch news headlines
│   │   └── lunarcrush.ts     # Fetch social sentiment
│   ├── ai/
│   │   └── summarizer.ts     # Claude API integration
│   ├── bot/
│   │   └── telegram.ts       # Telegram bot sender
│   └── types.ts              # TypeScript interfaces
├── .env                      # API keys (never commit this!)
├── .env.example              # Template (safe to commit)
├── .gitignore
├── Dockerfile                # For Docker / Railway / VPS deploy
├── railway.toml              # Railway.app config
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔑 Required API Keys

| Service | Purpose | Cost | Where to Get |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude AI summarizer | Pay per use (~cents/day) | console.anthropic.com |
| `TELEGRAM_BOT_TOKEN` | Send messages to Telegram | **Free** | @BotFather on Telegram |
| `TELEGRAM_CHAT_ID` | Your Telegram channel/group ID | **Free** | @userinfobot on Telegram |
| `CRYPTOPANIC_API_KEY` | Crypto news headlines | **Free tier** | cryptopanic.com/developers/api |
| `LUNARCRUSH_API_KEY` | Social sentiment from X/Reddit | **Free tier** | lunarcrush.com/developers |

### `.env` file template
```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIjKlMnOpQrStUvWxYz
TELEGRAM_CHAT_ID=-1001234567890
CRYPTOPANIC_API_KEY=your_cryptopanic_key
LUNARCRUSH_API_KEY=your_lunarcrush_key

# Optional: comma-separated coins to track
TRACKED_COINS=BTC,ETH,SOL,BNB
```

---

## ⚙️ Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Scheduler**: `node-cron` (runs daily at 8:00 AM)
- **News Source**: CryptoPanic API (free)
- **Sentiment Source**: LunarCrush API (free tier)
- **Delivery**: Telegram Bot API (free)

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "axios": "^1.6.0",
    "node-cron": "^3.0.3",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.0",
    "ts-node": "^10.9.0"
  }
}
```

Install:
```bash
npm install
```

---

## 🧠 Claude AI Prompt Design

This is the core prompt sent to Claude for daily summarization.

### System Prompt
```
You are a professional cryptocurrency market analyst and news curator.
Your job is to analyze daily crypto news and social sentiment data,
then produce a concise, clear, and insightful daily digest for a retail crypto investor.

Always respond in this exact structure:
1. 📊 Market Mood (1 sentence overall sentiment: Bullish / Bearish / Neutral)
2. 🔥 Top Stories (max 5 bullet points, each max 2 sentences)
3. 📣 Social Buzz (what people on X/Twitter and Reddit are talking about most)
4. ⚠️ Risks to Watch (max 3 bullet points)
5. 💡 Coins to Watch Today (max 3 coins with 1-line reason each)

Keep the tone professional but easy to understand.
Do not use excessive jargon.
Total response must be under 600 words.
```

### User Prompt Template
```
Here is today's crypto data. Date: {{DATE}}

--- NEWS HEADLINES ---
{{NEWS_LIST}}

--- SOCIAL SENTIMENT DATA ---
{{SENTIMENT_DATA}}

--- TRACKED COINS PRICES ---
{{PRICE_DATA}}

Please generate today's daily crypto digest based on this data.
```

---

## 💻 Core Code Snippets

### 1. Fetch News from CryptoPanic (`src/fetchers/cryptopanic.ts`)
```typescript
import axios from "axios";

export async function fetchCryptoNews(): Promise<string> {
  const res = await axios.get("https://cryptopanic.com/api/free/v1/posts/", {
    params: {
      auth_token: process.env.CRYPTOPANIC_API_KEY,
      filter: "hot",
      kind: "news",
      public: true,
    },
  });

  const articles = res.data.results.slice(0, 20);
  return articles
    .map((a: any, i: number) => `${i + 1}. [${a.votes?.positive || 0}👍] ${a.title}`)
    .join("\n");
}
```

### 2. Fetch Social Sentiment from LunarCrush (`src/fetchers/lunarcrush.ts`)
```typescript
import axios from "axios";

export async function fetchSocialSentiment(coins: string[]): Promise<string> {
  const results: string[] = [];

  for (const coin of coins) {
    try {
      const res = await axios.get(`https://lunarcrush.com/api4/public/coins/${coin.toLowerCase()}/v1`, {
        headers: { Authorization: `Bearer ${process.env.LUNARCRUSH_API_KEY}` },
      });

      const d = res.data.data;
      results.push(
        `${coin}: Social Volume=${d.social_volume_24h}, Sentiment=${d.sentiment}, Galaxy Score=${d.galaxy_score}`
      );
    } catch {
      results.push(`${coin}: sentiment data unavailable`);
    }
  }

  return results.join("\n");
}
```

### 3. Claude Summarizer (`src/ai/summarizer.ts`)
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a professional cryptocurrency market analyst and news curator.
Your job is to analyze daily crypto news and social sentiment data,
then produce a concise, clear, and insightful daily digest for a retail crypto investor.

Always respond in this exact structure:
1. 📊 Market Mood (1 sentence overall sentiment: Bullish / Bearish / Neutral)
2. 🔥 Top Stories (max 5 bullet points, each max 2 sentences)
3. 📣 Social Buzz (what people on X/Twitter and Reddit are talking about most)
4. ⚠️ Risks to Watch (max 3 bullet points)
5. 💡 Coins to Watch Today (max 3 coins with 1-line reason each)

Keep the tone professional but easy to understand. Total response under 600 words.`;

export async function generateDailySummary(
  news: string,
  sentiment: string,
  date: string
): Promise<string> {
  const userPrompt = `Here is today's crypto data. Date: ${date}

--- NEWS HEADLINES ---
${news}

--- SOCIAL SENTIMENT DATA ---
${sentiment}

Please generate today's daily crypto digest based on this data.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return (response.content[0] as { text: string }).text;
}
```

### 4. Send to Telegram (`src/bot/telegram.ts`)
```typescript
import axios from "axios";

export async function sendToTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const header = `📰 *Crypto Daily Digest*\n_${new Date().toDateString()}_\n\n`;
  const fullMessage = header + message;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: fullMessage,
    parse_mode: "Markdown",
  });

  console.log("✅ Digest sent to Telegram!");
}
```

### 5. Main Entry + Scheduler (`src/index.ts`)
```typescript
import cron from "node-cron";
import dotenv from "dotenv";
import { fetchCryptoNews } from "./fetchers/cryptopanic";
import { fetchSocialSentiment } from "./fetchers/lunarcrush";
import { generateDailySummary } from "./ai/summarizer";
import { sendToTelegram } from "./bot/telegram";

dotenv.config();

const TRACKED_COINS = (process.env.TRACKED_COINS || "BTC,ETH,SOL").split(",");

async function runDailyDigest() {
  console.log("🚀 Running daily crypto digest...");
  try {
    const [news, sentiment] = await Promise.all([
      fetchCryptoNews(),
      fetchSocialSentiment(TRACKED_COINS),
    ]);

    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const summary = await generateDailySummary(news, sentiment, date);
    await sendToTelegram(summary);
  } catch (err) {
    console.error("❌ Error running digest:", err);
  }
}

// Run every day at 8:00 AM
cron.schedule("0 8 * * *", runDailyDigest);

// Uncomment to test immediately on startup:
// runDailyDigest();

console.log("🤖 Crypto News Bot is running...");
```

---

## 🚀 Setup Guide (Step by Step)

### Step 1: Create Telegram Bot
1. Open Telegram → search **@BotFather**
2. Send `/newbot` → follow instructions → copy the **Bot Token**
3. Create a Telegram group/channel → add your bot as admin
4. Get Chat ID via **@userinfobot** or check the API

### Step 2: Get API Keys
1. **CryptoPanic**: Register at [cryptopanic.com](https://cryptopanic.com) → Developer → Get free API key
2. **LunarCrush**: Register at [lunarcrush.com](https://lunarcrush.com) → API section → free tier
3. **Anthropic**: Register at [console.anthropic.com](https://console.anthropic.com) → top up credits → create API key

### Step 3: Clone & Configure
```bash
git clone https://github.com/YOUR_USERNAME/crypto-news-bot
cd crypto-news-bot
npm install
cp .env.example .env
# Fill in your API keys in .env
```

### Step 4: Run
```bash
# Test run immediately
npx ts-node src/index.ts

# Production (runs on schedule)
npm start
```

### Step 5: Deploy (Optional — keep it always running)
- **Railway.app** — free tier, easy deploy from GitHub
- **Render.com** — free background worker
- **VPS (Contabo/DigitalOcean)** — use `pm2` to keep it alive

```bash
# With PM2
npm install -g pm2
pm2 start "npx ts-node src/index.ts" --name crypto-bot
pm2 save
```

---

## 💰 Estimated Monthly Cost

| Service | Cost |
|---|---|
| Claude API (Sonnet) | ~$0.50 – $2/month (30 daily runs) |
| Telegram Bot | **Free** |
| CryptoPanic API | **Free** |
| LunarCrush API | **Free** (limited) |
| Hosting (Railway/Render) | **Free** (limited) or ~$5/month |
| **Total** | **~$0.50 – $7/month** |

---

## 🔮 Future Improvements

- [ ] Add price data from CoinGecko free API
- [ ] Support multiple Telegram channels (e.g., one for BTC, one for altcoins)
- [ ] Add Indonesian language option in the prompt (`"Respond in Bahasa Indonesia"`)
- [ ] Weekly performance report
- [ ] Alert when sentiment spikes unusually high or low

---

## 📝 Notes

- Telegram is **100% free** for bots — no limits on personal use
- WhatsApp Business API requires Meta approval + costs money — stick with Telegram
- Claude Sonnet is recommended over Haiku for better quality summaries
- X/Twitter sentiment is covered indirectly via LunarCrush which aggregates it for you — no need for expensive X API access

---

*Built with ❤️ using Anthropic Claude + Node.js + Telegram*
