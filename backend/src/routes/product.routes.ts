
import type { FastifyInstance } from "fastify";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import { categories, products } from "../database/schema.js";

const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
});

const productIdSchema = z.string().uuid();

export async function productRoutes(app: FastifyInstance) {
  // GET /products
  app.get("/products", async (request, reply) => {
    const parsed = productQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Invalid product filters",
        errors: parsed.error.flatten(),
      });
    }

    const { search, category, page, limit, sort } = parsed.data;

    const conditions = [eq(products.status, "ACTIVE")];

    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(
        ilike(products.name, pattern),
        ilike(products.brand, pattern)
      );

      if (searchCondition) conditions.push(searchCondition);
    }

    if (category) {
      conditions.push(eq(categories.slug, category));
    }

    const whereClause = and(...conditions);

    const orderBy =
      sort === "price_asc"
        ? asc(products.estimatedPricePaise)
        : sort === "price_desc"
          ? desc(products.estimatedPricePaise)
          : desc(products.createdAt);

    const offset = (page - 1) * limit;

    const [items, totalResult] = await Promise.all([
      db
        .select({
          id: products.id,
          name: products.name,
          slug: products.slug,
          description: products.description,
          brand: products.brand,
          unitLabel: products.unitLabel,
          estimatedPricePaise: products.estimatedPricePaise,
          imageUrl: products.imageUrl,
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),

      db
        .select({ total: count() })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.total ?? 0);

    return {
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // GET /products/:id
  app.get<{ Params: { id: string } }>(
    "/products/:id",
    async (request, reply) => {
      const parsed = productIdSchema.safeParse(request.params.id);

      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid product ID",
        });
      }

      const result = await db
        .select({
          id: products.id,
          name: products.name,
          slug: products.slug,
          description: products.description,
          brand: products.brand,
          unitLabel: products.unitLabel,
          estimatedPricePaise: products.estimatedPricePaise,
          imageUrl: products.imageUrl,
          categoryName: categories.name,
          categorySlug: categories.slug,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(products.id, parsed.data),
            eq(products.status, "ACTIVE")
          )
        )
        .limit(1);

      if (!result.length) {
        return reply.code(404).send({
          success: false,
          message: "Product not found",
        });
      }

      return {
        success: true,
        data: result[0],
      };
    }
  );
}

// GET /categories
export async function categoryRoutes(app: FastifyInstance) {
  app.get("/categories", async () => {
    const result = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        imageUrl: categories.imageUrl,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    return {
      success: true,
      data: result,
    };
  });
}
