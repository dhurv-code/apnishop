CREATE TABLE "notifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "recipient_user_id" uuid NOT NULL,
    "related_order_id" uuid,
    "type" varchar(60) NOT NULL,
    "title" varchar(160) NOT NULL,
    "body" text NOT NULL,
    "action_url" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk"
FOREIGN KEY ("recipient_user_id")
REFERENCES "public"."users"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_related_order_id_orders_id_fk"
FOREIGN KEY ("related_order_id")
REFERENCES "public"."orders"("id")
ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx"
ON "notifications" USING btree ("recipient_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_created_idx"
ON "notifications" USING btree ("recipient_user_id","read_at","created_at");
--> statement-breakpoint
CREATE INDEX "notifications_related_order_idx"
ON "notifications" USING btree ("related_order_id");