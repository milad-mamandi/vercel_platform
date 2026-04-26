import { buildApp } from './app.js';
import { env } from './env.js';

const app = buildApp();

const start = async () => {
  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    app.log.info(`API listening on :${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
