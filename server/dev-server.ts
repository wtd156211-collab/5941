import { spawn } from 'node:child_process';
import { createServer } from './app';

const apiPort = Number(process.env.API_PORT ?? 8787);
createServer().listen(apiPort, () => {
  console.log(`API 服务: http://localhost:${apiPort}`);
});

const vite = spawn('npx', ['vite', '--port', '5173'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_API_PORT: String(apiPort) },
});
vite.on('exit', (code) => process.exit(code ?? 0));
