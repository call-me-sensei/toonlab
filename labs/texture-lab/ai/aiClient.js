// Provider calls for the AI assist panel. Keys are user-supplied, stored in
// localStorage only (textureProjectStore), and sent exclusively to the
// selected provider's official endpoint from this browser — there is no
// ToonLab server in the path. The prompt/response contract lives in
// src/texgen/textureAi.js so library users get the same mapping.

import {
  buildTextureAiPrompt,
  compileTextureAiRecipe,
  keywordTextureRecipe,
  parseTextureAiResponse,
} from '../../../src/texgen/index.js';

function friendlyHttpError(provider, status, bodyText) {
  if (status === 401 || status === 403) return `${provider}: API key rejected (${status}). Check the key and its permissions.`;
  if (status === 404) return `${provider}: model not found (404). Check the model id.`;
  if (status === 429) return `${provider}: rate limited (429). Wait a moment and retry.`;
  const detail = bodyText?.slice(0, 180) ?? '';
  return `${provider}: request failed (${status}). ${detail}`;
}

async function readErrorText(response) {
  try {
    const body = await response.json();
    return body?.error?.message ?? JSON.stringify(body).slice(0, 200);
  } catch {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}

async function callGemini({ apiKey, model, system, user }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    body: JSON.stringify({
      contents: [{ parts: [{ text: user }], role: 'user' }],
      generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json', temperature: 0.35 },
      systemInstruction: { parts: [{ text: system }] },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new Error(friendlyHttpError('Gemini', response.status, await readErrorText(response)));
  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text) {
    const reason = body?.candidates?.[0]?.finishReason ?? body?.promptFeedback?.blockReason ?? 'empty response';
    throw new Error(`Gemini returned no text (${reason}).`);
  }
  return text;
}

async function callOpenAi({ apiKey, model, system, user }, { jsonMode = true } = {}) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    body: JSON.stringify({
      messages: [
        { content: system, role: 'system' },
        { content: user, role: 'user' },
      ],
      model,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  if (!response.ok) {
    const detail = await readErrorText(response);
    // Some models reject response_format — retry once without it.
    if (jsonMode && response.status === 400 && /response_format/i.test(detail)) {
      return callOpenAi({ apiKey, model, system, user }, { jsonMode: false });
    }
    throw new Error(friendlyHttpError('OpenAI', response.status, detail));
  }
  const body = await response.json();
  const text = body?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`OpenAI returned no text (${body?.choices?.[0]?.finish_reason ?? 'empty response'}).`);
  return text;
}

/**
 * Maps a natural-language prompt to a compiled texture recipe using the
 * configured provider. mode 'new' starts from the best archetype; 'refine'
 * patches the current settings. Always resolves to
 * { settings, name, notes, presetId } or throws with a friendly message.
 */
export async function runTexturePrompt({ prompt, mode = 'new', settings = null, config }) {
  const clean = String(prompt ?? '').trim();
  if (!clean) throw new Error('Describe the texture first.');

  if (config.provider === 'offline') {
    return keywordTextureRecipe(clean, { currentSettings: settings, mode });
  }

  const apiKey = config.keys[config.provider]?.trim();
  const model = config.models[config.provider]?.trim();
  if (!apiKey) throw new Error(`Add your ${config.provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key first (stored only in this browser).`);
  if (!model) throw new Error('Set a model id first.');

  const { system, user } = buildTextureAiPrompt({ mode, prompt: clean, settings });
  let text;
  try {
    text = config.provider === 'gemini'
      ? await callGemini({ apiKey, model, system, user })
      : await callOpenAi({ apiKey, model, system, user });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`${config.provider === 'gemini' ? 'Gemini' : 'OpenAI'}: network error — check your connection (and any content blockers).`);
    }
    throw error;
  }

  let recipe;
  try {
    recipe = parseTextureAiResponse(text);
  } catch (error) {
    throw new Error(`The model reply was not valid recipe JSON (${error.message}). Try again or a different model.`);
  }
  return compileTextureAiRecipe(recipe, { currentSettings: settings, mode });
}
