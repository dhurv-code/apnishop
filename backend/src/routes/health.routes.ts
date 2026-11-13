
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      success: true,
      message: "ApnaBasket API is running",
      service: "apnabasket-backend",
      timestamp: new Date().toISOString(),
    };
  });
}
