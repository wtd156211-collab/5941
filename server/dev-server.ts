/** 同时启动 API(8787) 与 Vite(5173)，Vite 把 /api 代理到 API。 */
import { createApp } from './app';
import { createServer as createViteServer } from 'vite';

const apiPort = Number(process.env.API_PORT ?? 8787);
const webPort = Number(process.env.PORT ?? 5173);

const app = await createApp();
await new Promise<void>((resolve) => app.listen(apiPort, resolve));
console.log(`API: http://localhost:${apiPort}`);

const vite = await createViteServer({
  configFile: 'vite.config.ts',
  server: { port: webPort, strictPort: false },
});
await vite.listen();
vite.printUrls();
