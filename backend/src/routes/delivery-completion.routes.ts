import type { FastifyPluginAsync } from "fastify";
import {
  and,
  desc,
  eq,
  isNull,
} from "drizzle-orm";
import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

import { db } from "../database/index.js";
import {
  deliveryAssignments,
  deliveryOtps,
  deliveryPartners,
  orderEvents,
  orders,
} from "../database/schema.js";
import { env } from "../config/env.js";
import { getSessionUser } from "../utils/session.js";
import { deliverOtp, generateOtp } from "../services/otp.service.js";

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function hashDeliveryOtp(orderId: string, phone: string, otp: string): string {
  return createHmac("sha256", env.OTP_PEPPER)
    .update(`${orderId}:${phone}:${otp}`)
    .digest("hex");
}

function safeEqualHex(firstHex: string, secondHex: string): boolean {
  const first = Buffer.from(firstHex, "hex");
  const second = Buffer.from(secondHex, "hex");
  return first.length === second.length && first.length > 0 && timingSafeEqual(first, second);
}

async function requirePartner(request: any, reply: any) {
  const session = await getSessionUser(request);

  if (!session) {
    reply.code(401).send({ success: false, message: "Please log in." });
    return null;
  }

  if (session.role !== "DELIVERY_PARTNER") {
    reply.code(403).send({ success: false, message: "Delivery partner access required." });
    return null;
  }

  const [partner] = await db
    .select()
    .from(deliveryPartners)
    .where(eq(deliveryPartners.userId, session.id))
    .limit(1);

  if (!partner || partner.status !== "ACTIVE") {
    reply.code(403).send({ success: false, message: "Your delivery partner account is not active." });
    return null;
  }

  return { session, partner };
}

async function addEvent(
  tx: any,
  orderId: string,
  actorUserId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  previousStatus: any = null,
  newStatus: any = null
) {
  await tx.insert(orderEvents).values({
    orderId,
    actorUserId,
    actorRole: "DELIVERY_PARTNER",
    eventType,
    metadata,
    previousStatus,
    newStatus,
  });
}

export const deliveryCompletionRoutes: FastifyPluginAsync = async (app) => {
  // Return completion/payment state only for this partner's own assignment.
  app.get<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/completion",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const [row] = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          finalTotalPaise: orders.finalTotalPaise,
          recipientPhone: orders.recipientPhone,
        })
        .from(deliveryAssignments)
        .innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
        .where(
          and(
            eq(deliveryAssignments.orderId, request.params.orderId),
            eq(deliveryAssignments.deliveryPartnerId, context.partner.id)
          )
        )
        .orderBy(desc(deliveryAssignments.assignedAt))
        .limit(1);

      if (!row) {
        return reply.code(404).send({ success: false, message: "Order assignment not found." });
      }

      return { success: true, data: row };
    }
  );

  // Start delivery and issue a customer OTP. The OTP is never returned to the partner.
  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/start-delivery",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const otp = generateOtp();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
      let recipientPhone: string | null = null;

      try {
        await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id),
                eq(deliveryAssignments.status, "ACCEPTED")
              )
            )
            .for("update")
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "READY_FOR_DELIVERY") {
            throw new Error("Only your accepted, ready-for-delivery order can be dispatched.");
          }

          recipientPhone = order.recipientPhone;
          const boundHash = hashDeliveryOtp(order.id, order.recipientPhone, otp);

          await tx
            .update(deliveryOtps)
            .set({ invalidatedAt: now })
            .where(
              and(
                eq(deliveryOtps.orderId, order.id),
                isNull(deliveryOtps.consumedAt),
                isNull(deliveryOtps.invalidatedAt)
              )
            );

          await tx.insert(deliveryOtps).values({
            orderId: order.id,
            otpHash: boundHash,
            failedAttempts: 0,
            maxAttempts: OTP_MAX_ATTEMPTS,
            expiresAt,
          });

          await tx
            .update(orders)
            .set({ status: "OUT_FOR_DELIVERY", updatedAt: now })
            .where(eq(orders.id, order.id));

          await addEvent(
            tx,
            order.id,
            context.session.id,
            "DELIVERY_STARTED",
            { expiresAt: expiresAt.toISOString() },
            "READY_FOR_DELIVERY",
            "OUT_FOR_DELIVERY"
          );
        });
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to start delivery.",
        });
      }

      try {
        await deliverOtp(recipientPhone!, otp, request.log);
      } catch (error) {
        const failedAt = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(deliveryOtps)
            .set({ invalidatedAt: failedAt })
            .where(
              and(
                eq(deliveryOtps.orderId, request.params.orderId),
                isNull(deliveryOtps.consumedAt),
                isNull(deliveryOtps.invalidatedAt)
              )
            );

          await tx
            .update(orders)
            .set({ status: "READY_FOR_DELIVERY", updatedAt: failedAt })
            .where(
              and(
                eq(orders.id, request.params.orderId),
                eq(orders.status, "OUT_FOR_DELIVERY")
              )
            );

          await addEvent(
            tx,
            request.params.orderId,
            context.session.id,
            "DELIVERY_OTP_SEND_FAILED",
            {},
            "OUT_FOR_DELIVERY",
            "READY_FOR_DELIVERY"
          );
        });

        request.log.error({ err: error }, "Delivery OTP could not be sent");
        return reply.code(503).send({
          success: false,
          message: "Delivery OTP could not be sent. Configure the SMS provider and try again.",
        });
      }

      return {
        success: true,
        message: "Order is out for delivery. The customer OTP has been sent.",
        data: { expiresInMinutes: OTP_TTL_MINUTES },
      };
    }
  );

  // Resend an OTP after a cooldown. A newly issued code invalidates the older code.
  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/resend-delivery-otp",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const otp = generateOtp();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
      let recipientPhone = "";

      try {
        await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id),
                eq(deliveryAssignments.status, "ACCEPTED")
              )
            )
            .for("update")
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "OUT_FOR_DELIVERY") {
            throw new Error("This order is not currently out for delivery.");
          }

          const [latestOtp] = await tx
            .select()
            .from(deliveryOtps)
            .where(eq(deliveryOtps.orderId, order.id))
            .orderBy(desc(deliveryOtps.createdAt))
            .limit(1);

          if (
            latestOtp &&
            now.getTime() - latestOtp.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000
          ) {
            throw new Error("Please wait before requesting another OTP.");
          }

          recipientPhone = order.recipientPhone;
          await tx
            .update(deliveryOtps)
            .set({ invalidatedAt: now })
            .where(
              and(
                eq(deliveryOtps.orderId, order.id),
                isNull(deliveryOtps.consumedAt),
                isNull(deliveryOtps.invalidatedAt)
              )
            );

          await tx.insert(deliveryOtps).values({
            orderId: order.id,
            otpHash: hashDeliveryOtp(order.id, order.recipientPhone, otp),
            failedAttempts: 0,
            maxAttempts: OTP_MAX_ATTEMPTS,
            expiresAt,
          });

          await addEvent(
            tx,
            order.id,
            context.session.id,
            "DELIVERY_OTP_RESENT",
            { expiresAt: expiresAt.toISOString() }
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to resend OTP.";
        return reply.code(message.includes("wait") ? 429 : 409).send({ success: false, message });
      }

      try {
        await deliverOtp(recipientPhone, otp, request.log);
      } catch (error) {
        await db.update(deliveryOtps)
          .set({ invalidatedAt: new Date() })
          .where(and(
            eq(deliveryOtps.orderId, request.params.orderId),
            isNull(deliveryOtps.consumedAt),
            isNull(deliveryOtps.invalidatedAt)
          ));
        request.log.error({ err: error }, "Delivery OTP resend failed");
        return reply.code(503).send({ success: false, message: "SMS provider is not available." });
      }

      return { success: true, message: "A new delivery OTP has been sent to the customer." };
    }
  );

  // Verify the customer's OTP, mark delivered, and release the partner.
  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/verify-delivery-otp",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const parsed = z.object({ otp: z.string().regex(/^\d{6}$/) }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, message: "Enter the six-digit customer OTP." });
      }

      try {
        const outcome = await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id),
                eq(deliveryAssignments.status, "ACCEPTED")
              )
            )
            .for("update")
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "OUT_FOR_DELIVERY") {
            throw new Error("This order is not awaiting delivery verification.");
          }

          const [otpRecord] = await tx
            .select()
            .from(deliveryOtps)
            .where(
              and(
                eq(deliveryOtps.orderId, order.id),
                isNull(deliveryOtps.consumedAt),
                isNull(deliveryOtps.invalidatedAt)
              )
            )
            .orderBy(desc(deliveryOtps.createdAt))
            .for("update")
            .limit(1);

          if (!otpRecord) return { ok: false as const, message: "No active OTP exists. Request a new one." };
          if (otpRecord.failedAttempts >= otpRecord.maxAttempts) {
            return { ok: false as const, message: "OTP attempts exceeded. Request a new OTP." };
          }

          const checkedAt = new Date();
          if (otpRecord.expiresAt <= checkedAt) {
            await tx.update(deliveryOtps)
              .set({ invalidatedAt: checkedAt })
              .where(eq(deliveryOtps.id, otpRecord.id));
            return { ok: false as const, message: "OTP expired. Request a new OTP." };
          }

          const expectedHash = hashDeliveryOtp(order.id, order.recipientPhone, parsed.data.otp);
          if (!safeEqualHex(otpRecord.otpHash, expectedHash)) {
            const nextAttempts = otpRecord.failedAttempts + 1;
            await tx.update(deliveryOtps)
              .set({
                failedAttempts: nextAttempts,
                invalidatedAt: nextAttempts >= otpRecord.maxAttempts ? checkedAt : null,
              })
              .where(eq(deliveryOtps.id, otpRecord.id));
            return {
              ok: false as const,
              message: nextAttempts >= otpRecord.maxAttempts
                ? "Too many incorrect attempts. Request a new OTP."
                : `Incorrect OTP. ${otpRecord.maxAttempts - nextAttempts} attempts remaining.`,
            };
          }

          await tx.update(deliveryOtps)
            .set({ verifiedAt: checkedAt, consumedAt: checkedAt })
            .where(eq(deliveryOtps.id, otpRecord.id));

          await tx.update(orders)
            .set({ status: "DELIVERED", deliveredAt: checkedAt, updatedAt: checkedAt })
            .where(eq(orders.id, order.id));

          await tx.update(deliveryAssignments)
            .set({ status: "COMPLETED", endedAt: checkedAt })
            .where(eq(deliveryAssignments.id, assignment.id));

          await tx.update(deliveryPartners)
            .set({
              isAvailable: !(order.paymentMethod === "COD" && order.paymentStatus === "COD_PENDING"),
              updatedAt: checkedAt,
            })
            .where(eq(deliveryPartners.id, context.partner.id));

          await addEvent(
            tx,
            order.id,
            context.session.id,
            "ORDER_DELIVERED",
            { deliveryOtpVerifiedAt: checkedAt.toISOString() },
            "OUT_FOR_DELIVERY",
            "DELIVERED"
          );

          return { ok: true as const, message: "Delivery verified successfully." };
        });

        if (!outcome.ok) {
          return reply.code(400).send({ success: false, message: outcome.message });
        }

        return {
          success: true,
          message: "Order marked delivered. Record COD collection separately if applicable.",
        };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to verify delivery OTP.",
        });
      }
    }
  );

  // COD collection is a separate, audited action after delivery verification.
  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/collect-cod",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const parsed = z.object({ collectedAmountPaise: z.number().int().nonnegative() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, message: "Enter the collected amount in paise." });
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id),
                eq(deliveryAssignments.status, "COMPLETED")
              )
            )
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "DELIVERED") {
            throw new Error("Delivery must be verified before collecting COD.");
          }

          if (order.paymentMethod !== "COD" || order.paymentStatus !== "COD_PENDING") {
            throw new Error("This order does not have an outstanding COD payment.");
          }

          if (parsed.data.collectedAmountPaise !== order.finalTotalPaise) {
            throw new Error("Collected amount must exactly match the final order total.");
          }

          await tx.update(orders)
            .set({ paymentStatus: "COD_COLLECTED", updatedAt: new Date() })
            .where(eq(orders.id, order.id));

          await tx.update(deliveryPartners)
            .set({ isAvailable: true, updatedAt: new Date() })
            .where(eq(deliveryPartners.id, context.partner.id));

          await addEvent(
            tx,
            order.id,
            context.session.id,
            "COD_COLLECTED",
            { collectedAmountPaise: parsed.data.collectedAmountPaise },
            null,
            null
          );

          return { collectedAmountPaise: parsed.data.collectedAmountPaise };
        });

        return { success: true, message: "COD collection recorded.", data: result };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to record COD collection.",
        });
      }
    }
  );
};
