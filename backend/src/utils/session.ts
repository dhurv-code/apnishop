import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "../database/index.js";
import { users, userSessions } from "../database/schema.js";
import { env } from "../config/env.js";

const COOKIE_NAME =
  env.NODE_ENV === "production"
    ? "__Host-apnabasket_session"
    : "apnabasket_session";

export async function getSessionUser(request: FastifyRequest) {
  const token = request.cookies?.[COOKIE_NAME];

  if (!token) return null;

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const [user] = await db
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

  return user ?? null;
}