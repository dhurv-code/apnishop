
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import {
  productRoutes,
  categoryRoutes,
} from "./routes/product.routes.js";
import cookie from "@fastify/cookie";
import { authRoutes } from "./routes/auth.routes.js";
import { customerRoutes } from "./routes/customer.routes.js";
import { orderRoutes } from "./routes/orders.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { adminCatalogRoutes } from "./routes/admin-catalog.routes.js";
import { deliveryRoutes } from "./routes/delivery.routes.js";
import { substitutionRoutes } from "./routes/substitution.routes.js";
import { deliveryCompletionRoutes } from "./routes/delivery-completion.routes.js";
import { adminPartnerRoutes } from "./routes/admin-partners.routes.js";
import { notificationRoutes } from "./routes/notifications.routes.js";
import { getSessionUser } from "./utils/session.js";



export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
      ],
    },
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });

  const allowedOrigins = env.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim());

  

  await app.register(helmet);
  await app.register(cookie);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(healthRoutes, {
    prefix: "/api/v1",
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      success: false,
      message: "API endpoint not found",
      path: request.url,
    });
  });

  
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Request failed");

  const statusCode =
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 600
      ? error.statusCode
      : 500;

  const message =
    statusCode >= 500 && env.NODE_ENV === "production"
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Request failed";

  return reply.code(statusCode).send({
    success: false,
    message,
  });
});

await app.register(productRoutes, {
  prefix: "/api/v1",
});

await app.register(categoryRoutes, {
  prefix: "/api/v1",
});

await app.register(authRoutes, {
  prefix: "/api/v1",
});
await app.register(async (customerScope) => {
  customerScope.addHook("preHandler", async (request, reply) => {
    const session = await getSessionUser(request);

    if (!session) {
      return reply.code(401).send({
        success: false,
        message: "Please log in.",
      });
    }

    if (session.role !== "CUSTOMER") {
      return reply.code(403).send({
        success: false,
        message: "Customer access required.",
      });
    }
  });

  await customerScope.register(customerRoutes);
}, {
  prefix: "/api/v1",
});

await app.register(orderRoutes, {
  prefix: "/api/v1",
});
await app.register(adminRoutes, {
  prefix: "/api/v1",
});
await app.register(adminCatalogRoutes, {
  prefix: "/api/v1",
});

await app.register(deliveryRoutes, {
  prefix: "/api/v1",
});
await app.register(substitutionRoutes, {
  prefix: "/api/v1",
});

await app.register(deliveryCompletionRoutes, {
  prefix: "/api/v1",
});

await app.register(adminPartnerRoutes, {
  prefix: "/api/v1",
});

await app.register(notificationRoutes, {
  prefix: "/api/v1",
});


  return app;
}
