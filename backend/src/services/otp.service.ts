import { randomInt } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";

type EmailRelayResponse = {
  success?: boolean;
  message?: string;
};

export function generateOtp(): string {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

/**
 * Sends an OTP through the private Google Apps Script relay.
 * The relay secret is sent server-to-server and is never exposed to the browser.
 */
export async function deliverOtp(
  email: string,
  otp: string,
  logger: FastifyBaseLogger
): Promise<void> {
  const webhookUrl = env.OTP_EMAIL_WEBHOOK_URL;
  const webhookSecret = env.OTP_EMAIL_WEBHOOK_SECRET;

  // Keep local development convenient without weakening production behavior.
  if (!webhookUrl || !webhookSecret) {
    if (env.NODE_ENV === "development") {
      logger.info(
        {
          emailDomain: email.split("@").at(-1) ?? "unknown",
          developmentOtp: otp,
        },
        "DEVELOPMENT ONLY: Email OTP (no email relay configured)"
      );
      return;
    }

    throw new Error("EMAIL_OTP_NOT_CONFIGURED");
  }

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        otp,
        secret: webhookSecret,
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    logger.error("ApnaBasket email OTP relay could not be reached.");
    throw new Error("EMAIL_OTP_DELIVERY_FAILED");
  }

  let payload: EmailRelayResponse | null = null;
  try {
    payload = JSON.parse(await response.text()) as EmailRelayResponse;
  } catch {
    // Apps Script should return JSON. Treat HTML/login pages as a failed relay.
  }

  if (!response.ok || payload?.success !== true) {
    logger.error(
      { providerStatus: response.status },
      "ApnaBasket email OTP relay rejected the request."
    );
    throw new Error("EMAIL_OTP_DELIVERY_FAILED");
  }

  logger.info(
    { emailDomain: email.split("@").at(-1) ?? "unknown" },
    "ApnaBasket email OTP accepted by relay."
  );
}
