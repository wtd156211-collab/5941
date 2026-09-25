import { createServer } from './app';

const port = Number(process.env.PORT ?? 8787);
createServer().listen(port, () => {
  console.log(`测试失败定位工具已启动: http://localhost:${port}`);
});
