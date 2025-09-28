// Cloudflare Worker (Wrangler v3+)
// Purpose: Convert text to speech audio and return as MP3 for background playback.
// Uses OpenAI TTS as an example; set OPENAI_API_KEY as a Worker secret.
// Example request:
//   GET https://your-worker.example.com/tts?lang=en-US&text=Hello%20world

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/tts") return new Response("Not found", { status: 404 });

    const text = url.searchParams.get("text") || "";
    const lang = url.searchParams.get("lang") || "en-US";
    if (!text) return new Response("Missing text", { status: 400 });

    // Map language to a TTS voice preset
    const voice = lang.startsWith("ja") ? "alloy" : "alloy"; // choose any supported voice

    const body = {
      model: "tts-1",          // or "gpt-4o-mini-tts" if enabled
      voice,                   // voice preset
      input: text,             // text to speak
      format: "mp3"
    };

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const errTxt = await r.text();
      return new Response("Upstream error: " + errTxt, { status: 500 });
    }

    // Stream audio back to the browser
    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }
};
