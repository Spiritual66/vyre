const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const auth = require('../middleware/auth');

// AI calls cost real money — throttle per user (20/min, 200/hour).
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous', // route is always authed (auth runs first)
  message: { error: 'Too many AI requests. Please wait a moment and try again.' },
});
const aiHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || 'anonymous', // route is always authed (auth runs first)
  message: { error: 'Hourly AI usage limit reached. Please try again later.' },
});

const SYSTEM_PROMPTS = {
  proofread:    'Fix any spelling, grammar, and punctuation errors in the text. Return ONLY the corrected text, nothing else. If the text already has no errors, return it unchanged.',
  rewrite:      'Rewrite this text to be clearer and more engaging while preserving the original meaning. Return ONLY the rewritten text, nothing else.',
  friendly:     'Rewrite this in a warmer, friendlier, more casual and approachable tone. Return ONLY the rewritten text, nothing else.',
  professional: 'Rewrite this in a more formal, professional tone suitable for business communication. Return ONLY the rewritten text, nothing else.',
  concise:      'Make this more concise by removing unnecessary words and filler, keeping all key information. Return ONLY the shortened text, nothing else.',
  longer:       'Expand this with more detail, context, and nuance to make it more informative and complete. Return ONLY the expanded text, nothing else.',
  list:         'Convert this into a clear, well-structured list. Use bullet points (•) for unordered items or numbers (1.) for sequential steps. Return ONLY the list, nothing else.',
  improve:      'Improve the overall quality, flow, and impact of this text. Return ONLY the improved text, nothing else.',
  translate:    'Detect the language of the following text and translate it into English. If it is already English, translate it into Spanish. Return ONLY the translated text, nothing else.',
  summarize:    'Write a concise summary of the following text in 2-3 sentences. Return ONLY the summary, nothing else.',
  emojify:      'Enhance the following text by adding relevant emojis. Keep the text readable and do not overuse emojis. Return ONLY the enhanced text, nothing else.',
};

// ── Provider implementations ───────────────────────────────

async function callOpenAI(apiKey, systemPrompt, text, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error('Empty response from OpenAI');
  return result;
}

async function callGemini(apiKey, systemPrompt, text, model) {
  const m = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!result) throw new Error('Empty response from Gemini');
  return result;
}

async function callGroq(apiKey, systemPrompt, text, model) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'llama-3.1-8b-instant',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error('Empty response from Groq');
  return result;
}

async function callAnthropic(apiKey, systemPrompt, text, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.content?.[0]?.text?.trim();
  if (!result) throw new Error('Empty response from Anthropic');
  return result;
}

async function callMistral(apiKey, systemPrompt, text, model) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'mistral-small-latest',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Mistral error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error('Empty response from Mistral');
  return result;
}

async function callTogether(apiKey, systemPrompt, text, model) {
  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Together error (HTTP ${response.status})`);
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error('Empty response from Together AI');
  return result;
}

// Map provider id → caller function
const PROVIDERS = { openai: callOpenAI, gemini: callGemini, groq: callGroq, anthropic: callAnthropic, mistral: callMistral, together: callTogether };

// ── Helpers ────────────────────────────────────────────────

function getAdminSetting(key, fallback) {
  try {
    const db = require('../db');
    const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return fallback; }
}

function getKeys() {
  return {
    openai:    getAdminSetting('ai_openai_key', null)    || process.env.OPENAI_API_KEY    || null,
    gemini:    getAdminSetting('ai_gemini_key', null)    || process.env.GEMINI_API_KEY    || null,
    groq:      getAdminSetting('ai_groq_key', null)      || process.env.GROQ_API_KEY      || null,
    anthropic: getAdminSetting('ai_anthropic_key', null) || process.env.ANTHROPIC_API_KEY || null,
    mistral:   getAdminSetting('ai_mistral_key', null)   || process.env.MISTRAL_API_KEY   || null,
    together:  getAdminSetting('ai_together_key', null)  || process.env.TOGETHER_API_KEY  || null,
  };
}

function getModels() {
  return {
    openai:    getAdminSetting('ai_openai_model', 'gpt-4o-mini'),
    gemini:    getAdminSetting('ai_gemini_model', 'gemini-2.5-flash'),
    groq:      getAdminSetting('ai_groq_model',   'llama-3.1-8b-instant'),
    anthropic: getAdminSetting('ai_anthropic_model', 'claude-haiku-4-5-20251001'),
    mistral:   getAdminSetting('ai_mistral_model', 'mistral-small-latest'),
    together:  getAdminSetting('ai_together_model', 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'),
  };
}

// ── Route ──────────────────────────────────────────────────

router.post('/writing', auth, aiLimiter, aiHourlyLimiter, async (req, res) => {
  const keys = getKeys();
  const models = getModels();
  const aiProvider = getAdminSetting('ai_provider', 'auto');

  const hasAny = Object.values(keys).some(Boolean);
  if (!hasAny) {
    return res.status(503).json({
      error:
        'Writing tools need an AI API key. Configure one in Admin → Settings → AI Config, or add to server/.env:\n' +
        '• OPENAI_API_KEY    — platform.openai.com\n' +
        '• GEMINI_API_KEY    — aistudio.google.com (free)\n' +
        '• GROQ_API_KEY      — console.groq.com (free, fastest)\n' +
        '• ANTHROPIC_API_KEY — console.anthropic.com\n' +
        '• MISTRAL_API_KEY   — console.mistral.ai\n' +
        '• TOGETHER_API_KEY  — api.together.xyz',
    });
  }

  const { text, action } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
  if (!action || !SYSTEM_PROMPTS[action])  return res.status(400).json({ error: 'Invalid action' });
  if (text.length > 4000)                  return res.status(400).json({ error: 'Text too long (max 4000 characters)' });

  const systemPrompt = SYSTEM_PROMPTS[action];

  // Auto priority order: openai → gemini → groq → anthropic → mistral → together
  const AUTO_ORDER = ['openai', 'gemini', 'groq', 'anthropic', 'mistral', 'together'];

  // Build the try-order: the preferred provider first (if one is pinned),
  // then the rest. We try each *configured* provider in turn and fall through
  // on failure — so a quota/rate error on one provider (e.g. OpenAI's
  // "exceeded your current quota") transparently falls back to the next
  // instead of failing the whole request.
  const order = aiProvider !== 'auto' && PROVIDERS[aiProvider]
    ? [aiProvider, ...AUTO_ORDER.filter(p => p !== aiProvider)]
    : AUTO_ORDER;

  let result, usedProvider, lastError;
  for (const p of order) {
    if (!keys[p]) continue;
    try {
      result = await PROVIDERS[p](keys[p], systemPrompt, text, models[p]);
      usedProvider = p;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[ai] provider "${p}" failed, trying next: ${err?.message || err}`);
    }
  }

  if (!result) {
    return res.status(502).json({
      error: lastError?.message
        ? `All configured AI providers failed. Last error: ${lastError.message}`
        : 'No AI provider available',
    });
  }
  res.json({ result, provider: usedProvider });
});

// ── Available actions list (for client discovery) ──────────
router.get('/writing/actions', auth, (req, res) => {
  res.json(Object.keys(SYSTEM_PROMPTS));
});

// ── Provider status (which providers are configured) ───────
router.get('/writing/status', auth, (req, res) => {
  const keys = getKeys();
  const provider = getAdminSetting('ai_provider', 'auto');
  res.json({
    provider,
    configured: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, !!v])),
  });
});

module.exports = { router, getKeys, getModels, PROVIDERS, callOpenAI, callGemini, callGroq, callAnthropic, callMistral, callTogether };
