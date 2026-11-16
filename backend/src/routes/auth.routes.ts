import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";

import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
} from "drizzle-orm";

import { z } from "zod";

import { db } from "../database/index.js";
import {
  otpChallenges,
  userSessions,
  users,
} from "../database/schema.js";

import { env } from "../config/env.js";
import { deliverOtp, generateOtp } from "../services/otp.service.js";

const COOKIE_NAME =
  env.NODE_ENV === "production"
    ? "__Host-apnabasket_session"
    : "apnabasket_session";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
};

function normalizeIndianPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }

  return `+91${digits}`;
}

const phoneSchema = z
  .string()
  .transform(normalizeIndianPhone)
  .refine((value): value is string => value !== null, {
    message: "Enter a valid Indian mobile number.",
  });

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(255)
  .transform((value) => value.toLowerCase());

const requestOtpSchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120).optional(),
});

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP."),
  fullName: z.string().trim().min(2).max(120).optional(),
});

function hashOtp(phone: string, email: string, otp: string): string {
  return createHmac("sha256", env.OTP_PEPPER)
    .update(`${email}:${phone}:${otp}`)
    .digest("hex");
}

function hashSessionToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function safeCompareHex(a: string, b: string): boolean {
  const first = Buffer.from(a, "hex");
  const second = Buffer.from(b, "hex");

  return (
    first.length === second.length &&
    first.length > 0 &&
    timingSafeEqual(first, second)
  );
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export async function findAuthenticatedUser(request: FastifyRequest) {
  const token = request.cookies?.[COOKIE_NAME];

  if (!token) return null;

  const tokenHash = hashSessionToken(token);

  const result = await db
    .select({
      id: users.id,
      phone: users.phone,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
        eq(users.status, "ACTIVE")
      )
    )
    .limit(1);

  return result[0] ?? null;
}

export async function authRoutes(app: FastifyInstance) {
  // -----------------------------------------
  // REQUEST EMAIL OTP
  // POST /api/v1/auth/request-otp
  // -----------------------------------------

  app.post(
    "/auth/request-otp",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "10 minutes",
        },
      },
    },
    async (request, reply) => {
      const parsed = requestOtpSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Enter a valid mobile number and email address.",
          errors: parsed.error.flatten(),
        });
      }

      const { phone, email, fullName } = parsed.data;

      // Email OTP proves control of the email inbox, not the mobile number.
      // Never silently attach an arbitrary email to an existing phone account.
      const [phoneAccounts, emailAccounts] = await Promise.all([
        db
          .select({ id: users.id, phone: users.phone, email: users.email })
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1),
        db
          .select({ id: users.id, phone: users.phone, email: users.email })
          .from(users)
          .where(eq(users.email, email))
          .limit(1),
      ]);

      const phoneAccount = phoneAccounts[0];
      const emailAccount = emailAccounts[0];

      if (phoneAccount && phoneAccount.email?.toLowerCase() !== email) {
        return reply.code(409).send({
          success: false,
          message:
            "This mobile number already belongs to an account that has no matching verified email. Contact ApnaBasket support to link your email before signing in.",
        });
      }

      if (emailAccount && emailAccount.phone !== phone) {
        return reply.code(409).send({
          success: false,
          message:
            "This email address is already linked to a different mobile number.",
        });
      }

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const [phoneRecent, emailRecent] = await Promise.all([
        db
          .select({ total: count() })
          .from(otpChallenges)
          .where(
            and(
              eq(otpChallenges.phone, phone),
              gte(otpChallenges.createdAt, tenMinutesAgo)
            )
          ),
        db
          .select({ total: count() })
          .from(otpChallenges)
          .where(
            and(
              eq(otpChallenges.email, email),
              gte(otpChallenges.createdAt, tenMinutesAgo)
            )
          ),
      ]);

      if (
        Number(phoneRecent[0]?.total ?? 0) >= 3 ||
        Number(emailRecent[0]?.total ?? 0) >= 3
      ) {
        return reply.code(429).send({
          success: false,
          message: "Too many OTP requests. Try again later.",
        });
      }

      const now = new Date();
      const otp = generateOtp();
      const otpHash = hashOtp(phone, email, otp);
      let challengeId: string | undefined;

      await db.transaction(async (tx) => {
        // A new request invalidates any outstanding code for this phone.
        await tx
          .update(otpChallenges)
          .set({ consumedAt: now })
          .where(
            and(
              eq(otpChallenges.phone, phone),
              isNull(otpChallenges.consumedAt)
            )
          );

        const inserted = await tx
          .insert(otpChallenges)
          .values({
            phone,
            email,
            fullName: fullName ?? null,
            otpHash,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            failedAttempts: 0,
          })
          .returning({ id: otpChallenges.id });

        challengeId = inserted[0]?.id;
      });

      if (!challengeId) {
        request.log.error("Email OTP challenge could not be created.");
        return reply.code(500).send({
          success: false,
          message: "Unable to create a verification request. Try again.",
        });
      }

      try {
        await deliverOtp(email, otp, request.log);
      } catch (error) {
        // Prevent a code from being used if delivery failed.
        await db
          .update(otpChallenges)
          .set({ consumedAt: new Date() })
          .where(eq(otpChallenges.id, challengeId));

        const notConfigured =
          error instanceof Error && error.message === "EMAIL_OTP_NOT_CONFIGURED";

        request.log.error(
          { deliveryConfigured: !notConfigured },
          "ApnaBasket email OTP delivery failed."
        );

        return reply.code(notConfigured ? 503 : 502).send({
          success: false,
          message: notConfigured
            ? "Email OTP is not configured. Contact ApnaBasket support."
            : "We could not send the verification email. Check the address and try again.",
        });
      }

      return reply.code(200).send({
        success: true,
        message: `A six-digit verification code was sent to ${maskEmail(email)}. It expires in 5 minutes.`,
      });
    }
  );

  // -----------------------------------------
  // VERIFY EMAIL OTP
  // POST /api/v1/auth/verify-otp
  // -----------------------------------------

  app.post(
    "/auth/verify-otp",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "10 minutes",
        },
      },
    },
    async (request, reply) => {
      const parsed = verifyOtpSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Enter a valid mobile number, email address and six-digit OTP.",
          errors: parsed.error.flatten(),
        });
      }

      const { phone, email, otp, fullName } = parsed.data;
      const sessionToken = randomBytes(32).toString("base64url");
      const sessionHash = hashSessionToken(sessionToken);
      const now = new Date();
      const expiresAt = new Date(
        Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
      );

      const result = await db.transaction(async (tx) => {
        const challenges = await tx
          .select()
          .from(otpChallenges)
          .where(
            and(
              eq(otpChallenges.phone, phone),
              eq(otpChallenges.email, email),
              isNull(otpChallenges.consumedAt)
            )
          )
          .orderBy(desc(otpChallenges.createdAt))
          .limit(1)
          .for("update");

        const challenge = challenges[0];

        if (!challenge) {
          return { kind: "invalid" as const };
        }

        if (challenge.expiresAt <= now) {
          await tx
            .update(otpChallenges)
            .set({ consumedAt: now })
            .where(eq(otpChallenges.id, challenge.id));
          return { kind: "expired" as const };
        }

        if (challenge.failedAttempts >= 5) {
          return { kind: "locked" as const };
        }

        const expectedHash = hashOtp(phone, email, otp);
        if (!safeCompareHex(challenge.otpHash, expectedHash)) {
          const attempts = challenge.failedAttempts + 1;
          await tx
            .update(otpChallenges)
            .set({
              failedAttempts: attempts,
              ...(attempts >= 5 ? { consumedAt: now } : {}),
            })
            .where(eq(otpChallenges.id, challenge.id));
          return { kind: "invalid" as const };
        }

        const existingUsers = await tx
          .select({
            id: users.id,
            phone: users.phone,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            fullName: users.fullName,
            role: users.role,
            status: users.status,
          })
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1);

        let user = existingUsers[0];

        if (!user) {
          const existingEmailUsers = await tx
            .select({ id: users.id, phone: users.phone })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (existingEmailUsers[0]) {
            await tx
              .update(otpChallenges)
              .set({ consumedAt: now })
              .where(eq(otpChallenges.id, challenge.id));
            return { kind: "email_conflict" as const };
          }

          const name = fullName ?? challenge.fullName;
          if (!name) {
            // Keep the challenge active so the customer can enter their name.
            return { kind: "name_required" as const };
          }

          const created = await tx
            .insert(users)
            .values({
              phone,
              email,
              emailVerifiedAt: now,
              fullName: name,
              role: "CUSTOMER",
              status: "ACTIVE",
              // Email was verified. The mobile number remains a contact number
              // until a separate phone-verification method is configured.
            })
            .returning({
              id: users.id,
              phone: users.phone,
              email: users.email,
              emailVerifiedAt: users.emailVerifiedAt,
              fullName: users.fullName,
              role: users.role,
              status: users.status,
            });

          const createdUser = created[0];
          if (!createdUser) {
            throw new Error("User creation did not return a record.");
          }
          user = createdUser;
        } else if (user.email?.toLowerCase() !== email) {
          await tx
            .update(otpChallenges)
            .set({ consumedAt: now })
            .where(eq(otpChallenges.id, challenge.id));
          return { kind: "email_conflict" as const };
        } else if (!user.emailVerifiedAt) {
          await tx
            .update(users)
            .set({ emailVerifiedAt: now, updatedAt: now })
            .where(eq(users.id, user.id));
        }

        await tx
          .update(otpChallenges)
          .set({ consumedAt: now })
          .where(eq(otpChallenges.id, challenge.id));

        if (user.status !== "ACTIVE") {
          return { kind: "restricted" as const };
        }

        await tx.insert(userSessions).values({
          userId: user.id,
          tokenHash: sessionHash,
          expiresAt,
        });

        return {
          kind: "success" as const,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
        };
      });

      if (result.kind === "invalid") {
        return reply.code(400).send({
          success: false,
          message: "Invalid OTP or no active verification request.",
        });
      }

      if (result.kind === "expired") {
        return reply.code(400).send({
          success: false,
          message: "OTP expired. Request a new code.",
        });
      }

      if (result.kind === "locked") {
        return reply.code(429).send({
          success: false,
          message: "Too many incorrect attempts. Request a new code.",
        });
      }

      if (result.kind === "name_required") {
        return reply.code(400).send({
          success: false,
          message: "Enter your name to complete registration.",
        });
      }

      if (result.kind === "email_conflict") {
        return reply.code(409).send({
          success: false,
          message:
            "This email/mobile combination is already linked to another account. Contact ApnaBasket support.",
        });
      }

      if (result.kind === "restricted") {
        return reply.code(403).send({
          success: false,
          message: "This account is inactive and cannot log in.",
        });
      }

      reply.setCookie(COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

      return reply.code(200).send({
        success: true,
        message: "Login successful.",
        data: result.user,
      });
    }
  );

  // -----------------------------------------
  // CURRENT AUTHENTICATED USER
  // GET /api/v1/auth/me
  // -----------------------------------------

  app.get("/auth/me", async (request, reply) => {
    const user = await findAuthenticatedUser(request);

    if (!user) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    return {
      success: true,
      data: user,
    };
  });

  // -----------------------------------------
  // LOGOUT
  // POST /api/v1/auth/logout
  // -----------------------------------------

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[COOKIE_NAME];

    if (token) {
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.tokenHash, hashSessionToken(token)));
    }

    reply.clearCookie(COOKIE_NAME, { path: "/" });

    return {
      success: true,
      message: "Logged out successfully.",
    };
  });
}
