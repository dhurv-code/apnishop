

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  HOST: z.string().default("127.0.0.1"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),

  OTP_PEPPER: z.string().min(32),

  // Optional in development (OTP is logged locally); required by the OTP
  // service in production. Keep both values in the Render environment only.
  OTP_EMAIL_WEBHOOK_URL: z.string().url().optional(),
  OTP_EMAIL_WEBHOOK_SECRET: z.string().min(32).optional(),

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten());
  throw new Error("Backend environment validation failed.");
}

export const env = parsed.data;



// import "dotenv/config";
// import { z } from "zod";

// const envSchema = z.object({
//   NODE_ENV: z
//     .enum(["development", "production", "test"])
//     .default("development"),

//   PORT: z.coerce.number().int().min(1).max(65535).default(4000),

//   HOST: z.string().default("127.0.0.1"),

//   CORS_ORIGIN: z.string().default("http://localhost:3000"),
// });

// const result = envSchema.safeParse(process.env);

// if (!result.success) {
//   console.error("Invalid environment configuration:");
//   console.error(result.error.flatten().fieldErrors);
//   process.exit(1);
// }

// export const env = result.data;
