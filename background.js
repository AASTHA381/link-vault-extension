/* background.js — LinkVault Service Worker */

/* ─── MESSAGE ROUTER ───────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fetchURL') {
    fetchURLContent(msg.url)
      .then(d  => sendResponse({ success: true,  ...d }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true; // keep channel open for async
  }

  if (msg.action === 'generateSummary') {
    const overrideKey      = msg.testApiKey  || null;
    const overrideProvider = msg.testProvider || null;
    generateSummary(msg.content, msg.title, msg.type, overrideKey, overrideProvider)
      .then(summary => sendResponse({ success: true,  summary }))
      .catch(e      => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

/* ─── FETCH URL CONTENT ────────────────────────────────────────── */
async function fetchURLContent(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*' },
  });

  const contentType = res.headers.get('content-type') || '';
  const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const buffer = await res.arrayBuffer();
    const text = basicPdfExtractBg(buffer);
    const fallbackTitle = decodeURIComponent(
      (url.split('/').pop() || 'document').replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ')
    ).trim();
    return { title: fallbackTitle, content: text || `PDF document at ${url}` };
  }

  const html = await res.text();

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Plain text (strip tags, scripts, styles)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 20_000);

  return { title, content: text };
}

/** Minimal PDF text extraction for direct-linked PDFs (text-based PDFs only) */
function basicPdfExtractBg(buffer) {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  let out = '';
  const btEt = /BT\s([\s\S]*?)\sET/g;
  let m;
  while ((m = btEt.exec(raw)) !== null) {
    const block = m[1];
    const tjRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|')/g;
    let tj;
    while ((tj = tjRe.exec(block)) !== null) out += tj[1].replace(/\\(.)/g, '$1') + ' ';
    const tjArr = /\[([^\]]*)\]\s*TJ/g;
    let ta;
    while ((ta = tjArr.exec(block)) !== null) {
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let s;
      while ((s = strRe.exec(ta[1])) !== null) out += s[1].replace(/\\(.)/g, '$1') + ' ';
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim().slice(0, 20_000);
}
}

/* ─── AI SUMMARY ───────────────────────────────────────────────── */
async function generateSummary(content, title, type, overrideKey, overrideProvider) {
  const stored = await chrome.storage.local.get(['apiKey', 'aiProvider', 'aiModel', 'geminiModel', 'groqModel']);
  const apiKey      = overrideKey      || stored.apiKey;
  const provider    = overrideProvider || stored.aiProvider || 'groq';
  const openaiModel = stored.aiModel      || 'gpt-3.5-turbo';
  const geminiModel = stored.geminiModel  || 'gemini-1.5-flash';
  const groqModel   = stored.groqModel    || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new Error('No API key configured. Open ⚙️ Settings to add one.');
  }

  const prompt = buildPrompt(content, title, type);

  if (provider === 'gemini') return callGemini(apiKey, prompt, geminiModel);
  if (provider === 'groq')   return callGroq(apiKey, prompt, groqModel);
  return callOpenAI(apiKey, openaiModel, prompt);
}

/* ─── PROMPT BUILDER ───────────────────────────────────────────── */
function buildPrompt(content, title, type) {
  const srcLabel = type === 'link' ? 'web page' : 'document';
  const body = (content || title || '').slice(0, 14_000);

  return `You are an expert summariser. Your job is to produce a clear, complete summary that covers every key point without changing any meaning. Write in simple language that anyone can understand.

Resource type : ${srcLabel}
Title         : ${title}

--- CONTENT START ---
${body}
--- CONTENT END ---

Produce your summary in this exact format:

## Overview
[2–3 sentences giving the big picture]

## Key Points
• [Point 1]
• [Point 2]
• [Point 3 …add as many as needed]

## Important Details
[Any important numbers, dates, names, steps, or facts that should not be missed]

Write naturally and simply. Do NOT omit any significant information.`;
}

/* ─── OPENAI ───────────────────────────────────────────────────── */
async function callOpenAI(apiKey, model, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens:  1800,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/* ─── GOOGLE GEMINI ────────────────────────────────────────────── */
async function callGemini(apiKey, prompt, model = 'gemini-1.5-flash') {
  // Both AIza... and AQ... keys are API keys — use x-goog-api-key header on v1
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1800 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
