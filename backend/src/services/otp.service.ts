
import { randomInt } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";

export function generateOtp(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

export async function deliverOtp(
  phone: string,
  otp: string,
  logger: FastifyBaseLogger
): Promise<void> {
  // Development-only mock SMS provider.
  // Replace this with an actual SMS provider before production.

  if (env.NODE_ENV !== "development") {
    throw new Error("Production SMS provider is not configured.");
  }

  logger.info(
    {
      phone: `******${phone.slice(-4)}`,
      developmentOtp: otp,
    },
    "DEVELOPMENT ONLY: Customer OTP"
  );
}
