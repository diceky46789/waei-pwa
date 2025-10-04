export async function getExplanation({ jp, en, level='intermediate', style='concise', model='gpt-4o-mini' }){
  const key=(localStorage.getItem('openai_api_key')||'').trim();
  if(!key) throw new Error('OpenAI APIキーが未設定です。設定で保存してください。');
  if(!en||!en.trim()) throw new Error('英文が空です。');
  const system=`You are an expert ESL instructor for Japanese learners.
Explain the given English sentence in Japanese:
1) 要旨  2) 文の構造  3) 重要語句  4) 文法ポイント  5) 医療英語の言い換え(任意)
Keep it compact and faithful to the sentence.`;
  const user=`[日本文(任意)]: ${jp||'（なし）'}
[英文]: ${en}
レベル: ${level} / スタイル: ${style}`;
  async function req(url, body){
    const ac=new AbortController(); const to=setTimeout(()=>ac.abort(),20000);
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify(body),signal:ac.signal});
      const text=await res.text(); let json; try{ json=text?JSON.parse(text):{}; }catch{ json={raw:text}; }
      return {ok:res.ok,status:res.status,json,raw:text};
    } finally{ clearTimeout(to); }
  }
  const c=await req('https://api.openai.com/v1/chat/completions',{model,temperature:0.2,max_tokens:512,messages:[{role:'system',content:system},{role:'user',content:user}]});
  if(c.ok && c.json?.choices?.[0]?.message?.content) return c.json.choices[0].message.content.trim();
  const r=await req('https://api.openai.com/v1/responses',{model,temperature:0.2,max_output_tokens:512,input:[{role:'system',content:system},{role:'user',content:user}]});
  if(r.ok){
    if(typeof r.json?.output_text==='string' && r.json.output_text.trim()) return r.json.output_text.trim();
    if(typeof r.json?.choices?.[0]?.message?.content==='string') return r.json.choices[0].message.content.trim();
    const arr=r.json?.output?.[0]?.content||r.json?.content||[];
    const first=Array.isArray(arr)?(arr.find(p=>p?.text)?.text||arr.find(p=>typeof p==='string')):'';
    if(first) return String(first).trim();
  }
  throw new Error(`解説テキストの取得に失敗しました。status: ${c.status}/${r.status}`);
}
if(typeof window!=='undefined'){ window.getExplanation=(a)=>getExplanation(a); }
