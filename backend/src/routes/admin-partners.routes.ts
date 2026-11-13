import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/index.js";
import {
  deliveryAssignments,
  deliveryPartners,
  users,
} from "../database/schema.js";
import { getSessionUser } from "../utils/session.js";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSessionUser(request);

  if (!session) {
    reply.code(401).send({ success: false, message: "Please log in." });
    return null;
  }

  if (session.role !== "ADMIN") {
    reply.code(403).send({ success: false, message: "Admin access required." });
    return null;
  }

  return session;
}

function normalizeIndianPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

const createPartnerSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  vehicleType: z.string().trim().max(50).optional().nullable(),
  vehicleNumber: z.string().trim().max(30).optional().nullable(),
});

const updatePartnerSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  vehicleType: z.string().trim().max(50).nullable().optional(),
  vehicleNumber: z.string().trim().max(30).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update.",
});

export const adminPartnerRoutes: FastifyPluginAsync = async (app) => {
  // List all partner profiles with the associated account details.
  app.get("/admin/partners", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const rows = await db
      .select({
        id: deliveryPartners.id,
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        userStatus: users.status,
        vehicleType: deliveryPartners.vehicleType,
        vehicleNumber: deliveryPartners.vehicleNumber,
        status: deliveryPartners.status,
        isAvailable: deliveryPartners.isAvailable,
        verifiedAt: deliveryPartners.verifiedAt,
        createdAt: deliveryPartners.createdAt,
      })
      .from(deliveryPartners)
      .innerJoin(users, eq(users.id, deliveryPartners.userId))
      .orderBy(desc(deliveryPartners.createdAt))
      .limit(200);

    return { success: true, data: rows };
  });

  // Add an existing registered account as a delivery partner.
  // The person must first register/login with their phone number.
  app.post("/admin/partners", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;

    const parsed = createPartnerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        message: "Enter a valid phone number and vehicle details.",
        errors: parsed.error.flatten(),
      });
    }

    const phone = normalizeIndianPhone(parsed.data.phone);
    if (!phone) {
      return reply.code(400).send({
        success: false,
        message: "Enter a valid 10-digit Indian mobile number.",
      });
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.phone, phone))
          .for("update")
          .limit(1);

        if (!user) {
          throw new Error("USER_NOT_FOUND: Ask this person to register on ApnaBasket first.");
        }

        if (user.status !== "ACTIVE") {
          throw new Error("This user account is not active.");
        }

        if (user.role === "ADMIN" || user.role === "SHOPKEEPER") {
          throw new Error("This account cannot be converted into a delivery partner.");
        }

        const [existing] = await tx
          .select({ id: deliveryPartners.id })
          .from(deliveryPartners)
          .where(eq(deliveryPartners.userId, user.id))
          .limit(1);

        if (existing) {
          throw new Error("A delivery partner profile already exists for this user.");
        }

        const [partner] = await tx
          .insert(deliveryPartners)
          .values({
            userId: user.id,
            vehicleType: parsed.data.vehicleType?.trim() || null,
            vehicleNumber: parsed.data.vehicleNumber?.trim().toUpperCase() || null,
            status: "PENDING",
            isAvailable: false,
          })
          .returning();

        await tx
          .update(users)
          .set({ role: "DELIVERY_PARTNER", updatedAt: new Date() })
          .where(eq(users.id, user.id));

        return {
          id: partner.id,
          userId: user.id,
          fullName: user.fullName,
          phone: user.phone,
          vehicleType: partner.vehicleType,
          vehicleNumber: partner.vehicleNumber,
          status: partner.status,
          isAvailable: partner.isAvailable,
          verifiedAt: partner.verifiedAt,
          createdAt: partner.createdAt,
        };
      });

      return reply.code(201).send({
        success: true,
        message: "Partner profile created and queued for approval.",
        data: created,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create partner profile.";
      const statusCode = message.startsWith("USER_NOT_FOUND:") ? 404 : 409;
      return reply.code(statusCode).send({
        success: false,
        message: message.replace("USER_NOT_FOUND: ", ""),
      });
    }
  });

  // Approve, deactivate, or suspend a partner; also update vehicle details.
  app.patch<{ Params: { partnerId: string } }>(
    "/admin/partners/:partnerId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;

      if (!z.string().uuid().safeParse(request.params.partnerId).success) {
        return reply.code(400).send({ success: false, message: "Invalid partner ID." });
      }

      const parsed = updatePartnerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          message: "Invalid partner update.",
          errors: parsed.error.flatten(),
        });
      }

      try {
        const updated = await db.transaction(async (tx) => {
          const [partner] = await tx
            .select()
            .from(deliveryPartners)
            .where(eq(deliveryPartners.id, request.params.partnerId))
            .for("update")
            .limit(1);

          if (!partner) throw new Error("Delivery partner not found.");

          if (parsed.data.status === "ACTIVE") {
            const [user] = await tx
              .select({ status: users.status })
              .from(users)
              .where(eq(users.id, partner.userId))
              .limit(1);

            if (!user || user.status !== "ACTIVE") {
              throw new Error("Cannot activate a suspended or inactive user account.");
            }
          }

          if (parsed.data.status && parsed.data.status !== "ACTIVE") {
            const [activeAssignment] = await tx
              .select({ id: deliveryAssignments.id })
              .from(deliveryAssignments)
              .where(
                and(
                  eq(deliveryAssignments.deliveryPartnerId, partner.id),
                  inArray(deliveryAssignments.status, ["ASSIGNED", "ACCEPTED"])
                )
              )
              .limit(1);

            if (activeAssignment) {
              throw new Error("This partner has an active assignment. Complete or reassign it before deactivation.");
            }
          }

          const nextStatus = parsed.data.status ?? partner.status;
          const [saved] = await tx
            .update(deliveryPartners)
            .set({
              ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
              ...(parsed.data.vehicleType !== undefined ? { vehicleType: parsed.data.vehicleType } : {}),
              ...(parsed.data.vehicleNumber !== undefined
                ? { vehicleNumber: parsed.data.vehicleNumber?.trim().toUpperCase() || null }
                : {}),
              isAvailable: nextStatus === "ACTIVE" ? partner.isAvailable : false,
              verifiedAt:
                parsed.data.status === "ACTIVE"
                  ? partner.verifiedAt ?? new Date()
                  : parsed.data.status !== undefined
                    ? null
                    : partner.verifiedAt,
              updatedAt: new Date(),
            })
            .where(eq(deliveryPartners.id, partner.id))
            .returning();

          return saved;
        });

        return { success: true, message: "Delivery partner updated.", data: updated };
      } catch (error) {
        return reply.code(409).send({
          success: false,
          message: error instanceof Error ? error.message : "Unable to update partner.",
        });
      }
    }
  );
};
