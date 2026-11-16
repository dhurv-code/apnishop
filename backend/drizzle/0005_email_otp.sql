ALTER TABLE "users" ADD COLUMN "email" varchar(255);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email") WHERE "users"."email" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD COLUMN "email" varchar(255);
--> statement-breakpoint
CREATE INDEX "auth_otp_email_created_idx" ON "auth_otp_challenges" USING btree ("email", "created_at");
