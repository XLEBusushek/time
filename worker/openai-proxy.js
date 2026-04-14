/**
 * Cloudflare Worker: прокси к OpenAI Chat Completions (CORS для GitHub Pages).
 *
 * Секреты в Dashboard → Settings → Variables:
 *   OPENAI_API_KEY  (обязательно)
 *   PROXY_SECRET    (опционально — тот же текст в приложении в поле «Секрет»)
 *   OPENAI_MODEL    (опционально, по умолчанию gpt-4o-mini)
 */

export default {
  async fetch(request, env) {
    const corsBase = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsBase });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsBase);
    }

    const hdrSecret = request.headers.get("X-Proxy-Secret") || "";
    if (env.PROXY_SECRET && hdrSecret !== env.PROXY_SECRET) {
      return json({ error: "Unauthorized" }, 401, corsBase);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, corsBase);
    }

    const prompt = body.prompt;
    const system = typeof body.system === "string" ? body.system : "";
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Missing prompt" }, 400, corsBase);
    }

    const key = env.OPENAI_API_KEY;
    if (!key) {
      return json({ error: "OPENAI_API_KEY not set" }, 500, corsBase);
    }

    const model = body.model || env.OPENAI_MODEL || "gpt-4o-mini";

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system || "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = data.error?.message || upstream.statusText || String(upstream.status);
      return json({ error: msg }, 502, corsBase);
    }

    const text = data.choices?.[0]?.message?.content ?? "";
    return json({ text }, 200, corsBase);
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
