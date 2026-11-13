
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import {
  addresses,
  carts,
  cartItems,
  products,
  orders,
  orderItems,
  orderEvents,
} from "../database/schema.js";

import { findAuthenticatedUser } from "./auth.routes.js";

const checkoutSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.literal("COD"),
  customerNotes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(16).max(128),
});

const orderIdSchema = z.string().uuid();

function generateOrderNumber() {
  return `AB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

export async function orderRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // CREATE COD ORDER
  // POST /api/v1/orders
  // ------------------------------------------

  app.post("/orders", async (request, reply) => {
    const customer = await findAuthenticatedUser(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }


    if (customer.role !== "CUSTOMER") {


      return reply.code(403).send({


        success: false,


        message: "Customer access required.",


      });


    }

    const parsed = checkoutSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid checkout information.",
        errors: parsed.error.flatten(),
      });
    }

    const {
      addressId,
      paymentMethod,
      customerNotes,
      idempotencyKey,
    } = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        // Idempotency: don't create duplicate orders on retries.
        const [existingOrder] = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.customerId, customer.id),
              eq(orders.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);

        if (existingOrder) {
          return {
            kind: "existing" as const,
            order: existingOrder,
          };
        }

        // Address must belong to the logged-in customer.
        const [address] = await tx
          .select()
          .from(addresses)
          .where(
            and(
              eq(addresses.id, addressId),
              eq(addresses.userId, customer.id)
            )
          )
          .limit(1);

        if (!address) {
          return { kind: "address_not_found" as const };
        }

        // Find customer's persistent cart.
        const [cart] = await tx
          .select()
          .from(carts)
          .where(eq(carts.userId, customer.id))
          .limit(1);

        if (!cart) {
          return { kind: "empty_cart" as const };
        }

        // Always read current server-side product prices.
        const items = await tx
          .select({
            productId: products.id,
            name: products.name,
            brand: products.brand,
            unitLabel: products.unitLabel,
            estimatedPricePaise: products.estimatedPricePaise,
            productStatus: products.status,
            quantity: cartItems.quantity,
          })
          .from(cartItems)
          .innerJoin(
            products,
            eq(cartItems.productId, products.id)
          )
          .where(eq(cartItems.cartId, cart.id));

        if (items.length === 0) {
          return { kind: "empty_cart" as const };
        }

        const invalidItems = items.filter(
          (item) =>
            item.productStatus !== "ACTIVE" ||
            item.estimatedPricePaise === null
        );

        if (invalidItems.length > 0) {
          return {
            kind: "invalid_products" as const,
            names: invalidItems.map((item) => item.name),
          };
        }

        // Calculate estimated subtotal in integer paise.
        const estimatedSubtotalPaise = items.reduce(
          (total, item) =>
            total +
            Math.round(
              item.estimatedPricePaise! * item.quantity
            ),
          0
        );

        // Provisional development pricing.
        // Configure actual fees before the public launch.
        const deliveryFeePaise = 0;
        const platformFeePaise = 0;
        const otherChargesPaise = 0;

        const estimatedTotalPaise =
          estimatedSubtotalPaise +
          deliveryFeePaise +
          platformFeePaise +
          otherChargesPaise;

        const [createdOrder] = await tx
          .insert(orders)
          .values({
            orderNumber: generateOrderNumber(),
            customerId: customer.id,
            addressId: address.id,

            recipientName: address.recipientName,
            recipientPhone: address.phone,

            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            locality: address.locality,
            landmark: address.landmark,

            city: address.city,
            district: address.district,
            state: address.state,
            postalCode: address.postalCode,

            deliveryInstructions: address.deliveryInstructions,

            status: "PLACED",
            paymentMethod,
            paymentStatus: "COD_PENDING",

            itemSubtotalEstimatedPaise:
              estimatedSubtotalPaise,

            itemSubtotalActualPaise: 0,

            deliveryFeePaise,
            platformFeePaise,
            otherChargesPaise,

            estimatedTotalPaise,
            finalTotalPaise: 0,

            currency: "INR",
            customerNotes,
            idempotencyKey,
          })
          .onConflictDoNothing({
            target: [
              orders.customerId,
              orders.idempotencyKey,
            ],
          })
          .returning();

        // Another concurrent request may have created this order.
        if (!createdOrder) {
          const [duplicate] = await tx
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.customerId, customer.id),
                eq(orders.idempotencyKey, idempotencyKey)
              )
            )
            .limit(1);

          if (!duplicate) {
            throw new Error("Unable to create or retrieve order.");
          }

          return {
            kind: "existing" as const,
            order: duplicate,
          };
        }

        // Save immutable product and price snapshots.
        await tx.insert(orderItems).values(
          items.map((item) => ({
            orderId: createdOrder.id,

            productId: item.productId,

            productNameSnapshot: item.name,
            brandSnapshot: item.brand,
            unitLabelSnapshot: item.unitLabel,

            requestedQuantity: item.quantity,
            estimatedUnitPricePaise:
              item.estimatedPricePaise!,

            purchasedQuantity: 0,
            actualLineTotalPaise: 0,

            status: "PENDING" as const,
          }))
        );

        // Record order creation for auditing.
        await tx.insert(orderEvents).values({
          orderId: createdOrder.id,
          previousStatus: null,
          newStatus: "PLACED",
          eventType: "ORDER_PLACED",
          actorUserId: customer.id,
          actorRole: "CUSTOMER",
          metadata: {
            paymentMethod,
            estimatedTotalPaise,
          },
        });

        // Clear the cart only after successful order creation.
        await tx
          .delete(cartItems)
          .where(eq(cartItems.cartId, cart.id));

        return {
          kind: "created" as const,
          order: createdOrder,
        };
      });

      if (result.kind === "address_not_found") {
        return reply.code(404).send({
          success: false,
          message: "Delivery address not found.",
        });
      }

      if (result.kind === "empty_cart") {
        return reply.code(400).send({
          success: false,
          message: "Your shopping cart is empty.",
        });
      }

      if (result.kind === "invalid_products") {
        return reply.code(409).send({
          success: false,
          message: "Some products need price or availability updates.",
          products: result.names,
        });
      }

      return reply.code(
        result.kind === "created" ? 201 : 200
      ).send({
        success: true,
        message:
          result.kind === "created"
            ? "Your COD order has been placed."
            : "Previously created order retrieved.",
        data: {
          id: result.order.id,
          orderNumber: result.order.orderNumber,
          status: result.order.status,
          paymentMethod: result.order.paymentMethod,
          paymentStatus: result.order.paymentStatus,
          estimatedTotalPaise:
            result.order.estimatedTotalPaise,
          finalTotalPaise: result.order.finalTotalPaise,
          createdAt: result.order.createdAt,
        },
      });
    } catch (error) {
      request.log.error(
        { err: error },
        "Order creation failed"
      );

      return reply.code(500).send({
        success: false,
        message: "Unable to place order. Please retry.",
      });
    }
  });

  // ------------------------------------------
  // CUSTOMER ORDER HISTORY
  // GET /api/v1/orders
  // ------------------------------------------

  app.get("/orders", async (request, reply) => {
    const customer = await findAuthenticatedUser(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }


    if (customer.role !== "CUSTOMER") {


      return reply.code(403).send({


        success: false,


        message: "Customer access required.",


      });


    }

    const result = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        estimatedTotalPaise: orders.estimatedTotalPaise,
        finalTotalPaise: orders.finalTotalPaise,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt));

    return {
      success: true,
      data: result,
    };
  });

  // ------------------------------------------
  // CUSTOMER ORDER DETAILS
  // GET /api/v1/orders/:id
  // ------------------------------------------

  app.get<{ Params: { id: string } }>(
    "/orders/:id",
    async (request, reply) => {
      const customer = await findAuthenticatedUser(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }


      if (customer.role !== "CUSTOMER") {


        return reply.code(403).send({


          success: false,


          message: "Customer access required.",


        });


      }

      if (!orderIdSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid order ID.",
        });
      }

      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, request.params.id),
            eq(orders.customerId, customer.id)
          )
        )
        .limit(1);

      if (!order) {
        return reply.code(404).send({
          success: false,
          message: "Order not found.",
        });
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      return {
        success: true,
        data: {
          ...order,
          items,
        },
      };
    }
  );
}
