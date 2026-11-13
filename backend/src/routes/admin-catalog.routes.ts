
import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";

import {
  shops,
  categories,
  products,
  shopProducts,
} from "../database/schema.js";

import { getSessionUser } from "../utils/session.js";

// =============================================
// ADMIN AUTHORIZATION
// =============================================

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

const uuidSchema = z.string().uuid();

// =============================================
// VALIDATION SCHEMAS
// =============================================

const shopSchema = z.object({
  name: z.string().trim().min(2).max(150),
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(20),
  email: z.string().email().optional(),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2).max(120),
  landmark: z.string().trim().max(150).optional(),
  city: z.string().trim().min(2).max(100),
  district: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().regex(/^\d{6}$/),
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

const productSchema = z.object({
  categoryId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(150),
  slug: z.string().trim().min(2).max(180)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  unitLabel: z.string().trim().min(1).max(50),
  estimatedPricePaise: z.number().int().nonnegative().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

const shopStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE"]),
});

const productStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const shopProductSchema = z.object({
  pricePaise: z.number().int().nonnegative(),
  availability: z.enum([
    "AVAILABLE",
    "UNAVAILABLE",
    "NOT_CHECKED",
  ]),
});

// =============================================
// ADMIN CATALOGUE ROUTES
// =============================================

export async function adminCatalogRoutes(app: FastifyInstance) {

  // -------------------------------------------
  // SHOPS
  // -------------------------------------------

  // GET /admin/catalog/shops
  app.get("/admin/catalog/shops", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const result = await db
      .select()
      .from(shops)
      .orderBy(asc(shops.name));

    return { success: true, data: result };
  });

  // POST /admin/catalog/shops
  app.post("/admin/catalog/shops", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const parsed = shopSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid shop information.",
        errors: parsed.error.flatten(),
      });
    }

    const [created] = await db
      .insert(shops)
      .values({
        ...parsed.data,
        status: "PENDING",
      })
      .returning();

    return reply.code(201).send({
      success: true,
      message: "Shop registered and awaiting approval.",
      data: created,
    });
  });

  // PATCH /admin/catalog/shops/:id
  app.patch<{ Params: { id: string } }>(
    "/admin/catalog/shops/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop ID.",
        });
      }

      const parsed = shopSchema.partial().safeParse(request.body);

      if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop update.",
          errors: parsed.success ? undefined : parsed.error.flatten(),
        });
      }

      const [updated] = await db
        .update(shops)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(shops.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Shop not found.",
        });
      }

      return { success: true, data: updated };
    }
  );

  // PATCH /admin/catalog/shops/:id/status
  app.patch<{ Params: { id: string } }>(
    "/admin/catalog/shops/:id/status",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop ID.",
        });
      }

      const parsed = shopStatusSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop status.",
        });
      }

      const [updated] = await db
        .update(shops)
        .set({
          status: parsed.data.status,
          verifiedAt:
            parsed.data.status === "ACTIVE"
              ? new Date()
              : undefined,
          updatedAt: new Date(),
        })
        .where(eq(shops.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Shop not found.",
        });
      }

      return {
        success: true,
        message: "Shop status updated.",
        data: updated,
      };
    }
  );

  // -------------------------------------------
  // CATEGORIES
  // -------------------------------------------

  // GET /admin/catalog/categories
  app.get("/admin/catalog/categories", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const result = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    return { success: true, data: result };
  });

  // POST /admin/catalog/categories
  app.post("/admin/catalog/categories", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const parsed = categorySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid category information.",
        errors: parsed.error.flatten(),
      });
    }

    const [created] = await db
      .insert(categories)
      .values(parsed.data)
      .returning();

    return reply.code(201).send({
      success: true,
      message: "Category created.",
      data: created,
    });
  });

  // PATCH /admin/catalog/categories/:id
  app.patch<{ Params: { id: string } }>(
    "/admin/catalog/categories/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid category ID.",
        });
      }

      const parsed = categorySchema.partial().safeParse(request.body);

      if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
        return reply.code(400).send({
          success: false,
          message: "Invalid category update.",
          errors: parsed.success ? undefined : parsed.error.flatten(),
        });
      }

      const [updated] = await db
        .update(categories)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(categories.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Category not found.",
        });
      }

      return { success: true, data: updated };
    }
  );

  // -------------------------------------------
  // MASTER PRODUCTS
  // -------------------------------------------

  // GET /admin/catalog/products
  app.get("/admin/catalog/products", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const result = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        brand: products.brand,
        unitLabel: products.unitLabel,
        estimatedPricePaise: products.estimatedPricePaise,
        status: products.status,
        categoryId: categories.id,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(products.name));

    return { success: true, data: result };
  });

  // POST /admin/catalog/products
  app.post("/admin/catalog/products", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const parsed = productSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid product information.",
        errors: parsed.error.flatten(),
      });
    }

    if (parsed.data.categoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, parsed.data.categoryId),
            eq(categories.isActive, true)
          )
        )
        .limit(1);

      if (!category) {
        return reply.code(400).send({
          success: false,
          message: "Active category not found.",
        });
      }
    }

    const [created] = await db
      .insert(products)
      .values({
        ...parsed.data,
        status: "ACTIVE",
      })
      .returning();

    return reply.code(201).send({
      success: true,
      message: "Product created.",
      data: created,
    });
  });

  // PATCH /admin/catalog/products/:id
  app.patch<{ Params: { id: string } }>(
    "/admin/catalog/products/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid product ID.",
        });
      }

      const parsed = productSchema.partial().safeParse(request.body);

      if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
        return reply.code(400).send({
          success: false,
          message: "Invalid product update.",
          errors: parsed.success ? undefined : parsed.error.flatten(),
        });
      }

      const [updated] = await db
        .update(products)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(products.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Product not found.",
        });
      }

      return { success: true, data: updated };
    }
  );

  // PATCH /admin/catalog/products/:id/status
  app.patch<{ Params: { id: string } }>(
    "/admin/catalog/products/:id/status",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid product ID.",
        });
      }

      const parsed = productStatusSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid product status.",
        });
      }

      const [updated] = await db
        .update(products)
        .set({
          status: parsed.data.status,
          updatedAt: new Date(),
        })
        .where(eq(products.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.code(404).send({
          success: false,
          message: "Product not found.",
        });
      }

      return { success: true, data: updated };
    }
  );

  // -------------------------------------------
  // SHOP-SPECIFIC PRODUCT CATALOGUE
  // -------------------------------------------

  // GET /admin/catalog/shops/:shopId/products
  app.get<{ Params: { shopId: string } }>(
    "/admin/catalog/shops/:shopId/products",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!uuidSchema.safeParse(request.params.shopId).success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop ID.",
        });
      }

      const result = await db
        .select({
          id: shopProducts.id,
          productId: products.id,
          productName: products.name,
          unitLabel: products.unitLabel,
          pricePaise: shopProducts.pricePaise,
          availability: shopProducts.availability,
          lastVerifiedAt: shopProducts.lastVerifiedAt,
        })
        .from(shopProducts)
        .innerJoin(products, eq(shopProducts.productId, products.id))
        .where(eq(shopProducts.shopId, request.params.shopId))
        .orderBy(asc(products.name));

      return { success: true, data: result };
    }
  );

  // PUT /admin/catalog/shops/:shopId/products/:productId
  app.put<{
    Params: { shopId: string; productId: string };
  }>(
    "/admin/catalog/shops/:shopId/products/:productId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      const { shopId, productId } = request.params;

      if (
        !uuidSchema.safeParse(shopId).success ||
        !uuidSchema.safeParse(productId).success
      ) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop or product ID.",
        });
      }

      const parsed = shopProductSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid shop product details.",
          errors: parsed.error.flatten(),
        });
      }

      const [shop] = await db
        .select({ id: shops.id })
        .from(shops)
        .where(eq(shops.id, shopId))
        .limit(1);

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

      if (!shop || !product) {
        return reply.code(404).send({
          success: false,
          message: "Shop or active product not found.",
        });
      }

      const [saved] = await db
        .insert(shopProducts)
        .values({
          shopId,
          productId,
          ...parsed.data,
          lastVerifiedAt:
            parsed.data.availability === "NOT_CHECKED"
              ? null
              : new Date(),
        })
        .onConflictDoUpdate({
          target: [
            shopProducts.shopId,
            shopProducts.productId,
          ],
          set: {
            ...parsed.data,
            lastVerifiedAt:
              parsed.data.availability === "NOT_CHECKED"
                ? null
                : new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      return {
        success: true,
        message: "Shop product saved.",
        data: saved,
      };
    }
  );
}
