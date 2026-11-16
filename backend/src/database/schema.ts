
import { sql } from "drizzle-orm";

import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  numeric,
  uniqueIndex,
  index,
  check,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------
// ENUMS
// ---------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "CUSTOMER",
  "ADMIN",
  "DELIVERY_PARTNER",
  "SHOPKEEPER",
]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
]);

export const shopStatusEnum = pgEnum("shop_status", [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
]);

export const productStatusEnum = pgEnum("product_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const addressTypeEnum = pgEnum("address_type", [
  "HOME",
  "WORK",
  "OTHER",
]);

export const shopProductAvailabilityEnum = pgEnum(
  "shop_product_availability",
  ["AVAILABLE", "UNAVAILABLE", "NOT_CHECKED"]
);

// =============================================
// ORDER MANAGEMENT ENUMS
// =============================================

export const orderStatusEnum = pgEnum("order_status", [
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

export const paymentMethodEnum = pgEnum("payment_method", [
  "COD",
  "ONLINE",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "COD_PENDING",
  "COD_COLLECTED",
  "REFUND_PENDING",
  "REFUNDED",
  "FAILED",
]);

export const orderItemStatusEnum = pgEnum("order_item_status", [
  "PENDING",
  "PURCHASED",
  "UNAVAILABLE",
  "REPLACEMENT_REQUESTED",
  "REPLACEMENT_APPROVED",
  "REPLACEMENT_REJECTED",
  "REMOVED",
]);

export const deliveryPartnerStatusEnum = pgEnum(
  "delivery_partner_status",
  ["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED"]
);

export const deliveryAssignmentStatusEnum = pgEnum(
  "delivery_assignment_status",
  ["ASSIGNED", "ACCEPTED", "REJECTED", "CANCELLED", "COMPLETED"]
);

export const substitutionStatusEnum = pgEnum(
  "substitution_status",
  ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]
);

// ---------------------------------------------
// USERS
// ---------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    phone: varchar("phone", { length: 20 }).notNull().unique(),

    // Email is the verified login identifier for the free email-OTP pilot.
    // It is nullable so existing phone-based accounts can be linked safely.
    email: varchar("email", { length: 255 }),

    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
    }),

    fullName: varchar("full_name", { length: 120 }),

    role: userRoleEnum("role")
      .notNull()
      .default("CUSTOMER"),

    status: userStatusEnum("status")
      .notNull()
      .default("ACTIVE"),

    phoneVerifiedAt: timestamp("phone_verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
    uniqueIndex("users_email_unique")
      .on(table.email)
      .where(sql`${table.email} IS NOT NULL`),
  ]
);

// ---------------------------------------------
// CUSTOMER ADDRESSES
// ---------------------------------------------

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    recipientName: varchar("recipient_name", {
      length: 120,
    }).notNull(),

    phone: varchar("phone", { length: 20 }).notNull(),

    addressType: addressTypeEnum("address_type")
      .notNull()
      .default("HOME"),

    addressLine1: varchar("address_line1", {
      length: 200,
    }).notNull(),

    addressLine2: varchar("address_line2", {
      length: 200,
    }),

    locality: varchar("locality", { length: 120 }).notNull(),

    landmark: varchar("landmark", { length: 150 }),

    city: varchar("city", { length: 100 }).notNull(),

    district: varchar("district", { length: 100 }).notNull(),

    state: varchar("state", { length: 100 }).notNull(),

    postalCode: varchar("postal_code", { length: 6 }).notNull(),

    deliveryInstructions: text("delivery_instructions"),

    isDefault: boolean("is_default").notNull().default(false),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("addresses_user_id_idx").on(table.userId),
    uniqueIndex("addresses_one_default_per_user")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ]
);

// ---------------------------------------------
// LOCAL SHOPS
// ---------------------------------------------

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 150 }).notNull(),

    ownerName: varchar("owner_name", { length: 120 }).notNull(),

    phone: varchar("phone", { length: 20 }).notNull(),

    email: varchar("email", { length: 255 }),

    addressLine1: varchar("address_line1", {
      length: 200,
    }).notNull(),

    addressLine2: varchar("address_line2", {
      length: 200,
    }),

    locality: varchar("locality", { length: 120 }).notNull(),

    landmark: varchar("landmark", { length: 150 }),

    city: varchar("city", { length: 100 }).notNull(),

    district: varchar("district", { length: 100 }).notNull(),

    state: varchar("state", { length: 100 }).notNull(),

    postalCode: varchar("postal_code", { length: 6 }).notNull(),

    latitude: numeric("latitude", {
      precision: 9,
      scale: 6,
    }),

    longitude: numeric("longitude", {
      precision: 9,
      scale: 6,
    }),

    status: shopStatusEnum("status")
      .notNull()
      .default("PENDING"),

    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("shops_status_idx").on(table.status),
    index("shops_city_idx").on(table.city),
  ]
);

// ---------------------------------------------
// PRODUCT CATEGORIES
// ---------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 100 }).notNull(),

    slug: varchar("slug", { length: 120 }).notNull().unique(),

    description: text("description"),

    imageUrl: text("image_url"),

    sortOrder: integer("sort_order").notNull().default(0),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("categories_active_idx").on(table.isActive),
  ]
);

// ---------------------------------------------
// MASTER PRODUCT CATALOGUE
// ---------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    categoryId: uuid("category_id").references(
      () => categories.id,
      { onDelete: "set null" }
    ),

    name: varchar("name", { length: 150 }).notNull(),

    slug: varchar("slug", { length: 180 }).notNull().unique(),

    description: text("description"),

    brand: varchar("brand", { length: 100 }),

    unitLabel: varchar("unit_label", {
      length: 50,
    }).notNull(),

    // Indicative catalogue price in paise.
    estimatedPricePaise: integer("estimated_price_paise"),

    imageUrl: text("image_url"),

    status: productStatusEnum("status")
      .notNull()
      .default("ACTIVE"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_status_idx").on(table.status),

    check(
      "products_estimated_price_nonnegative",
      sql`${table.estimatedPricePaise} IS NULL OR ${table.estimatedPricePaise} >= 0`
    ),
  ]
);

// ---------------------------------------------
// SHOP-SPECIFIC PRODUCT PRICES
// ---------------------------------------------

export const shopProducts = pgTable(
  "shop_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),

    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    // Current indicative price at this particular shop.
    pricePaise: integer("price_paise").notNull(),

    availability: shopProductAvailabilityEnum("availability")
      .notNull()
      .default("NOT_CHECKED"),

    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("shop_products_shop_product_unique").on(
      table.shopId,
      table.productId
    ),

    index("shop_products_product_id_idx").on(table.productId),

    index("shop_products_availability_idx").on(table.availability),

    check(
      "shop_products_price_nonnegative",
      sql`${table.pricePaise} >= 0`
    ),
  ]
);


// =============================================
// DELIVERY PARTNERS
// =============================================

export const deliveryPartners = pgTable(
  "delivery_partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),

    vehicleType: varchar("vehicle_type", { length: 50 }),

    vehicleNumber: varchar("vehicle_number", { length: 30 }),

    status: deliveryPartnerStatusEnum("status")
      .notNull()
      .default("PENDING"),

    isAvailable: boolean("is_available")
      .notNull()
      .default(false),

    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("delivery_partners_status_idx").on(table.status),
    index("delivery_partners_availability_idx").on(
      table.isAvailable
    ),
  ]
);


// =============================================
// ORDERS
// =============================================

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderNumber: varchar("order_number", { length: 32 })
      .notNull()
      .unique(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    addressId: uuid("address_id").references(
      () => addresses.id,
      { onDelete: "set null" }
    ),

    // Delivery address snapshot
    recipientName: varchar("recipient_name", {
      length: 120,
    }).notNull(),

    recipientPhone: varchar("recipient_phone", {
      length: 20,
    }).notNull(),

    addressLine1: varchar("address_line1", {
      length: 200,
    }).notNull(),

    addressLine2: varchar("address_line2", { length: 200 }),

    locality: varchar("locality", { length: 120 }).notNull(),

    landmark: varchar("landmark", { length: 150 }),

    city: varchar("city", { length: 100 }).notNull(),

    district: varchar("district", { length: 100 }).notNull(),

    state: varchar("state", { length: 100 }).notNull(),

    postalCode: varchar("postal_code", { length: 6 }).notNull(),

    deliveryInstructions: text("delivery_instructions"),

    assignedShopId: uuid("assigned_shop_id").references(
      () => shops.id,
      { onDelete: "set null" }
    ),

    status: orderStatusEnum("status")
      .notNull()
      .default("PLACED"),

    paymentMethod: paymentMethodEnum("payment_method")
      .notNull(),

    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("PENDING"),

    // All monetary values are integer paise.
    itemSubtotalEstimatedPaise: integer(
      "item_subtotal_estimated_paise"
    ).notNull().default(0),

    itemSubtotalActualPaise: integer(
      "item_subtotal_actual_paise"
    ).notNull().default(0),

    deliveryFeePaise: integer("delivery_fee_paise")
      .notNull().default(0),

    platformFeePaise: integer("platform_fee_paise")
      .notNull().default(0),

    otherChargesPaise: integer("other_charges_paise")
      .notNull().default(0),

    estimatedTotalPaise: integer("estimated_total_paise")
      .notNull().default(0),

    finalTotalPaise: integer("final_total_paise")
      .notNull().default(0),

    currency: varchar("currency", { length: 3 })
      .notNull()
      .default("INR"),

    customerNotes: text("customer_notes"),

    cancellationReason: text("cancellation_reason"),

    // Supports safe retry of order creation.
    idempotencyKey: varchar("idempotency_key", {
      length: 128,
    }),

    priceFinalizedAt: timestamp("price_finalized_at", {
      withTimezone: true,
    }),

    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
    }),

    deliveredAt: timestamp("delivered_at", {
      withTimezone: true,
    }),

    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_shop_id_idx").on(table.assignedShopId),

    uniqueIndex("orders_customer_idempotency_unique")
      .on(table.customerId, table.idempotencyKey),

    check(
      "orders_amounts_nonnegative",
      sql`
        ${table.itemSubtotalEstimatedPaise} >= 0
        AND ${table.itemSubtotalActualPaise} >= 0
        AND ${table.deliveryFeePaise} >= 0
        AND ${table.platformFeePaise} >= 0
        AND ${table.otherChargesPaise} >= 0
        AND ${table.estimatedTotalPaise} >= 0
        AND ${table.finalTotalPaise} >= 0
      `
    ),
  ]
);


// =============================================
// ORDER ITEMS
// =============================================

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    productId: uuid("product_id").references(
      () => products.id,
      { onDelete: "set null" }
    ),

    // Original product snapshot
    productNameSnapshot: varchar("product_name_snapshot", {
      length: 150,
    }).notNull(),

    brandSnapshot: varchar("brand_snapshot", { length: 100 }),

    unitLabelSnapshot: varchar("unit_label_snapshot", {
      length: 50,
    }).notNull(),

    requestedQuantity: numeric("requested_quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }).notNull(),

    estimatedUnitPricePaise: integer(
      "estimated_unit_price_paise"
    ).notNull(),

    // Actual fulfilled product, which may be a replacement.
    fulfilledProductId: uuid("fulfilled_product_id").references(
      () => products.id,
      { onDelete: "set null" }
    ),

    fulfilledProductNameSnapshot: varchar(
      "fulfilled_product_name_snapshot",
      { length: 150 }
    ),

    fulfilledUnitLabelSnapshot: varchar(
      "fulfilled_unit_label_snapshot",
      { length: 50 }
    ),

    actualUnitPricePaise: integer("actual_unit_price_paise"),

    purchasedQuantity: numeric("purchased_quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }).notNull().default(0),

    actualLineTotalPaise: integer(
      "actual_line_total_paise"
    ).notNull().default(0),

    status: orderItemStatusEnum("status")
      .notNull()
      .default("PENDING"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),

    check(
      "order_items_quantity_valid",
      sql`
        ${table.requestedQuantity} > 0
        AND ${table.purchasedQuantity} >= 0
      `
    ),

    check(
      "order_items_prices_nonnegative",
      sql`
        ${table.estimatedUnitPricePaise} >= 0
        AND (
          ${table.actualUnitPricePaise} IS NULL
          OR ${table.actualUnitPricePaise} >= 0
        )
        AND ${table.actualLineTotalPaise} >= 0
      `
    ),
  ]
);

// =============================================
// DELIVERY ASSIGNMENTS
// =============================================

export const deliveryAssignments = pgTable(
  "delivery_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    deliveryPartnerId: uuid("delivery_partner_id")
      .notNull()
      .references(() => deliveryPartners.id, {
        onDelete: "restrict",
      }),

    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    status: deliveryAssignmentStatusEnum("status")
      .notNull()
      .default("ASSIGNED"),

    rejectionReason: text("rejection_reason"),

    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
    }),

    endedAt: timestamp("ended_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    index("delivery_assignments_order_id_idx").on(table.orderId),

    index("delivery_assignments_partner_id_idx").on(
      table.deliveryPartnerId
    ),

    uniqueIndex("delivery_assignments_one_active_order")
      .on(table.orderId)
      .where(
        sql`${table.status} IN ('ASSIGNED', 'ACCEPTED')`
      ),
  ]
);

// =============================================
// PRODUCT SUBSTITUTIONS
// =============================================

export const substitutions = pgTable(
  "substitutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),

    requestedByPartnerId: uuid("requested_by_partner_id")
      .notNull()
      .references(() => deliveryPartners.id, {
        onDelete: "restrict",
      }),

    replacementProductId: uuid("replacement_product_id").references(
      () => products.id,
      { onDelete: "set null" }
    ),

    replacementNameSnapshot: varchar(
      "replacement_name_snapshot",
      { length: 150 }
    ).notNull(),

    replacementUnitLabel: varchar("replacement_unit_label", {
      length: 50,
    }).notNull(),

    replacementUnitPricePaise: integer(
      "replacement_unit_price_paise"
    ).notNull(),

    replacementQuantity: numeric("replacement_quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }).notNull(),

    status: substitutionStatusEnum("status")
      .notNull()
      .default("PENDING"),

    reason: text("reason"),

    customerRespondedAt: timestamp("customer_responded_at", {
      withTimezone: true,
    }),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("substitutions_order_item_idx").on(table.orderItemId),

    index("substitutions_status_idx").on(table.status),

    uniqueIndex("substitutions_one_pending_per_item")
      .on(table.orderItemId)
      .where(sql`${table.status} = 'PENDING'`),

    check(
      "substitutions_price_nonnegative",
      sql`${table.replacementUnitPricePaise} >= 0`
    ),

    check(
      "substitutions_quantity_positive",
      sql`${table.replacementQuantity} > 0`
    ),
  ]
);

// =============================================
// ORDER EVENTS / AUDIT HISTORY
// =============================================

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    previousStatus: orderStatusEnum("previous_status"),

    newStatus: orderStatusEnum("new_status"),

    eventType: varchar("event_type", {
      length: 80,
    }).notNull(),

    actorUserId: uuid("actor_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),

    actorRole: userRoleEnum("actor_role"),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("order_events_order_id_idx").on(table.orderId),

    index("order_events_created_at_idx").on(table.createdAt),
  ]
);


// =============================================
// DELIVERY OTP
// =============================================

export const deliveryOtps = pgTable(
  "delivery_otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    otpHash: varchar("otp_hash", { length: 255 }).notNull(),

    failedAttempts: integer("failed_attempts")
      .notNull()
      .default(0),

    maxAttempts: integer("max_attempts")
      .notNull()
      .default(5),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
    }),

    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
    }),

    invalidatedAt: timestamp("invalidated_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("delivery_otps_order_id_idx").on(table.orderId),

    index("delivery_otps_expiry_idx").on(table.expiresAt),

    check(
      "delivery_otps_attempts_valid",
      sql`
        ${table.failedAttempts} >= 0
        AND ${table.maxAttempts} > 0
        AND ${table.failedAttempts} <= ${table.maxAttempts}
      `
    ),
  ]
);


// =============================================
// ORDER RECEIPTS
// =============================================

export const orderReceipts = pgTable(
  "order_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),

    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    storageKey: varchar("storage_key", {
      length: 500,
    }).notNull().unique(),

    originalFileName: varchar("original_file_name", {
      length: 255,
    }).notNull(),

    mimeType: varchar("mime_type", {
      length: 100,
    }).notNull(),

    fileSizeBytes: integer("file_size_bytes").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("order_receipts_order_id_idx").on(table.orderId),

    check(
      "order_receipts_file_size_valid",
      sql`${table.fileSizeBytes} > 0`
    ),
  ]
);


// =============================================
// AUTHENTICATION OTP CHALLENGES
// =============================================


export const otpChallenges = pgTable(
  "auth_otp_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    phone: varchar("phone", { length: 20 }).notNull(),

    // Email address that receives this OTP. Nullable for legacy challenges.
    email: varchar("email", { length: 255 }),

    fullName: varchar("full_name", { length: 120 }),

    otpHash: varchar("otp_hash", { length: 64 }).notNull(),

    failedAttempts: integer("failed_attempts")
      .notNull()
      .default(0),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("auth_otp_phone_created_idx").on(
      table.phone,
      table.createdAt
    ),

    index("auth_otp_email_created_idx").on(
      table.email,
      table.createdAt
    ),

    check(
      "auth_otp_attempts_valid",
      sql`${table.failedAttempts} >= 0 AND ${table.failedAttempts} <= 5`
    ),
  ]
);

// =============================================
// USER SESSIONS
// =============================================

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // SHA-256 hash of the random session token.
    tokenHash: varchar("token_hash", { length: 64 })
      .notNull()
      .unique(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    lastUsedAt: timestamp("last_used_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_expiry_idx").on(table.expiresAt),
  ]
);

// =============================================
// IN-APP NOTIFICATIONS
// =============================================

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    relatedOrderId: uuid("related_order_id").references(
      () => orders.id,
      { onDelete: "set null" }
    ),

    type: varchar("type", { length: 60 }).notNull(),

    title: varchar("title", { length: 160 }).notNull(),

    body: text("body").notNull(),

    actionUrl: text("action_url"),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    readAt: timestamp("read_at", { withTimezone: true }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("notifications_recipient_read_created_idx").on(
      table.recipientUserId,
      table.readAt,
      table.createdAt
    ),
    index("notifications_related_order_idx").on(table.relatedOrderId),
  ]
);

// =============================================
// CUSTOMER CARTS
// =============================================

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    index("carts_user_id_idx").on(table.userId),
  ]
);

// =============================================
// CUSTOMER CART ITEMS
// =============================================

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),

    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    quantity: numeric("quantity", {
      precision: 10,
      scale: 3,
      mode: "number",
    }).notNull().default(1),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cart_items_cart_product_unique").on(
      table.cartId,
      table.productId
    ),
    index("cart_items_cart_id_idx").on(table.cartId),
    index("cart_items_product_id_idx").on(table.productId),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ]
);

