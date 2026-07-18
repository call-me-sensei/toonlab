import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  clearBrowserStorage,
  deleteBrowserStorageValue,
  deleteLibraryEntry,
  getLibraryState,
  getWorkspaceInfo,
  importBrowserStorage,
  migrateLibraryEntries,
  readBrowserStorage,
  readWorkspaceFile,
  resolveWorkspacePath,
  saveLibraryEntry,
  setBrowserStorageValue,
  writeWorkspaceFile,
} from './workspace.mjs';

const JSON_LIMIT = 8 * 1024 * 1024;
const FILE_LIMIT = 128 * 1024 * 1024;

function readBody(request, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function readJsonBody(request) {
  const body = await readBody(request, JSON_LIMIT);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(`${JSON.stringify(value)}\n`);
}

function methodNotAllowed(response, methods) {
  response.setHeader('allow', methods.join(', '));
  sendJson(response, 405, { error: 'Method not allowed.' });
}

export function toonlabWorkspacePlugin({ rootDirectory = process.cwd(), workspace = '.toonlab' } = {}) {
  const projectRoot = resolve(rootDirectory);
  const workspacePath = resolveWorkspacePath(workspace, projectRoot);
  const serverPath = join(projectRoot, 'mcp', 'server.mjs');

  async function middleware(request, response, next) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/toonlab/')) return next();

    try {
      if (url.pathname === '/api/toonlab/workspace') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        const info = await getWorkspaceInfo(workspacePath);
        return sendJson(response, 200, {
          ...info,
          mcp: {
            args: [serverPath, '--workspace', workspacePath],
            command: process.execPath,
            transport: 'stdio',
          },
          projectRoot,
        });
      }

      if (url.pathname === '/api/toonlab/storage') {
        if (request.method === 'GET') return sendJson(response, 200, await readBrowserStorage(workspacePath));
        if (request.method === 'DELETE') return sendJson(response, 200, { entries: await clearBrowserStorage(workspacePath) });
        return methodNotAllowed(response, ['GET', 'DELETE']);
      }

      if (url.pathname === '/api/toonlab/storage/import') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        return sendJson(response, 200, await importBrowserStorage(workspacePath, body.entries));
      }

      if (url.pathname.startsWith('/api/toonlab/storage/')) {
        const key = decodeURIComponent(url.pathname.slice('/api/toonlab/storage/'.length));
        if (request.method === 'PUT') {
          const body = await readJsonBody(request);
          return sendJson(response, 200, { entries: await setBrowserStorageValue(workspacePath, key, body.value) });
        }
        if (request.method === 'DELETE') {
          return sendJson(response, 200, { entries: await deleteBrowserStorageValue(workspacePath, key) });
        }
        return methodNotAllowed(response, ['PUT', 'DELETE']);
      }

      if (url.pathname === '/api/toonlab/library') {
        if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
        return sendJson(response, 200, await getLibraryState(workspacePath));
      }

      if (url.pathname === '/api/toonlab/library/migrate') {
        if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
        const body = await readJsonBody(request);
        return sendJson(response, 200, await migrateLibraryEntries(workspacePath, body.entries));
      }

      if (url.pathname.startsWith('/api/toonlab/library/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/toonlab/library/'.length));
        if (request.method === 'PUT') {
          const entry = await readJsonBody(request);
          if (entry.id !== id) throw Object.assign(new Error('Library entry id does not match the URL.'), { statusCode: 400 });
          return sendJson(response, 200, { entry: await saveLibraryEntry(workspacePath, entry) });
        }
        if (request.method === 'DELETE') {
          return sendJson(response, 200, { deleted: await deleteLibraryEntry(workspacePath, id) });
        }
        return methodNotAllowed(response, ['PUT', 'DELETE']);
      }

      if (url.pathname.startsWith('/api/toonlab/files/')) {
        const relativePath = decodeURIComponent(url.pathname.slice('/api/toonlab/files/'.length));
        if (request.method === 'PUT') {
          const body = await readBody(request, FILE_LIMIT);
          return sendJson(response, 200, { file: await writeWorkspaceFile(workspacePath, relativePath, body) });
        }
        if (request.method === 'GET') {
          const file = await readWorkspaceFile(workspacePath, relativePath);
          response.statusCode = 200;
          response.setHeader('content-type', file.mimeType);
          response.setHeader('content-length', String(file.data.length));
          response.end(file.data);
          return;
        }
        return methodNotAllowed(response, ['PUT', 'GET']);
      }

      return sendJson(response, 404, { error: 'Unknown ToonLab workspace route.' });
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.code === 'ENOENT' ? 404 : 500);
      return sendJson(response, status, { error: error?.message ?? String(error) });
    }
  }

  return {
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    name: 'toonlab-workspace',
    async transformIndexHtml() {
      return [{
        children: await readFile(join(projectRoot, 'labs', 'shared', 'workspace-bootstrap.js'), 'utf8'),
        injectTo: 'head-prepend',
        tag: 'script',
      }];
    },
  };
}
