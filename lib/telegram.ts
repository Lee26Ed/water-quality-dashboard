const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "8221465217";

export async function sendTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("Telegram: TELEGRAM_BOT_TOKEN is not set, skipping alert");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ chat_id: TELEGRAM_CHAT_ID, text: message }),
      signal: AbortSignal.timeout(10_000),
    });

    console.log("Telegram:", await response.json());
  } catch (e) {
    console.error("Telegram error:", e);
  }
}
