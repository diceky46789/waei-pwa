// js/explain.js
export async function getExplanation({ jp, en, level = 'intermediate', style = 'concise', model = 'gpt-4o-mini' }) {
  const key = (localStorage.getItem('openai_api_key') || '').trim();
  if (!key) throw new Error('OpenAI APIキーが未設定です。設定画面で保存してください。');
  if (!en || !en.trim()) throw new Error('英文が空です。');

  const system = `You are an expert ESL instructor for Japanese learners.
Explain the given English sentence in Japanese:
1) 要旨  2) 文の構造  3) 重要語句  4) 文法ポイント  5) 医療英語の言い換え(任意)
Keep it compact and faithful to the sentence.`;

  const user = `[日本文(任意)]: ${jp || '（なし）'}
[英文]: ${en}
レベル: ${level} / スタイル: ${style}`;

  async function fetchJSON(url, init, timeoutMs = 20000) {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      const text = await res.text();
      let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      return { ok: res.ok, status: res.status, json, raw: text };
    } finally { clearTimeout(id); }
  }

  const comp = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.2, max_tokens: 512,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!comp.ok && (comp.status === 401 || comp.status === 404 || comp.status === 429)) {
    throw new Error(`OpenAIエラー ${comp.status}: ${comp.raw || JSON.stringify(comp.json)}`);
  }
  let text = comp?.json?.choices?.[0]?.message?.content?.trim?.() || '';

  if (!text) {
    const resp = await fetchJSON('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0.2, max_output_tokens: 512,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!resp.ok && (resp.status === 401 || resp.status === 404 || resp.status === 429)) {
      throw new Error(`OpenAIエラー ${resp.status}: ${resp.raw || JSON.stringify(resp.json)}`);
    }
    if (typeof resp.json?.output_text === 'string' && resp.json.output_text.trim()) {
      text = resp.json.output_text.trim();
    } else if (typeof resp.json?.choices?.[0]?.message?.content === 'string') {
      text = resp.json.choices[0].message.content.trim();
    } else {
      const arr = resp.json?.output?.[0]?.content || resp.json?.content || [];
      const first = Array.isArray(arr) ? (arr.find(p => p?.text)?.text || arr.find(p => typeof p === 'string')) : '';
      text = (first || '').toString().trim();
    }
    if (!text) {
      throw new Error(`解説テキストが取得できませんでした。\ncompletions: ${comp.status} / ${comp.raw}\nresponses: ${resp.status} / ${resp.raw}`);
    }
  }
  return text;
}
if (typeof window !== 'undefined') { window.getExplanation = async (args) => getExplanation(args); }
