
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

const requestOtpSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2).max(120).optional(),
});

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the six-digit OTP."),
  fullName: z.string().trim().min(2).max(120).optional(),
});

function hashOtp(phone: string, otp: string): string {
  return createHmac("sha256", env.OTP_PEPPER)
    .update(`${phone}:${otp}`)
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

export async function findAuthenticatedUser(request: FastifyRequest) {
  const token = request.cookies?.[COOKIE_NAME];

  if (!token) return null;

  const tokenHash = hashSessionToken(token);

  const result = await db
    .select({
      id: users.id,
      phone: users.phone,
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
  // REQUEST OTP
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
          message: "Invalid registration details.",
          errors: parsed.error.flatten(),
        });
      }

      if (env.NODE_ENV !== "development") {
        return reply.code(503).send({
          success: false,
          message: "OTP delivery is not configured for production.",
        });
      }

      const { phone, fullName } = parsed.data;
      const now = new Date();

      // Limit OTP requests per phone number.
      const recentRequests = await db
        .select({ total: count() })
        .from(otpChallenges)
        .where(
          and(
            eq(otpChallenges.phone, phone),
            gte(
              otpChallenges.createdAt,
              new Date(Date.now() - 10 * 60 * 1000)
            )
          )
        );

      if (Number(recentRequests[0]?.total ?? 0) >= 3) {
        return reply.code(429).send({
          success: false,
          message: "Too many OTP requests. Try again later.",
        });
      }

      const otp = generateOtp();
      const otpHash = hashOtp(phone, otp);

      await deliverOtp(phone, otp, request.log);

      await db.transaction(async (tx) => {
        // Invalidate older outstanding OTP challenges.
        await tx
          .update(otpChallenges)
          .set({ consumedAt: now })
          .where(
            and(
              eq(otpChallenges.phone, phone),
              isNull(otpChallenges.consumedAt)
            )
          );

        await tx.insert(otpChallenges).values({
          phone,
          fullName: fullName ?? null,
          otpHash,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          failedAttempts: 0,
        });
      });

      return reply.code(200).send({
        success: true,
        message: "OTP request accepted. Check the development server log.",
      });
    }
  );

  // -----------------------------------------
  // VERIFY OTP
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
          message: "Invalid verification details.",
          errors: parsed.error.flatten(),
        });
      }

      const { phone, otp, fullName } = parsed.data;

      const sessionToken = randomBytes(32).toString("base64url");
      const sessionHash = hashSessionToken(sessionToken);

      const now = new Date();

      const expiresAt = new Date(
        Date.now() +
          env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
      );

      const result = await db.transaction(async (tx) => {
        const challenges = await tx
          .select()
          .from(otpChallenges)
          .where(
            and(
              eq(otpChallenges.phone, phone),
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

        const expectedHash = hashOtp(phone, otp);

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
            fullName: users.fullName,
            role: users.role,
            status: users.status,
          })
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1);

        let user = existingUsers[0];

        if (!user) {
          const name = fullName ?? challenge.fullName;

          if (!name) {
            return { kind: "name_required" as const };
          }

          const created = await tx
            .insert(users)
            .values({
              phone,
              fullName: name,
              role: "CUSTOMER",
              status: "ACTIVE",
              phoneVerifiedAt: now,
            })
            .returning({
              id: users.id,
              phone: users.phone,
              fullName: users.fullName,
              role: users.role,
              status: users.status,
            });

          user = created[0];
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
          message: "OTP expired. Request a new OTP.",
        });
      }

      if (result.kind === "locked") {
        return reply.code(429).send({
          success: false,
          message: "Too many incorrect attempts. Request a new OTP.",
        });
      }

      if (result.kind === "name_required") {
        return reply.code(400).send({
          success: false,
          message: "Enter your name to complete registration.",
        });
      }

      if (result.kind === "restricted") {
        return reply.code(403).send({
          success: false,
          message: "This account is inactive and cannot log in.",
        });
      }

      reply.setCookie(
        COOKIE_NAME,
        sessionToken,
        SESSION_COOKIE_OPTIONS
      );

      return reply.code(200).send({
        success: true,
        message: "Login successful.",
        data: result.user,
      });
    }
  );

  // -----------------------------------------
  // CURRENT CUSTOMER
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
        .where(
          eq(userSessions.tokenHash, hashSessionToken(token))
        );
    }

    reply.clearCookie(COOKIE_NAME, {
      path: "/",
    });

    return {
      success: true,
      message: "Logged out successfully.",
    };
  });
}
