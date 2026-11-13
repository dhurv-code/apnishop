
import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function startServer() {
  const app = await buildApp();

  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    app.log.info(
      `ApnaBasket API running at http://${env.HOST}:${env.PORT}`
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const shutdown = async () => {
    app.log.info("Shutting down ApnaBasket API...");

    await app.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer();
