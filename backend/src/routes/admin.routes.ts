
import type { FastifyInstance, FastifyRequest, FastifyReply, } from "fastify";
import {
  and,
  count,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import {
  orders,
  users,
  shops,
  orderItems,
  orderEvents,
  deliveryPartners,
  deliveryAssignments,
} from "../database/schema.js";

import { getSessionUser } from "../utils/session.js";

const uuidSchema = z.string().uuid();

const orderStatusSchema = z.enum([
  "PLACED",
  "CONFIRMED",
  "ASSIGNED",
  "ACCEPTED",
  "SHOPPING",
  "AWAITING_APPROVAL",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
]);

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = await getSessionUser(request);

  if (!user) {
    await reply.code(401).send({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }

  if (user.role !== "ADMIN") {
    await reply.code(403).send({
      success: false,
      message: "Administrator access required.",
    });
    return null;
  }

  return user;
}

export async function adminRoutes(app: FastifyInstance) {

  // ADMIN PROFILE
  app.get("/admin/me", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    return {
      success: true,
      data: admin,
    };
  });

  // DASHBOARD STATISTICS
  app.get("/admin/dashboard", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const [total, placed, inProgress, delivered, cancelled] =
      await Promise.all([
        db.select({ total: count() }).from(orders),

        db.select({ total: count() })
          .from(orders)
          .where(eq(orders.status, "PLACED")),

        db.select({ total: count() })
          .from(orders)
          .where(inArray(orders.status, [
            "CONFIRMED",
            "ASSIGNED",
            "ACCEPTED",
            "SHOPPING",
            "AWAITING_APPROVAL",
            "READY_FOR_DELIVERY",
            "OUT_FOR_DELIVERY",
          ])),

        db.select({ total: count() })
          .from(orders)
          .where(eq(orders.status, "DELIVERED")),

        db.select({ total: count() })
          .from(orders)
          .where(eq(orders.status, "CANCELLED")),
      ]);

    const [shopCount] = await db
      .select({ total: count() })
      .from(shops)
      .where(eq(shops.status, "ACTIVE"));

    const [partnerCount] = await db
      .select({ total: count() })
      .from(deliveryPartners)
      .where(eq(deliveryPartners.status, "ACTIVE"));

    return {
      success: true,
      data: {
        totalOrders: total[0]?.total ?? 0,
        newOrders: placed[0]?.total ?? 0,
        inProgressOrders: inProgress[0]?.total ?? 0,
        deliveredOrders: delivered[0]?.total ?? 0,
        cancelledOrders: cancelled[0]?.total ?? 0,
        activeShops: shopCount.total,
        activeDeliveryPartners: partnerCount.total,
      },
    };
  });

  // ORDER LIST
  app.get<{ Querystring: { status?: string } }>(
    "/admin/orders",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      const parsed = z.object({
        status: orderStatusSchema.optional(),
      }).safeParse(request.query);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid order status filter.",
        });
      }

      const baseQuery = db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          estimatedTotalPaise: orders.estimatedTotalPaise,
          createdAt: orders.createdAt,
          customerName: users.fullName,
          customerPhone: users.phone,
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
          assignedShopId: orders.assignedShopId,
          shopName: shops.name,
        })
        .from(orders)
        .innerJoin(users, eq(orders.customerId, users.id))
        .leftJoin(shops, eq(orders.assignedShopId, shops.id));

      const result = parsed.data.status
        ? await baseQuery
            .where(eq(orders.status, parsed.data.status))
            .orderBy(desc(orders.createdAt))
            .limit(100)
        : await baseQuery
            .orderBy(desc(orders.createdAt))
            .limit(100);

      return {
        success: true,
        data: result,
      };
    }
  );

  // ACTIVE SHOPS
  app.get("/admin/shops", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const result = await db
      .select()
      .from(shops)
      .where(eq(shops.status, "ACTIVE"))
      .orderBy(shops.name);

    return { success: true, data: result };
  });

  // ACTIVE DELIVERY PARTNERS
  app.get("/admin/delivery-partners", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const result = await db
      .select({
        id: deliveryPartners.id,
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        vehicleType: deliveryPartners.vehicleType,
        vehicleNumber: deliveryPartners.vehicleNumber,
        isAvailable: deliveryPartners.isAvailable,
      })
      .from(deliveryPartners)
      .innerJoin(users, eq(deliveryPartners.userId, users.id))
      .where(
        and(
          eq(deliveryPartners.status, "ACTIVE"),
          eq(users.status, "ACTIVE")
        )
      );

    return { success: true, data: result };
  });

  // CONFIRM ORDER
  app.patch<{ Params: { id: string } }>(
    "/admin/orders/:id/confirm",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, request.params.id))
          .for("update")
          .limit(1);

        if (!order) return { kind: "missing" as const };
        if (order.status !== "PLACED") {
          return { kind: "invalid_status" as const };
        }

        const [updated] = await tx
          .update(orders)
          .set({
            status: "CONFIRMED",
            confirmedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
          .returning();

        await tx.insert(orderEvents).values({
          orderId: order.id,
          previousStatus: order.status,
          newStatus: "CONFIRMED",
          eventType: "ORDER_CONFIRMED",
          actorUserId: admin.id,
          actorRole: "ADMIN",
        });

        return { kind: "success" as const, order: updated };
      });

      if (result.kind === "missing") {
        return reply.code(404).send({
          success: false,
          message: "Order not found.",
        });
      }

      if (result.kind === "invalid_status") {
        return reply.code(409).send({
          success: false,
          message: "Only newly placed orders can be confirmed.",
        });
      }

      return { success: true, data: result.order };
    }
  );

  // ASSIGN SHOP
  app.patch<{ Params: { id: string } }>(
    "/admin/orders/:id/shop",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      const parsed = z.object({
        shopId: uuidSchema,
      }).safeParse(request.body);

      if (
        !uuidSchema.safeParse(request.params.id).success ||
        !parsed.success
      ) {
        return reply.code(400).send({
          success: false,
          message: "Invalid order or shop information.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, request.params.id))
          .for("update")
          .limit(1);

        if (!order) return { kind: "missing" as const };

        if (!["CONFIRMED", "ASSIGNED"].includes(order.status)) {
          return { kind: "invalid_status" as const };
        }

        const [shop] = await tx
          .select()
          .from(shops)
          .where(
            and(
              eq(shops.id, parsed.data.shopId),
              eq(shops.status, "ACTIVE")
            )
          )
          .limit(1);

        if (!shop) return { kind: "shop_missing" as const };

        await tx
          .update(orders)
          .set({
            assignedShopId: shop.id,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        await tx.insert(orderEvents).values({
          orderId: order.id,
          previousStatus: order.status,
          newStatus: order.status,
          eventType: "SHOP_ASSIGNED",
          actorUserId: admin.id,
          actorRole: "ADMIN",
          metadata: { shopId: shop.id, shopName: shop.name },
        });

        return { kind: "success" as const, shopName: shop.name };
      });

      if (result.kind === "missing") {
        return reply.code(404).send({
          success: false,
          message: "Order not found.",
        });
      }

      if (result.kind === "shop_missing") {
        return reply.code(404).send({
          success: false,
          message: "Active shop not found.",
        });
      }

      if (result.kind === "invalid_status") {
        return reply.code(409).send({
          success: false,
          message: "Confirm the order before assigning a shop.",
        });
      }

      return {
        success: true,
        message: `Assigned shop: ${result.shopName}`,
      };
    }
  );

  // ASSIGN DELIVERY PARTNER
  app.post<{ Params: { id: string } }>(
    "/admin/orders/:id/assign-delivery",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      const parsed = z.object({
        deliveryPartnerId: uuidSchema,
      }).safeParse(request.body);

      if (
        !uuidSchema.safeParse(request.params.id).success ||
        !parsed.success
      ) {
        return reply.code(400).send({
          success: false,
          message: "Invalid assignment information.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, request.params.id))
          .for("update")
          .limit(1);

        if (!order) return { kind: "missing" as const };

        if (order.status !== "CONFIRMED" || !order.assignedShopId) {
          return { kind: "not_ready" as const };
        }

        const [partner] = await tx
          .select({
            id: deliveryPartners.id,
            userId: deliveryPartners.userId,
            isAvailable: deliveryPartners.isAvailable,
          })
          .from(deliveryPartners)
          .innerJoin(users, eq(deliveryPartners.userId, users.id))
          .where(
            and(
              eq(deliveryPartners.id, parsed.data.deliveryPartnerId),
              eq(deliveryPartners.status, "ACTIVE"),
              eq(deliveryPartners.isAvailable, true),
              eq(users.status, "ACTIVE")
            )
          )
          .limit(1);

        if (!partner) return { kind: "partner_missing" as const };

        const [activeAssignment] = await tx
          .select({ id: deliveryAssignments.id })
          .from(deliveryAssignments)
          .where(
            and(
              eq(deliveryAssignments.orderId, order.id),
              inArray(deliveryAssignments.status, ["ASSIGNED", "ACCEPTED"])
            )
          )
          .limit(1);

        if (activeAssignment) {
          return { kind: "already_assigned" as const };
        }

        await tx.insert(deliveryAssignments).values({
          orderId: order.id,
          deliveryPartnerId: partner.id,
          assignedByUserId: admin.id,
          status: "ASSIGNED",
        });

        await tx
          .update(deliveryPartners)
          .set({
            isAvailable: false,
            updatedAt: new Date(),
          })
          .where(eq(deliveryPartners.id, partner.id));

        await tx
          .update(orders)
          .set({
            status: "ASSIGNED",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        await tx.insert(orderEvents).values({
          orderId: order.id,
          previousStatus: order.status,
          newStatus: "ASSIGNED",
          eventType: "DELIVERY_PARTNER_ASSIGNED",
          actorUserId: admin.id,
          actorRole: "ADMIN",
          metadata: { deliveryPartnerId: partner.id },
        });

        return { kind: "success" as const };
      });

      if (result.kind === "missing") {
        return reply.code(404).send({
          success: false,
          message: "Order not found.",
        });
      }

      if (result.kind === "not_ready") {
        return reply.code(409).send({
          success: false,
          message: "Confirm the order and assign a shop first.",
        });
      }

      if (result.kind === "partner_missing") {
        return reply.code(404).send({
          success: false,
          message: "No active and available delivery partner found.",
        });
      }

      if (result.kind === "already_assigned") {
        return reply.code(409).send({
          success: false,
          message: "This order already has an active assignment.",
        });
      }

      return {
        success: true,
        message: "Delivery partner assigned successfully.",
      };
    }
  );
}
