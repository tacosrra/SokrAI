import { buildApp } from './app';

async function main(): Promise<void> {
  const app = await buildApp();

  await app.listen({
    port: app.services.config.appPort,
    host: '0.0.0.0',
  });

  app.services.logger.info('api_started', {
    port: app.services.config.appPort,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
