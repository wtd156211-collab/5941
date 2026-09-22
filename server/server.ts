import { startServer } from './app';

const port = Number(process.env.PORT ?? 8787);
startServer(port).catch((e) => {
  console.error(e);
  process.exit(1);
});
