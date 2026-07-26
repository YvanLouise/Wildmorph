import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import {
  createDefaultGameConfigOverrides,
  validateGameConfig,
  type GameConfig,
} from './src/game/config/GameConfig';

const TUNED_DEFAULTS_ROUTE = '/__wildmorph/tuned-defaults';
const TUNED_DEFAULTS_FILE = 'src/game/config/tunedDefaults.json';
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_CONFIG_BYTES) {
        reject(new Error('配置数据超过 2MB 限制'));
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', reject);
  });
}

function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function tunedDefaultsPlugin(): Plugin {
  let projectRoot = '';
  return {
    name: 'wildmorph-tuned-defaults',
    apply: 'serve',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      server.middlewares.use(TUNED_DEFAULTS_ROUTE, async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: '仅支持 POST' }));
          return;
        }
        if (!isSameOrigin(request.headers.origin, request.headers.host)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ error: '仅允许同源调参台写入' }));
          return;
        }
        try {
          const payload = JSON.parse(await readRequestBody(request)) as { config?: unknown };
          const validation = validateGameConfig(payload.config);
          if (validation.errors.length) {
            response.statusCode = 422;
            response.end(JSON.stringify({ error: '配置校验失败', issues: validation.errors }));
            return;
          }
          if (process.env.WILDMORPH_DISABLE_DEFAULT_SYNC === '1') {
            response.end(JSON.stringify({ ok: true, changed: false, disabled: true }));
            return;
          }
          const overrides = createDefaultGameConfigOverrides(payload.config as GameConfig);
          const serialized = `${JSON.stringify(overrides, null, 2)}\n`;
          const filePath = resolve(projectRoot, TUNED_DEFAULTS_FILE);
          const previous = await readFile(filePath, 'utf8').catch(() => '');
          const changed = previous !== serialized;
          if (changed) {
            await writeFile(filePath, serialized, 'utf8');
            const modules = server.moduleGraph.getModulesByFile(normalizePath(filePath));
            modules?.forEach((module) => server.moduleGraph.invalidateModule(module));
          }
          response.end(JSON.stringify({ ok: true, changed }));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : '无法写入默认参数',
          }));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Wildmorph/' : '/',
  plugins: [tunedDefaultsPlugin()],
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: [`**/${TUNED_DEFAULTS_FILE}`],
    },
  },
  build: {
    target: 'es2022',
  },
}));
