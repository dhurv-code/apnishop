import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "../database/index.js";
import {
  deliveryAssignments,
  deliveryPartners,
  orderEvents,
  orderItems,
  orders,
  substitutions,
} from "../database/schema.js";
import { getSessionUser } from "../utils/session.js";

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
    reply.code(403).send({
      success: false,
      message: "Your delivery partner account is not active.",
    });
    return null;
  }

  return { session, partner };
}

async function addOrderEvent(
  tx: any,
  orderId: string,
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  previousStatus: any = null,
  newStatus: any = null
) {
  await tx.insert(orderEvents).values({
    orderId,
    actorUserId: userId,
    actorRole: "DELIVERY_PARTNER",
    eventType,
    metadata,
    previousStatus,
    newStatus,
  });
}

export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/delivery/me", async (request, reply) => {
    const context = await requirePartner(request, reply);
    if (!context) return;

    return {
      success: true,
      data: {
        id: context.partner.id,
        status: context.partner.status,
        isAvailable: context.partner.isAvailable,
        vehicleType: context.partner.vehicleType,
        vehicleNumber: context.partner.vehicleNumber,
      },
    };
  });

  app.patch("/delivery/availability", async (request, reply) => {
    const context = await requirePartner(request, reply);
    if (!context) return;

    const parsed = z.object({ isAvailable: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, message: "Invalid availability value." });
    }

    if (parsed.data.isAvailable) {
      const [activeAssignment] = await db
        .select({ id: deliveryAssignments.id })
        .from(deliveryAssignments)
        .where(
          and(
            eq(deliveryAssignments.deliveryPartnerId, context.partner.id),
            inArray(deliveryAssignments.status, ["ASSIGNED", "ACCEPTED"])
          )
        )
        .limit(1);

      if (activeAssignment) {
        return reply.code(409).send({
          success: false,
          message: "You have an active assignment. Complete or reject it before changing availability to available.",
        });
      }
    }

    const [updated] = await db
      .update(deliveryPartners)
      .set({ isAvailable: parsed.data.isAvailable, updatedAt: new Date() })
      .where(eq(deliveryPartners.id, context.partner.id))
      .returning();

    return { success: true, data: updated };
  });

  app.get("/delivery/orders", async (request, reply) => {
    const context = await requirePartner(request, reply);
    if (!context) return;

    const rows = await db
      .select({
        assignmentId: deliveryAssignments.id,
        assignmentStatus: deliveryAssignments.status,
        assignedAt: deliveryAssignments.assignedAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        createdAt: orders.createdAt,
        recipientName: orders.recipientName,
        recipientPhone: orders.recipientPhone,
        addressLine1: orders.addressLine1,
        addressLine2: orders.addressLine2,
        locality: orders.locality,
        landmark: orders.landmark,
        city: orders.city,
        district: orders.district,
        state: orders.state,
        postalCode: orders.postalCode,
        deliveryInstructions: orders.deliveryInstructions,
        estimatedTotalPaise: orders.estimatedTotalPaise,
        finalTotalPaise: orders.finalTotalPaise,
      })
      .from(deliveryAssignments)
      .innerJoin(orders, eq(orders.id, deliveryAssignments.orderId))
      .where(eq(deliveryAssignments.deliveryPartnerId, context.partner.id))
      .orderBy(desc(deliveryAssignments.assignedAt))
      .limit(50);

    const orderIds = rows.map((row) => row.orderId);
    const items = orderIds.length
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : [];

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    return {
      success: true,
      data: rows.map((row) => ({ ...row, items: itemsByOrder.get(row.orderId) ?? [] })),
    };
  });

  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/accept",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      try {
        await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id)
              )
            )
            .for("update")
            .limit(1);

          if (!assignment || assignment.status !== "ASSIGNED") {
            throw new Error("This assignment is no longer available.");
          }

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!order || order.status !== "ASSIGNED") {
            throw new Error("This order cannot be accepted in its current state.");
          }

          await tx
            .update(deliveryAssignments)
            .set({ status: "ACCEPTED", acceptedAt: new Date() })
            .where(eq(deliveryAssignments.id, assignment.id));

          await tx
            .update(orders)
            .set({ status: "ACCEPTED", updatedAt: new Date() })
            .where(eq(orders.id, order.id));

          await tx
            .update(deliveryPartners)
            .set({ isAvailable: false, updatedAt: new Date() })
            .where(eq(deliveryPartners.id, context.partner.id));

          await addOrderEvent(
            tx,
            order.id,
            context.session.id,
            "DELIVERY_ACCEPTED",
            { assignmentId: assignment.id },
            "ASSIGNED",
            "ACCEPTED"
          );
        });

        return { success: true, message: "Order accepted." };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to accept order.",
        });
      }
    }
  );

  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/reject",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const parsed = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ success: false, message: "Invalid rejection reason." });
      }

      try {
        await db.transaction(async (tx) => {
          const [assignment] = await tx
            .select()
            .from(deliveryAssignments)
            .where(
              and(
                eq(deliveryAssignments.orderId, request.params.orderId),
                eq(deliveryAssignments.deliveryPartnerId, context.partner.id)
              )
            )
            .for("update")
            .limit(1);

          if (!assignment || assignment.status !== "ASSIGNED") {
            throw new Error("This assignment can no longer be rejected.");
          }

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!order || order.status !== "ASSIGNED") {
            throw new Error("This order is no longer awaiting partner acceptance.");
          }

          await tx
            .update(deliveryAssignments)
            .set({
              status: "REJECTED",
              rejectionReason: parsed.data.reason ?? null,
              endedAt: new Date(),
            })
            .where(eq(deliveryAssignments.id, assignment.id));

          await tx
            .update(orders)
            .set({ status: "CONFIRMED", updatedAt: new Date() })
            .where(eq(orders.id, order.id));

          await tx
            .update(deliveryPartners)
            .set({ isAvailable: true, updatedAt: new Date() })
            .where(eq(deliveryPartners.id, context.partner.id));

          await addOrderEvent(
            tx,
            order.id,
            context.session.id,
            "DELIVERY_REJECTED",
            { assignmentId: assignment.id, reason: parsed.data.reason ?? null },
            "ASSIGNED",
            "CONFIRMED"
          );
        });

        return { success: true, message: "Assignment rejected." };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to reject assignment.",
        });
      }
    }
  );

  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/start-shopping",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

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
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "ACCEPTED") {
            throw new Error("Accept this order before starting shopping.");
          }

          await tx
            .update(orders)
            .set({ status: "SHOPPING", updatedAt: new Date() })
            .where(eq(orders.id, order.id));

          await addOrderEvent(
            tx,
            order.id,
            context.session.id,
            "SHOPPING_STARTED",
            { assignmentId: assignment.id },
            "ACCEPTED",
            "SHOPPING"
          );
        });

        return { success: true, message: "Shopping started." };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to start shopping.",
        });
      }
    }
  );

  app.patch<{ Params: { orderId: string; itemId: string } }>(
    "/delivery/orders/:orderId/items/:itemId",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      const parsed = z.discriminatedUnion("status", [
        z.object({
          status: z.literal("PURCHASED"),
          quantity: z.number().positive().max(999999),
          unitPricePaise: z.number().int().min(0).max(100000000),
        }),
        z.object({ status: z.literal("UNAVAILABLE") }),
      ]).safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Provide a valid purchase quantity and unit price, or mark the item unavailable.",
        });
      }

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
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "SHOPPING") {
            throw new Error("You must have an accepted order in shopping status.");
          }

          const [item] = await tx
            .select()
            .from(orderItems)
            .where(
              and(
                eq(orderItems.id, request.params.itemId),
                eq(orderItems.orderId, request.params.orderId)
              )
            )
            .for("update")
            .limit(1);

          if (!item) throw new Error("Order item not found.");

          if (parsed.data.status === "PURCHASED") {
            const isApprovedReplacement = item.status === "REPLACEMENT_APPROVED";
            if (item.status !== "PENDING" && !isApprovedReplacement) {
              throw new Error("This item is not ready to be purchased.");
            }

            let fulfilledProductId = item.productId;
            let fulfilledName = item.productNameSnapshot;
            let fulfilledUnit = item.unitLabelSnapshot;

            if (isApprovedReplacement) {
              const [replacement] = await tx
                .select()
                .from(substitutions)
                .where(
                  and(
                    eq(substitutions.orderItemId, item.id),
                    eq(substitutions.status, "APPROVED")
                  )
                )
                .orderBy(desc(substitutions.createdAt))
                .limit(1);

              if (!replacement) {
                throw new Error("Approved replacement details were not found.");
              }

              if (parsed.data.quantity > replacement.replacementQuantity) {
                throw new Error("Purchased quantity cannot exceed the customer-approved quantity.");
              }

              if (parsed.data.unitPricePaise > replacement.replacementUnitPricePaise) {
                throw new Error("Actual unit price exceeds the customer-approved price. Request approval for the higher price first.");
              }

              fulfilledProductId = replacement.replacementProductId;
              fulfilledName = replacement.replacementNameSnapshot;
              fulfilledUnit = replacement.replacementUnitLabel;
            }

            const quantityMilli = Math.round(parsed.data.quantity * 1000);
            const lineTotalPaise = Math.round(
              (parsed.data.unitPricePaise * quantityMilli) / 1000
            );

            await tx
              .update(orderItems)
              .set({
                status: "PURCHASED",
                fulfilledProductId,
                fulfilledProductNameSnapshot: fulfilledName,
                fulfilledUnitLabelSnapshot: fulfilledUnit,
                actualUnitPricePaise: parsed.data.unitPricePaise,
                purchasedQuantity: quantityMilli / 1000,
                actualLineTotalPaise: lineTotalPaise,
                updatedAt: new Date(),
              })
              .where(eq(orderItems.id, item.id));

            await addOrderEvent(tx, order.id, context.session.id, "ITEM_PURCHASED", {
              itemId: item.id,
              purchasedName: fulfilledName,
              quantity: quantityMilli / 1000,
              unitPricePaise: parsed.data.unitPricePaise,
              lineTotalPaise,
            });
          } else {
            if (item.status !== "PENDING" && item.status !== "REPLACEMENT_APPROVED") {
              throw new Error("This item cannot be marked unavailable in its current state.");
            }

            if (item.status === "REPLACEMENT_APPROVED") {
              // The approved alternative could not be purchased. Retire that approval
              // before allowing the partner to suggest another alternative.
              await tx
                .update(substitutions)
                .set({ status: "CANCELLED" })
                .where(
                  and(
                    eq(substitutions.orderItemId, item.id),
                    eq(substitutions.status, "APPROVED")
                  )
                );
            }

            await tx
              .update(orderItems)
              .set({
                status: "UNAVAILABLE",
                fulfilledProductId: null,
                fulfilledProductNameSnapshot: null,
                fulfilledUnitLabelSnapshot: null,
                actualUnitPricePaise: null,
                purchasedQuantity: 0,
                actualLineTotalPaise: 0,
                updatedAt: new Date(),
              })
              .where(eq(orderItems.id, item.id));

            await addOrderEvent(tx, order.id, context.session.id, "ITEM_UNAVAILABLE", {
              itemId: item.id,
            });
          }
        });

        return { success: true, message: "Item updated." };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to update item.",
        });
      }
    }
  );

  app.post<{ Params: { orderId: string } }>(
    "/delivery/orders/:orderId/finish-shopping",
    async (request, reply) => {
      const context = await requirePartner(request, reply);
      if (!context) return;

      try {
        const result = await db.transaction(async (tx) => {
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
            .limit(1);

          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, request.params.orderId))
            .for("update")
            .limit(1);

          if (!assignment || !order || order.status !== "SHOPPING") {
            throw new Error("This order is not currently ready to finish shopping.");
          }

          const items = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id))
            .for("update");

          if (
            items.length === 0 ||
            items.some((item) => !["PURCHASED", "UNAVAILABLE", "REMOVED"].includes(item.status))
          ) {
            throw new Error("Process every item and resolve all customer approvals before finishing shopping.");
          }

          const actualSubtotalPaise = items.reduce(
            (sum, item) => sum + item.actualLineTotalPaise,
            0
          );
          const finalTotalPaise =
            actualSubtotalPaise +
            order.deliveryFeePaise +
            order.platformFeePaise +
            order.otherChargesPaise;

          await tx
            .update(orders)
            .set({
              itemSubtotalActualPaise: actualSubtotalPaise,
              finalTotalPaise,
              priceFinalizedAt: new Date(),
              status: "READY_FOR_DELIVERY",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await addOrderEvent(
            tx,
            order.id,
            context.session.id,
            "SHOPPING_COMPLETED",
            { actualSubtotalPaise, finalTotalPaise },
            "SHOPPING",
            "READY_FOR_DELIVERY"
          );

          return { actualSubtotalPaise, finalTotalPaise };
        });

        return {
          success: true,
          message: "Shopping completed. Actual bill calculated.",
          data: result,
        };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to finish shopping.",
        });
      }
    }
  );
};
