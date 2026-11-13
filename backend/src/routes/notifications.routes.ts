import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import { notifications } from "../database/schema.js";
import { getSessionUser } from "../utils/session.js";

async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSessionUser(request);

  if (!session) {
    reply.code(401).send({ success: false, message: "Please log in." });
    return null;
  }

  return session;
}

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // List notifications for the currently authenticated user only.
  app.get<{ Querystring: { unreadOnly?: string; limit?: string } }>(
    "/notifications",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;

      const query = z.object({
        unreadOnly: z.enum(["true", "false"]).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
      }).safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid notification query.",
        });
      }

      const limit = Math.min(Math.max(Number(query.data.limit ?? "50"), 1), 100);
      const conditions = [eq(notifications.recipientUserId, session.id)];

      if (query.data.unreadOnly === "true") {
        conditions.push(isNull(notifications.readAt));
      }

      const [items, unreadRows] = await Promise.all([
        db
          .select({
            id: notifications.id,
            type: notifications.type,
            title: notifications.title,
            body: notifications.body,
            actionUrl: notifications.actionUrl,
            relatedOrderId: notifications.relatedOrderId,
            metadata: notifications.metadata,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .where(and(...conditions))
          .orderBy(desc(notifications.createdAt))
          .limit(limit),
        db
          .select({ value: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientUserId, session.id),
              isNull(notifications.readAt)
            )
          ),
      ]);

      return {
        success: true,
        data: {
          items,
          unreadCount: Number(unreadRows[0]?.value ?? 0),
        },
      };
    }
  );

  // Return unread count for badges in navigation/header components.
  app.get("/notifications/unread-count", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const [row] = await db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, session.id),
          isNull(notifications.readAt)
        )
      );

    return {
      success: true,
      data: { unreadCount: Number(row?.value ?? 0) },
    };
  });

  // Mark one notification as read; ownership is enforced in the UPDATE.
  app.patch<{ Params: { id: string } }>(
    "/notifications/:id/read",
    async (request, reply) => {
      const session = await requireSession(request, reply);
      if (!session) return;

      const parsed = z.string().uuid().safeParse(request.params.id);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, message: "Invalid notification ID." });
      }

      const [updated] = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, parsed.data),
            eq(notifications.recipientUserId, session.id),
            isNull(notifications.readAt)
          )
        )
        .returning({ id: notifications.id });

      if (!updated) {
        const [existing] = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.id, parsed.data),
              eq(notifications.recipientUserId, session.id)
            )
          )
          .limit(1);

        if (!existing) {
          return reply.code(404).send({
            success: false,
            message: "Notification not found.",
          });
        }
      }

      return { success: true, message: "Notification marked as read." };
    }
  );

  // Mark all of this user's notifications as read.
  app.patch("/notifications/read-all", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientUserId, session.id),
          isNull(notifications.readAt)
        )
      );

    return { success: true, message: "All notifications marked as read." };
  });
};
