import { spawn } from 'node:child_process';
import process from 'node:process';
import { createServer } from 'vite';

const host = '127.0.0.1';
const preferredPort = 5173;

function openBrowser(url) {
  if (process.env.TUYE_NO_BROWSER === '1') {
    return;
  }

  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

const server = await createServer({
  clearScreen: false,
  server: {
    host,
    port: preferredPort,
    strictPort: false,
  },
});

let closing = false;
const closeServer = async () => {
  if (closing) {
    return;
  }
  closing = true;
  await server.close();
  process.exit(0);
};

process.once('SIGINT', closeServer);
process.once('SIGTERM', closeServer);

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://${host}:${preferredPort}/`;
  console.log('');
  console.log('  蜕野 Demo 0.1 已启动');
  console.log(`  游戏地址：${url}`);
  console.log('  关闭此窗口即可停止游戏。');
  console.log('');
  openBrowser(url);
} catch (error) {
  console.error('无法启动蜕野：', error);
  await server.close();
  process.exitCode = 1;
}
