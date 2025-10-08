/*
 * explain_support.js — Minimal addon to support jp,en,explanation CSVs
 * Goals:
 *  - Keep existing UI/logic unchanged.
 *  - Add optional "explanation" column handling.
 *  - Show explanation when Check is pressed.
 *
 * How to integrate (see README_patch.txt for full steps):
 *   1) Include this script *after* your existing app script.
 *   2) Call ExplainAddon.install({...}) once during app init,
 *      passing hooks/selectors your app already uses.
 */
(function(global){
  'use strict';

  const ExplainAddon = {
    install(opts){
      const o = Object.assign({
        // Selectors in your existing DOM. Change to match your IDs/classes.
        csvInputSel: '#csvInput',      // <input type="file"> used to load CSV
        checkBtnSel: '#checkBtn',      // "Check" button
        answerContainerSel: '#answerArea', // where user's answer pills/tokens live (not required for addon)
        // Hook functions from your app. Provide these to connect the addon.
        // REQUIRED: a getter that returns the current problem {jp, en, ...}, or at least {en}
        getCurrentProblem: null,
        // Optional: called when CSV is parsed; give you the parsed problems so you can store them
        onCsvParsed: null,  // function(problemsArray)
        // Optional: called when explanation wants to be shown; default is to render a floating card
        onShowExplanation: null, // function(exText)
        // Optional: where to insert the explanation card (if using default renderer)
        explainInsertAfterSel: null // e.g. '#checkBtn' or container near it
      }, opts||{});

      if (!o.getCurrentProblem || typeof o.getCurrentProblem !== 'function'){
        console.warn('[ExplainAddon] getCurrentProblem hook is required.');
      }

      // 1) CSV enhancement — parse jp,en,explanation but stay compatible with jp,en only.
      const csvInput = document.querySelector(o.csvInputSel);
      if (csvInput){
        csvInput.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const text = await file.text();
          try{
            const problems = ingestCSV(text);
            if (o.onCsvParsed) o.onCsvParsed(problems);
            // If your app already handles CSV load, do nothing else.
            // You can choose to ignore this hook and keep your loader.
          }catch(err){
            console.warn('[ExplainAddon] CSV parse skipped:', err);
          }
        }, {capture:true}); // capture to run before bubbled handlers
      }

      // 2) Check button — on click, show explanation for current problem (if exists).
      const checkBtn = document.querySelector(o.checkBtnSel);
      if (checkBtn){
        checkBtn.addEventListener('click', () => {
          try {
            const cur = o.getCurrentProblem ? o.getCurrentProblem() : null;
            if (!cur) return;
            const ex = cur.ex || cur.explanation || cur.Explanation || '';
            if (!ex) return;
            if (o.onShowExplanation && typeof o.onShowExplanation === 'function'){
              o.onShowExplanation(ex);
            }else{
              defaultShowExplanationCard(ex, o.explainInsertAfterSel);
            }
          } catch(e){
            console.warn('[ExplainAddon] show explanation error:', e);
          }
        });
      } else {
        console.warn('[ExplainAddon] checkBtn not found at', o.checkBtnSel);
      }
    }
  };

  // --- Default explanation renderer (non-intrusive DOM) ---
  function defaultShowExplanationCard(text, insertAfterSel){
    let card = document.getElementById('explainCard');
    if (!card){
      card = document.createElement('div');
      card.id = 'explainCard';
      card.style.border = '1px solid #ccc';
      card.style.borderRadius = '12px';
      card.style.padding = '12px';
      card.style.marginTop = '10px';
      card.style.background = 'rgba(255,255,255,0.7)';
      card.style.color = '#111';
      card.style.whiteSpace = 'pre-wrap';

      const title = document.createElement('div');
      title.textContent = '解説';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '6px';
      card.appendChild(title);

      const body = document.createElement('div');
      body.id = 'explainBody';
      card.appendChild(body);

      // Insert near check button or at the end of body
      if (insertAfterSel){
        const anchor = document.querySelector(insertAfterSel);
        if (anchor && anchor.parentElement){
          anchor.parentElement.insertAdjacentElement('afterend', card);
        }else{
          document.body.appendChild(card);
        }
      }else{
        document.body.appendChild(card);
      }
    }
    const body = document.getElementById('explainBody');
    if (body) body.textContent = text;
    card.style.display = 'block';
  }

  // --- CSV ingestion with optional explanation column ---
  function ingestCSV(text){
    const rows = parseCSV(text).filter(r => r.length && r.some(c => (c||'').trim() !== ''));
    if (!rows.length) throw new Error('CSV empty');
    const map = headerIndexMap(rows[0]);
    if (map.jp < 0 || map.en < 0) throw new Error('Missing jp/en headers');
    const out = [];
    for (let i=1; i<rows.length; i++){
      const r = rows[i];
      const item = {
        jp: (r[map.jp]||'').trim(),
        en: (r[map.en]||'').trim()
      };
      if (map.ex >= 0) item.ex = (r[map.ex]||'').trim();
      if (item.jp && item.en) out.push(item);
    }
    return out;
  }

  // --- CSV helpers ---
  function parseCSV(text){
    const rows = [];
    let cur='', row=[], inQ=false;
    for (let i=0;i<text.length;i++){
      const c=text[i], n=text[i+1];
      if (c === '"' && inQ && n === '"'){ cur+='"'; i++; continue; }
      if (c === '"'){ inQ = !inQ; continue; }
      if (c === ',' && !inQ){ row.push(cur); cur=''; continue; }
      if ((c === '\n' || c === '\r') && !inQ){
        if (cur !== '' || row.length){ row.push(cur); rows.push(row); }
        cur=''; row=[];
        if (c === '\r' && n === '\n') i++;
        continue;
      }
      cur += c;
    }
    if (cur !== '' || row.length){ row.push(cur); rows.push(row); }
    return rows;
  }
  function headerIndexMap(headerRow){
    const headers = headerRow.map(h => (h||'').trim().toLowerCase());
    const find = (...keys) => {
      for (const k of keys){
        const i = headers.indexOf(k);
        if (i !== -1) return i;
      }
      return -1;
    };
    return {
      jp: find('jp','japanese','ja','日本語'),
      en: find('en','english','英語'),
      ex: find('explanation','explain','ex','解説')
    };
  }

  // Expose
  global.ExplainAddon = ExplainAddon;

})(window);
