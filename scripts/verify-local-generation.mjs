import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  downloadProviderAsset,
  runProvider,
} from '../database/providers.mjs';

const originalFetch = globalThis.fetch;
const originalKeys = {
  ARK_API_KEY: process.env.ARK_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TRIPO_API_KEY: process.env.TRIPO_API_KEY,
};

process.env.ARK_API_KEY = 'test-ark';
process.env.GEMINI_API_KEY = 'test-gemini';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.TRIPO_API_KEY = 'test-tripo';

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  headers: { 'content-type': 'application/json' },
  status,
});

try {
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: Buffer.from('gemini-image').toString('base64'),
              mimeType: 'image/png',
            },
          }],
        },
      }],
    });
  };
  const gemini = await runProvider('gemini', {
    aspectRatio: '16:9',
    kind: 'concept_image',
    model: 'gemini-image-test',
    prompt: 'lantern',
    referenceImages: [{ bytes: Uint8Array.of(1, 2, 3), mimeType: 'image/png' }],
    resolution: '2k',
  });
  assert.equal(Buffer.from(gemini.bytes).toString(), 'gemini-image');
  assert.match(calls[0].url, /gemini-image-test:generateContent$/);
  const geminiBody = JSON.parse(calls[0].init.body);
  assert.match(geminiBody.contents[0].parts[0].text, /^Game asset concept: lantern/);
  assert.equal(geminiBody.contents[0].parts[1].inlineData.data, 'AQID');
  assert.equal(geminiBody.generationConfig.imageConfig.aspectRatio, '16:9');
  assert.equal(geminiBody.generationConfig.imageConfig.imageSize, '2K');

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      data: [{ b64_json: Buffer.from('openai-image').toString('base64') }],
    });
  };
  const openai = await runProvider('openai', {
    aspectRatio: '4:3',
    kind: 'image',
    model: 'gpt-image-test',
    prompt: 'painted shrine',
    referenceImages: [{ bytes: Uint8Array.of(4, 5, 6), mimeType: 'image/webp' }],
    resolution: '2k',
  });
  assert.equal(Buffer.from(openai.bytes).toString(), 'openai-image');
  assert.match(calls[0].url, /\/images\/edits$/);
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.body.get('size'), '2048x1536');
  assert.equal(calls[0].init.body.getAll('image[]').length, 1);

  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    return jsonResponse({
      data: [{ b64_json: Buffer.from('ark-image').toString('base64') }],
    });
  };
  await runProvider('ark', {
    aspectRatio: '3:4',
    kind: 'image',
    model: 'seedream-test',
    prompt: 'painted shrine',
    resolution: '4k',
  });
  assert.equal(JSON.parse(calls[0].init.body).size, '2880x3840');

  calls = [];
  let uploadIndex = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url: String(url) });
    if (String(url).endsWith('/upload')) {
      uploadIndex += 1;
      return jsonResponse({ code: 0, data: { image_token: `view-${uploadIndex}` } });
    }
    return jsonResponse({ code: 0, data: { task_id: 'tripo-task' } });
  };
  const tripo = await runProvider('tripo', {
    kind: 'multiview_to_model',
    viewImages: [
      { bytes: Uint8Array.of(1), mimeType: 'image/png' },
      { bytes: Uint8Array.of(2), mimeType: 'image/jpeg' },
      null,
      null,
    ],
  });
  assert.equal(tripo.taskId, 'tripo-task');
  assert.equal(calls.filter((call) => call.url.endsWith('/upload')).length, 2);
  const tripoTask = calls.find((call) => call.url.endsWith('/task'));
  const tripoBody = JSON.parse(tripoTask.init.body);
  assert.equal(tripoBody.type, 'multiview_to_model');
  assert.deepEqual(tripoBody.files, [
    { file_token: 'view-1', type: 'png' },
    { file_token: 'view-2', type: 'jpg' },
    {},
    {},
  ]);

  let unsafeFetchCalled = false;
  globalThis.fetch = async () => {
    unsafeFetchCalled = true;
    return new Response();
  };
  await assert.rejects(
    downloadProviderAsset('http://127.0.0.1/private'),
    /unsafe asset URL/,
  );
  assert.equal(unsafeFetchCalled, false);

  const app = await readFile(new URL('../labs/generate/App.jsx', import.meta.url), 'utf8');
  const route = await readFile(new URL('../mcp/vite-plugin.mjs', import.meta.url), 'utf8');
  const provider = await readFile(new URL('../database/providers.mjs', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../database/repository.mjs', import.meta.url), 'utf8');
  const primitives = await readFile(new URL('../labs/shared/proPrimitives.css', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /character/i);
  assert.match(app, /Multi-view/);
  assert.match(app, /AI Enhance/);
  assert.match(app, /Generate 3D automatically/);
  assert.match(app, /Save to Library/);
  assert.match(app, /Combine into one model/);
  assert.match(route, /\/api\/toonlab\/reference-url/);
  assert.match(route, /\/api\/toonlab\/generate\/enhance/);
  assert.match(route, /\/api\/toonlab\/generation\//);
  assert.match(route, /OSS image generation currently supports Gemini only/);
  assert.match(provider, /\/images\/edits/);
  assert.match(provider, /multiview_to_model/);
  assert.match(provider, /mesh_segmentation/);
  assert.doesNotMatch(repository, /Seedream 5\.0 Lite/);
  assert.doesNotMatch(repository, /GPT Image 2/);
  assert.match(primitives, /\.tl-btn--primary/);
  assert.match(primitives, /\.tl-empty/);

  console.log('Local Generate provider and UI verification passed.');
} finally {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
