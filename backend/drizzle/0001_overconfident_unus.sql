CREATE TYPE "public"."delivery_assignment_status" AS ENUM('ASSIGNED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."delivery_partner_status" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('PENDING', 'PURCHASED', 'UNAVAILABLE', 'REPLACEMENT_REQUESTED', 'REPLACEMENT_APPROVED', 'REPLACEMENT_REJECTED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PLACED', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED', 'SHOPPING', 'AWAITING_APPROVAL', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('COD', 'ONLINE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'AUTHORIZED', 'PAID', 'COD_PENDING', 'COD_COLLECTED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."substitution_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "delivery_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"delivery_partner_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"status" "delivery_assignment_status" DEFAULT 'ASSIGNED' NOT NULL,
	"rejection_reason" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"otp_hash" varchar(255) NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_otps_attempts_valid" CHECK (
        "delivery_otps"."failed_attempts" >= 0
        AND "delivery_otps"."max_attempts" > 0
        AND "delivery_otps"."failed_attempts" <= "delivery_otps"."max_attempts"
      )
);
--> statement-breakpoint
CREATE TABLE "delivery_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_type" varchar(50),
	"vehicle_number" varchar(30),
	"status" "delivery_partner_status" DEFAULT 'PENDING' NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_partners_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"previous_status" "order_status",
	"new_status" "order_status",
	"event_type" varchar(80) NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "user_role",
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name_snapshot" varchar(150) NOT NULL,
	"brand_snapshot" varchar(100),
	"unit_label_snapshot" varchar(50) NOT NULL,
	"requested_quantity" numeric(10, 3) NOT NULL,
	"estimated_unit_price_paise" integer NOT NULL,
	"fulfilled_product_id" uuid,
	"fulfilled_product_name_snapshot" varchar(150),
	"fulfilled_unit_label_snapshot" varchar(50),
	"actual_unit_price_paise" integer,
	"purchased_quantity" numeric(10, 3) DEFAULT 0 NOT NULL,
	"actual_line_total_paise" integer DEFAULT 0 NOT NULL,
	"status" "order_item_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_valid" CHECK (
        "order_items"."requested_quantity" > 0
        AND "order_items"."purchased_quantity" >= 0
      ),
	CONSTRAINT "order_items_prices_nonnegative" CHECK (
        "order_items"."estimated_unit_price_paise" >= 0
        AND (
          "order_items"."actual_unit_price_paise" IS NULL
          OR "order_items"."actual_unit_price_paise" >= 0
        )
        AND "order_items"."actual_line_total_paise" >= 0
      )
);
--> statement-breakpoint
CREATE TABLE "order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_receipts_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "order_receipts_file_size_valid" CHECK ("order_receipts"."file_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_id" uuid,
	"recipient_name" varchar(120) NOT NULL,
	"recipient_phone" varchar(20) NOT NULL,
	"address_line1" varchar(200) NOT NULL,
	"address_line2" varchar(200),
	"locality" varchar(120) NOT NULL,
	"landmark" varchar(150),
	"city" varchar(100) NOT NULL,
	"district" varchar(100) NOT NULL,
	"state" varchar(100) NOT NULL,
	"postal_code" varchar(6) NOT NULL,
	"delivery_instructions" text,
	"assigned_shop_id" uuid,
	"status" "order_status" DEFAULT 'PLACED' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"item_subtotal_estimated_paise" integer DEFAULT 0 NOT NULL,
	"item_subtotal_actual_paise" integer DEFAULT 0 NOT NULL,
	"delivery_fee_paise" integer DEFAULT 0 NOT NULL,
	"platform_fee_paise" integer DEFAULT 0 NOT NULL,
	"other_charges_paise" integer DEFAULT 0 NOT NULL,
	"estimated_total_paise" integer DEFAULT 0 NOT NULL,
	"final_total_paise" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"customer_notes" text,
	"cancellation_reason" text,
	"idempotency_key" varchar(128),
	"price_finalized_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_amounts_nonnegative" CHECK (
        "orders"."item_subtotal_estimated_paise" >= 0
        AND "orders"."item_subtotal_actual_paise" >= 0
        AND "orders"."delivery_fee_paise" >= 0
        AND "orders"."platform_fee_paise" >= 0
        AND "orders"."other_charges_paise" >= 0
        AND "orders"."estimated_total_paise" >= 0
        AND "orders"."final_total_paise" >= 0
      )
);
--> statement-breakpoint
CREATE TABLE "substitutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"requested_by_partner_id" uuid NOT NULL,
	"replacement_product_id" uuid,
	"replacement_name_snapshot" varchar(150) NOT NULL,
	"replacement_unit_label" varchar(50) NOT NULL,
	"replacement_unit_price_paise" integer NOT NULL,
	"replacement_quantity" numeric(10, 3) NOT NULL,
	"status" "substitution_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"customer_responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "substitutions_price_nonnegative" CHECK ("substitutions"."replacement_unit_price_paise" >= 0),
	CONSTRAINT "substitutions_quantity_positive" CHECK ("substitutions"."replacement_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_delivery_partner_id_delivery_partners_id_fk" FOREIGN KEY ("delivery_partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_otps" ADD CONSTRAINT "delivery_otps_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_partners" ADD CONSTRAINT "delivery_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_fulfilled_product_id_products_id_fk" FOREIGN KEY ("fulfilled_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_receipts" ADD CONSTRAINT "order_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_receipts" ADD CONSTRAINT "order_receipts_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_shop_id_shops_id_fk" FOREIGN KEY ("assigned_shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_requested_by_partner_id_delivery_partners_id_fk" FOREIGN KEY ("requested_by_partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_replacement_product_id_products_id_fk" FOREIGN KEY ("replacement_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_assignments_order_id_idx" ON "delivery_assignments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_assignments_partner_id_idx" ON "delivery_assignments" USING btree ("delivery_partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_assignments_one_active_order" ON "delivery_assignments" USING btree ("order_id") WHERE "delivery_assignments"."status" IN ('ASSIGNED', 'ACCEPTED');--> statement-breakpoint
CREATE INDEX "delivery_otps_order_id_idx" ON "delivery_otps" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_otps_expiry_idx" ON "delivery_otps" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "delivery_partners_status_idx" ON "delivery_partners" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_partners_availability_idx" ON "delivery_partners" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_created_at_idx" ON "order_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_receipts_order_id_idx" ON "order_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_shop_id_idx" ON "orders" USING btree ("assigned_shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_idempotency_unique" ON "orders" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "substitutions_order_item_idx" ON "substitutions" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "substitutions_status_idx" ON "substitutions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "substitutions_one_pending_per_item" ON "substitutions" USING btree ("order_item_id") WHERE "substitutions"."status" = 'PENDING';