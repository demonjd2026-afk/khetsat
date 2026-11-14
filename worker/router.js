// KhetSat question router (Cloudflare Worker).
//
// The voice guide sends the farmer's question here. A Claude model decides which of the
// guide's eight fixed questions it matches, or "none". The model never writes the answer:
// the app builds every answer from its own computed figures.
//
// Secrets and variables (set in the Cloudflare dashboard or with wrangler, never in the repo):
//   KHETSAT_API_KEY   Anthropic API key (secret)
//   KHETSAT_MODEL     optional, model name; defaults to the value below
const DEFAULT_MODEL = "claude-haiku-5-5";
const TOPICS = ["best", "poor", "water", "rain", "chart", "map", "trust", "check"];
const ALLOWED_ORIGINS = [
  "https://demonjd2026-afk.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
];
const SYSTEM = `You route a farmer's question to one topic of a crop-rotation tool for India.
The question may be in English, Telugu, Hindi, Tamil, Kannada, Marathi or Odia, may mix languages,
and may contain speech-recognition errors.

Topics:
best  - which crop or rotation to grow, what is recommended, which option is better for them
poor  - what happens in a drought, a dry or poor-rain year, crop failure when rain is short
water - how much water or irrigation the crops or rotations need, which uses less water
rain  - how much rain falls here, when the monsoon or rains start, rainfall trend, when to sow
chart - how to read the chart or graph on the page: bars, lines, coloured bands
map   - how to read or use the satellite map: colours, dots, layers, months
trust - how accurate or reliable the data is, where it comes from, whether to believe it
check - what to verify locally or be careful about before deciding, risks, limits, what is not included
none  - anything else (prices, pests, loans, weather forecasts, greetings, unrelated requests)

Reply with exactly one word from: best, poor, water, rain, chart, map, trust, check, none.`;

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin))
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply({ error: "POST only" }, 405, origin);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return reply({ error: "origin not allowed" }, 403, origin);
    if (!env.KHETSAT_API_KEY) return reply({ error: "KHETSAT_API_KEY is not set" }, 500, origin);

    let text = "";
    try {
      const body = await request.json();
      text = String(body.text || "").trim().slice(0, 300);
    } catch (error) {
      return reply({ error: "bad request" }, 400, origin);
    }
    if (!text) return reply({ error: "empty question" }, 400, origin);

    const answer = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.KHETSAT_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: env.KHETSAT_MODEL || DEFAULT_MODEL,
        max_tokens: 10,
        system: SYSTEM,
        messages: [{ role: "user", content: text }]
      })
    });
    if (!answer.ok) return reply({ error: "model request failed", status: answer.status }, 502, origin);
    const data = await answer.json();
    const word = String(((data.content || [])[0] || {}).text || "").toLowerCase().replace(/[^a-z]/g, "");
    const intent = TOPICS.includes(word) ? word : "none";
    return reply({ intent: intent }, 200, origin);
  }
};
