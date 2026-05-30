import axios from "axios";

const TELEGRAM_MAX_LENGTH = 4096;

export async function sendToTelegram(message: string, targetChatId?: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = targetChatId?.toString() ?? process.env.TELEGRAM_CHAT_ID;

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set");

  const header = `📰 *Crypto Daily Digest*\n_${new Date().toDateString()}_\n\n`;
  const fullMessage = header + message;

  // Telegram has a 4096 char limit per message — split if needed
  const chunks = splitMessage(fullMessage, TELEGRAM_MAX_LENGTH);

  for (const chunk of chunks) {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      },
      { timeout: 10000 }
    );
  }

  console.log("✅ Digest sent to Telegram!");
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  return parts;
}
