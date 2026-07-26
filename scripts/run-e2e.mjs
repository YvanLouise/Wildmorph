import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const server = await createServer({
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 4397,
    strictPort: true,
  },
});

let exitCode = 1;
try {
  await server.listen();
  const cliArgs = process.argv.slice(2);
  const childEnvironment = {
    ...process.env,
    ...(cliArgs.some((argument) => argument.includes('soak')) ? { TUYE_SOAK: '1' } : {}),
  };
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', ...cliArgs], {
      cwd: process.cwd(),
      env: childEnvironment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await server.close();
}

process.exitCode = exitCode;
