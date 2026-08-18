import { TELEGRAM_TOKEN } from "./config.js";

const API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Calls one Telegram Bot API method.
 *
 * Reads the body as text before parsing: a proxy, captive portal or school
 * firewall answers with HTML or a plain-text refusal, and letting res.json()
 * throw would surface that as an unrelated JSON syntax error.
 */
export async function call(method, body = {}) {
  let res;
  try {
    res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`cannot reach api.telegram.org (${err.message})`);
  }

  const raw = await res.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const snippet = raw.trim().replace(/\s+/g, " ").slice(0, 120);
    throw new Error(
      `api.telegram.org returned a non-JSON reply (HTTP ${res.status}): ${snippet}\n` +
        `Something between you and Telegram is intercepting the request — ` +
        `check your network, proxy or firewall.`,
    );
  }

  if (!data.ok) throw new Error(data.description || `${method} failed (HTTP ${res.status})`);
  return data.result;
}
