
import type { FastifyInstance } from "fastify";
import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import {
  addresses,
  carts,
  cartItems,
  products,
  categories,
} from "../database/schema.js";

import { findAuthenticatedUser } from "./auth.routes.js";

const addressSchema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(13),
  addressType: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2).max(120),
  landmark: z.string().trim().max(150).optional(),
  city: z.string().trim().min(2).max(100),
  district: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().regex(/^\d{6}$/),
  deliveryInstructions: z.string().trim().max(500).optional(),
  isDefault: z.boolean().default(false),
});

const addressUpdateSchema = addressSchema.partial();

const uuidSchema = z.string().uuid();

const cartItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number()
    .positive()
    .max(1000)
    .refine(
      (value) => Number.isInteger(value * 1000),
      "Maximum three decimal places are allowed."
    )
    .default(1),
});

const quantitySchema = z.object({
  quantity: z.number()
    .positive()
    .max(1000)
    .refine(
      (value) => Number.isInteger(value * 1000),
      "Maximum three decimal places are allowed."
    ),
});

async function getCustomer(request: Parameters<typeof findAuthenticatedUser>[0]) {
  return findAuthenticatedUser(request);
}

async function getOrCreateCart(userId: string) {
  const [existing] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(carts)
    .values({ userId })
    .onConflictDoNothing({ target: carts.userId })
    .returning();

  if (created) return created;

  const [concurrent] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (!concurrent) {
    throw new Error("Unable to create customer cart.");
  }

  return concurrent;
}

async function getCartData(userId: string) {
  const cart = await getOrCreateCart(userId);

  const items = await db
    .select({
      id: cartItems.id,
      productId: products.id,
      name: products.name,
      slug: products.slug,
      imageUrl: products.imageUrl,
      unitLabel: products.unitLabel,
      pricePaise: products.estimatedPricePaise,
      productStatus: products.status,
      categoryName: categories.name,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt));

  const subtotalPaise = items.reduce(
    (total, item) =>
      total +
      Math.round((item.pricePaise ?? 0) * item.quantity),
    0
  );

  return {
    id: cart.id,
    items,
    itemCount: items.reduce(
      (total, item) => total + item.quantity,
      0
    ),
    subtotalPaise,
    hasUnpricedItems: items.some(
      (item) => item.pricePaise === null
    ),
    hasInactiveItems: items.some(
      (item) => item.productStatus !== "ACTIVE"
    ),
  };
}

export async function customerRoutes(app: FastifyInstance) {
  // ===========================================
  // CUSTOMER ADDRESSES
  // ===========================================

  // GET /addresses
  app.get("/addresses", async (request, reply) => {
    const customer = await getCustomer(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, customer.id))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

    return { success: true, data: result };
  });

  // POST /addresses
  app.post("/addresses", async (request, reply) => {
    const customer = await getCustomer(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    const parsed = addressSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid address information.",
        errors: parsed.error.flatten(),
      });
    }

    const result = await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, customer.id));

      const makeDefault =
        parsed.data.isDefault || existing.length === 0;

      if (makeDefault) {
        await tx
          .update(addresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(addresses.userId, customer.id));
      }

      const [created] = await tx
        .insert(addresses)
        .values({
          ...parsed.data,
          userId: customer.id,
          isDefault: makeDefault,
        })
        .returning();

      return created;
    });

    return reply.code(201).send({
      success: true,
      message: "Address saved successfully.",
      data: result,
    });
  });

  // PATCH /addresses/:id
  app.patch<{ Params: { id: string } }>(
    "/addresses/:id",
    async (request, reply) => {
      const customer = await getCustomer(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid address ID.",
        });
      }

      const parsed = addressUpdateSchema.safeParse(request.body);

      if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
        return reply.code(400).send({
          success: false,
          message: "Invalid or empty address update.",
          errors: parsed.success ? undefined : parsed.error.flatten(),
        });
      }

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(addresses)
          .where(
            and(
              eq(addresses.id, request.params.id),
              eq(addresses.userId, customer.id)
            )
          )
          .limit(1);

        if (!existing) return null;

        if (parsed.data.isDefault === true) {
          await tx
            .update(addresses)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(addresses.userId, customer.id));
        }

        const [updated] = await tx
          .update(addresses)
          .set({
            ...parsed.data,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(addresses.id, request.params.id),
              eq(addresses.userId, customer.id)
            )
          )
          .returning();

        return updated;
      });

      if (!result) {
        return reply.code(404).send({
          success: false,
          message: "Address not found.",
        });
      }

      return { success: true, data: result };
    }
  );

  // PATCH /addresses/:id/default
  app.patch<{ Params: { id: string } }>(
    "/addresses/:id/default",
    async (request, reply) => {
      const customer = await getCustomer(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid address ID.",
        });
      }

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: addresses.id })
          .from(addresses)
          .where(
            and(
              eq(addresses.id, request.params.id),
              eq(addresses.userId, customer.id)
            )
          )
          .limit(1);

        if (!existing) return null;

        await tx
          .update(addresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(addresses.userId, customer.id));

        const [updated] = await tx
          .update(addresses)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(addresses.id, request.params.id))
          .returning();

        return updated;
      });

      if (!result) {
        return reply.code(404).send({
          success: false,
          message: "Address not found.",
        });
      }

      return { success: true, data: result };
    }
  );

  // DELETE /addresses/:id
  app.delete<{ Params: { id: string } }>(
    "/addresses/:id",
    async (request, reply) => {
      const customer = await getCustomer(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid address ID.",
        });
      }

      const deleted = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(addresses)
          .where(
            and(
              eq(addresses.id, request.params.id),
              eq(addresses.userId, customer.id)
            )
          )
          .limit(1);

        if (!existing) return null;

        await tx
          .delete(addresses)
          .where(eq(addresses.id, existing.id));

        if (existing.isDefault) {
          const [nextAddress] = await tx
            .select({ id: addresses.id })
            .from(addresses)
            .where(eq(addresses.userId, customer.id))
            .orderBy(desc(addresses.createdAt))
            .limit(1);

          if (nextAddress) {
            await tx
              .update(addresses)
              .set({ isDefault: true, updatedAt: new Date() })
              .where(eq(addresses.id, nextAddress.id));
          }
        }

        return existing;
      });

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          message: "Address not found.",
        });
      }

      return {
        success: true,
        message: "Address deleted successfully.",
      };
    }
  );

  // ===========================================
  // PERSISTENT CUSTOMER CART
  // ===========================================

  // GET /cart
  app.get("/cart", async (request, reply) => {
    const customer = await getCustomer(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    return {
      success: true,
      data: await getCartData(customer.id),
    };
  });

  // POST /cart/items
  app.post("/cart/items", async (request, reply) => {
    const customer = await getCustomer(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    const parsed = cartItemSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid cart item.",
        errors: parsed.error.flatten(),
      });
    }

    const { productId, quantity } = parsed.data;

    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, "ACTIVE")
        )
      )
      .limit(1);

    if (!product) {
      return reply.code(404).send({
        success: false,
        message: "Product not found or inactive.",
      });
    }

    const cart = await getOrCreateCart(customer.id);

    await db
      .insert(cartItems)
      .values({ cartId: cart.id, productId, quantity })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: {
          quantity: sql`${cartItems.quantity} + ${quantity}`,
          updatedAt: new Date(),
        },
      });

    return reply.code(200).send({
      success: true,
      message: "Product added to cart.",
      data: await getCartData(customer.id),
    });
  });

  // PATCH /cart/items/:id
  app.patch<{ Params: { id: string } }>(
    "/cart/items/:id",
    async (request, reply) => {
      const customer = await getCustomer(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid cart item ID.",
        });
      }

      const parsed = quantitySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid quantity.",
          errors: parsed.error.flatten(),
        });
      }

      const cart = await getOrCreateCart(customer.id);

      const [updated] = await db
        .update(cartItems)
        .set({
          quantity: parsed.data.quantity,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cartItems.id, request.params.id),
            eq(cartItems.cartId, cart.id)
          )
        )
        .returning({ id: cartItems.id });

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Cart item not found.",
        });
      }

      return {
        success: true,
        data: await getCartData(customer.id),
      };
    }
  );

  // DELETE /cart/items/:id
  app.delete<{ Params: { id: string } }>(
    "/cart/items/:id",
    async (request, reply) => {
      const customer = await getCustomer(request);

      if (!customer) {
        return reply.code(401).send({
          success: false,
          message: "Authentication required.",
        });
      }

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid cart item ID.",
        });
      }

      const cart = await getOrCreateCart(customer.id);

      const [deleted] = await db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.id, request.params.id),
            eq(cartItems.cartId, cart.id)
          )
        )
        .returning({ id: cartItems.id });

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          message: "Cart item not found.",
        });
      }

      return {
        success: true,
        data: await getCartData(customer.id),
      };
    }
  );

  // DELETE /cart
  app.delete("/cart", async (request, reply) => {
    const customer = await getCustomer(request);

    if (!customer) {
      return reply.code(401).send({
        success: false,
        message: "Authentication required.",
      });
    }

    const cart = await getOrCreateCart(customer.id);

    await db
      .delete(cartItems)
      .where(eq(cartItems.cartId, cart.id));

    return {
      success: true,
      message: "Cart cleared.",
      data: await getCartData(customer.id),
    };
  });
}
