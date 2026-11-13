import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../database/index.js";
import {
  deliveryAssignments,
  deliveryPartners,
  orderEvents,
  orderItems,
  orders,
  products,
  substitutions,
} from "../database/schema.js";
import { getSessionUser } from "../utils/session.js";

async function getActor(request: any, reply: any, requiredRole: "CUSTOMER" | "DELIVERY_PARTNER") {
  const session = await getSessionUser(request);

  if (!session) {
    reply.code(401).send({ success: false, message: "Please log in." });
    return null;
  }

  if (session.role !== requiredRole) {
    reply.code(403).send({ success: false, message: "Access denied." });
    return null;
  }

  return session;
}

async function addOrderEvent(
  tx: any,
  orderId: string,
  actorUserId: string,
  actorRole: "CUSTOMER" | "DELIVERY_PARTNER",
  eventType: string,
  metadata: Record<string, unknown>,
  previousStatus: any,
  newStatus: any
) {
  await tx.insert(orderEvents).values({
    orderId,
    actorUserId,
    actorRole,
    eventType,
    metadata,
    previousStatus,
    newStatus,
  });
}

export const substitutionRoutes: FastifyPluginAsync = async (app) => {
  // Delivery partner proposes a replacement. The customer must approve it
  // before the partner is allowed to record it as purchased.
  app.post<{
    Params: { orderId: string; itemId: string };
  }>(
    "/delivery/orders/:orderId/items/:itemId/substitutions",
    async (request, reply) => {
      const actor = await getActor(request, reply, "DELIVERY_PARTNER");
      if (!actor) return;

      const parsed = z.object({
        replacementProductId: z.string().uuid().nullable().optional(),
        replacementName: z.string().trim().min(2).max(150),
        replacementUnitLabel: z.string().trim().min(1).max(50),
        replacementUnitPricePaise: z.number().int().min(0).max(100000000),
        replacementQuantity: z.number().positive().max(999999),
        reason: z.string().trim().max(500).optional(),
      }).safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Enter a valid replacement name, unit, quantity and price.",
          errors: parsed.error.flatten(),
        });
      }

      const [partner] = await db
        .select()
        .from(deliveryPartners)
        .where(eq(deliveryPartners.userId, actor.id))
        .limit(1);

      if (!partner || partner.status !== "ACTIVE") {
        return reply.code(403).send({
          success: false,
          message: "Your delivery partner account is not active.",
        });
      }

      try {
        const created = await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, partner.id),
                eq(deliveryAssignments.status, "ACCEPTED")
              )
            )
            .limit(1);

          if (!assignment) {
            throw new Error("You are not assigned to this order.");
          }

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!order || !["SHOPPING", "AWAITING_APPROVAL"].includes(order.status)) {
            throw new Error("This order is not currently in the shopping workflow.");
          }

          const [item] = await tx
            .select()
            .from(orderItems)
            .where(
              and(
                eq(orderItems.id, request.params.itemId),
                eq(orderItems.orderId, order.id)
              )
            )
            .for("update")
            .limit(1);

          if (!item) throw new Error("Order item not found.");
          if (item.status !== "PENDING" && item.status !== "UNAVAILABLE") {
            throw new Error("Only pending or unavailable items can receive a replacement proposal.");
          }

          if (parsed.data.replacementProductId) {
            const [product] = await tx
              .select({ id: products.id })
              .from(products)
              .where(
                and(
                  eq(products.id, parsed.data.replacementProductId),
                  eq(products.status, "ACTIVE")
                )
              )
              .limit(1);

            if (!product) {
              throw new Error("The selected catalogue product is not active.");
            }
          }

          const [pending] = await tx
            .select({ id: substitutions.id })
            .from(substitutions)
            .where(
              and(
                eq(substitutions.orderItemId, item.id),
                eq(substitutions.status, "PENDING")
              )
            )
            .limit(1);

          if (pending) {
            throw new Error("A replacement request is already awaiting customer approval.");
          }

          const [replacement] = await tx
            .insert(substitutions)
            .values({
              orderItemId: item.id,
              requestedByPartnerId: partner.id,
              replacementProductId: parsed.data.replacementProductId ?? null,
              replacementNameSnapshot: parsed.data.replacementName,
              replacementUnitLabel: parsed.data.replacementUnitLabel,
              replacementUnitPricePaise: parsed.data.replacementUnitPricePaise,
              replacementQuantity: parsed.data.replacementQuantity,
              status: "PENDING",
              reason: parsed.data.reason || null,
              expiresAt: null,
            })
            .returning();

          await tx
            .update(orderItems)
            .set({ status: "REPLACEMENT_REQUESTED", updatedAt: new Date() })
            .where(eq(orderItems.id, item.id));

          if (order.status !== "AWAITING_APPROVAL") {
            await tx
              .update(orders)
              .set({ status: "AWAITING_APPROVAL", updatedAt: new Date() })
              .where(eq(orders.id, order.id));
          }

          await addOrderEvent(
            tx,
            order.id,
            actor.id,
            "DELIVERY_PARTNER",
            "SUBSTITUTION_REQUESTED",
            {
              substitutionId: replacement.id,
              itemId: item.id,
              replacementName: replacement.replacementNameSnapshot,
              replacementUnitLabel: replacement.replacementUnitLabel,
              proposedUnitPricePaise: replacement.replacementUnitPricePaise,
              proposedQuantity: replacement.replacementQuantity,
            },
            order.status,
            "AWAITING_APPROVAL"
          );

          return replacement;
        });

        return reply.code(201).send({
          success: true,
          message: "Replacement sent to the customer for approval.",
          data: created,
        });
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to create replacement request.",
        });
      }
    }
  );

  // Customer sees their own pending requests only.
  app.get("/customer/substitutions", async (request, reply) => {
    const actor = await getActor(request, reply, "CUSTOMER");
    if (!actor) return;

    const rows = await db
      .select({
        substitutionId: substitutions.id,
        status: substitutions.status,
        replacementName: substitutions.replacementNameSnapshot,
        replacementUnitLabel: substitutions.replacementUnitLabel,
        replacementUnitPricePaise: substitutions.replacementUnitPricePaise,
        replacementQuantity: substitutions.replacementQuantity,
        reason: substitutions.reason,
        createdAt: substitutions.createdAt,
        itemId: orderItems.id,
        originalProductName: orderItems.productNameSnapshot,
        originalUnitLabel: orderItems.unitLabelSnapshot,
        requestedQuantity: orderItems.requestedQuantity,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(substitutions)
      .innerJoin(orderItems, eq(orderItems.id, substitutions.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.customerId, actor.id),
          eq(substitutions.status, "PENDING")
        )
      )
      .orderBy(desc(substitutions.createdAt));

    return { success: true, data: rows };
  });

  // Customer approves or rejects the proposed replacement.
  app.post<{
    Params: { orderId: string; substitutionId: string };
  }>(
    "/customer/orders/:orderId/substitutions/:substitutionId/respond",
    async (request, reply) => {
      const actor = await getActor(request, reply, "CUSTOMER");
      if (!actor) return;

      const parsed = z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Decision must be APPROVE or REJECT.",
        });
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [replacement] = await tx
            .select()
            .from(substitutions)
            .where(eq(substitutions.id, request.params.substitutionId))
            .for("update")
            .limit(1);

          if (!replacement || replacement.status !== "PENDING") {
            throw new Error("This replacement request is no longer pending.");
          }

          const [item] = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.id, replacement.orderItemId))
            .for("update")
            .limit(1);

          if (!item || item.orderId !== request.params.orderId) {
            throw new Error("This replacement does not belong to the selected order.");
          }

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, item.orderId))
            .for("update")
            .limit(1);

          if (!order || order.customerId !== actor.id) {
            throw new Error("You cannot respond to another customer's order.");
          }
          if (order.status !== "AWAITING_APPROVAL") {
            throw new Error("This order is not awaiting replacement approval.");
          }

          const approved = parsed.data.decision === "APPROVE";
          const now = new Date();

          await tx
            .update(substitutions)
            .set({
              status: approved ? "APPROVED" : "REJECTED",
              customerRespondedAt: now,
            })
            .where(eq(substitutions.id, replacement.id));

          if (approved) {
            // Approval authorizes purchase up to the proposed quantity and unit price.
            // Actual purchased quantity and price are recorded separately by the partner.
            await tx
              .update(orderItems)
              .set({ status: "REPLACEMENT_APPROVED", updatedAt: now })
              .where(eq(orderItems.id, item.id));
          } else {
            await tx
              .update(orderItems)
              .set({
                status: "REMOVED",
                fulfilledProductId: null,
                fulfilledProductNameSnapshot: null,
                fulfilledUnitLabelSnapshot: null,
                actualUnitPricePaise: null,
                purchasedQuantity: 0,
                actualLineTotalPaise: 0,
                updatedAt: now,
              })
              .where(eq(orderItems.id, item.id));
          }

          const [remainingPending] = await tx
            .select({ id: substitutions.id })
            .from(substitutions)
            .innerJoin(orderItems, eq(orderItems.id, substitutions.orderItemId))
            .where(
              and(
                eq(orderItems.orderId, order.id),
                eq(substitutions.status, "PENDING")
              )
            )
            .limit(1);

          const nextStatus = remainingPending ? "AWAITING_APPROVAL" : "SHOPPING";
          await tx
            .update(orders)
            .set({ status: nextStatus, updatedAt: now })
            .where(eq(orders.id, order.id));

          await addOrderEvent(
            tx,
            order.id,
            actor.id,
            "CUSTOMER",
            approved ? "SUBSTITUTION_APPROVED" : "SUBSTITUTION_REJECTED",
            { substitutionId: replacement.id, itemId: item.id },
            "AWAITING_APPROVAL",
            nextStatus
          );

          return {
            decision: parsed.data.decision,
            nextOrderStatus: nextStatus,
          };
        });

        return {
          success: true,
          message:
            result.decision === "APPROVE"
              ? "Replacement approved. The partner can purchase it after all pending approvals are resolved."
              : "Replacement rejected. The item has been removed from your bill.",
          data: result,
        };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to submit your decision.",
        });
      }
    }
  );
};
