CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."preorder_batch_course_type" AS ENUM('required', 'elective');--> statement-breakpoint
CREATE TYPE "public"."preorder_batch_staff_role" AS ENUM('owner', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."preorder_batch_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."preorder_payment_status" AS ENUM('unpaid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."preorder_pickup_status" AS ENUM('pending', 'fulfilled');--> statement-breakpoint
CREATE TYPE "public"."student_roster_claim_method" AS ENUM('data', 'email');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'student' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"username" text,
	"display_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('admin', 'staff', 'student'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"isbn" text,
	"author" text,
	"publisher" text,
	"cover_image_url" text,
	"description" text,
	"list_price" integer NOT NULL,
	"subject" text,
	"grade_level" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_isbn_unique" UNIQUE("isbn"),
	CONSTRAINT "book_listPrice_check" CHECK ("book"."list_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "book_cover_image" (
	"book_id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"preorder_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"transaction_ref" text,
	"paid_at" timestamp,
	"confirmed_by" text,
	"refunded_amount" integer,
	"refund_reason" text,
	"refunded_at" timestamp,
	"refunded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_check" CHECK ("payment"."amount" > 0),
	CONSTRAINT "payment_refundedAmount_check" CHECK ("payment"."refunded_amount" is null or ("payment"."refunded_amount" >= 0 and "payment"."refunded_amount" <= "payment"."amount")),
	CONSTRAINT "payment_refund_consistency_check" CHECK (("payment"."refunded_amount" is null) = ("payment"."refunded_at" is null)),
	CONSTRAINT "payment_refundedAt_check" CHECK (("payment"."status" = 'refunded') = ("payment"."refunded_at" is not null)),
	CONSTRAINT "payment_paidAt_check" CHECK (("payment"."status" in ('succeeded', 'refunded')) = ("payment"."paid_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "preorder" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"user_id" text NOT NULL,
	"payment_status" "preorder_payment_status" DEFAULT 'unpaid' NOT NULL,
	"pickup_status" "preorder_pickup_status" DEFAULT 'pending' NOT NULL,
	"total_amount" integer NOT NULL,
	"note" text,
	"pickup_location" text,
	"fulfilled_at" timestamp,
	"fulfilled_by" text,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"cancelled_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_id_batchId_uidx" UNIQUE("id","batch_id"),
	CONSTRAINT "preorder_totalAmount_check" CHECK ("preorder"."total_amount" >= 0),
	CONSTRAINT "preorder_fulfilledAt_check" CHECK (("preorder"."pickup_status" = 'fulfilled') = ("preorder"."fulfilled_at" is not null)),
	CONSTRAINT "preorder_not_cancelled_and_fulfilled_check" CHECK ("preorder"."cancelled_at" is null or "preorder"."pickup_status" != 'fulfilled')
);
--> statement-breakpoint
CREATE TABLE "preorder_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp,
	"status" "preorder_batch_status" DEFAULT 'draft' NOT NULL,
	"instructor_name" text,
	"course_code" text,
	"course_type" "preorder_batch_course_type",
	"location" text,
	"class_schedule" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_batch_endAt_check" CHECK ("preorder_batch"."end_at" is null or "preorder_batch"."end_at" > "preorder_batch"."start_at")
);
--> statement-breakpoint
CREATE TABLE "preorder_batch_book" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"book_id" text NOT NULL,
	"quantity_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_batch_book_batchId_bookId_uidx" UNIQUE("batch_id","book_id"),
	CONSTRAINT "preorder_batch_book_quantityLimit_check" CHECK ("preorder_batch_book"."quantity_limit" is null or "preorder_batch_book"."quantity_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "preorder_batch_book_price_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_book_id" text NOT NULL,
	"min_quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_batch_book_price_tier_minQuantity_check" CHECK ("preorder_batch_book_price_tier"."min_quantity" >= 1),
	CONSTRAINT "preorder_batch_book_price_tier_price_check" CHECK ("preorder_batch_book_price_tier"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "preorder_batch_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "preorder_batch_staff_role" DEFAULT 'assistant' NOT NULL,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_batch_staff_batchId_userId_uidx" UNIQUE("batch_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "preorder_item" (
	"id" text PRIMARY KEY NOT NULL,
	"preorder_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"book_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"subtotal" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preorder_item_quantity_check" CHECK ("preorder_item"."quantity" > 0),
	CONSTRAINT "preorder_item_unitPrice_check" CHECK ("preorder_item"."unit_price" >= 0),
	CONSTRAINT "preorder_item_subtotal_check" CHECK ("preorder_item"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_roster" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"real_name" text NOT NULL,
	"imported_by" text,
	"claimed_by_user_id" text,
	"claimed_at" timestamp,
	"claim_method" "student_roster_claim_method",
	"verified_at" timestamp,
	"verified_by" text,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_roster_claimed_by_user_id_unique" UNIQUE("claimed_by_user_id"),
	CONSTRAINT "student_roster_studentId_check" CHECK (length(trim("student_roster"."student_id")) > 0),
	CONSTRAINT "student_roster_realName_check" CHECK (length(trim("student_roster"."real_name")) > 0),
	CONSTRAINT "student_roster_claim_consistency_check" CHECK (("student_roster"."claimed_by_user_id" is null) = ("student_roster"."claimed_at" is null)),
	CONSTRAINT "student_roster_claimMethod_check" CHECK (("student_roster"."claimed_at" is null) = ("student_roster"."claim_method" is null)),
	CONSTRAINT "student_roster_verifiedAt_check" CHECK ("student_roster"."verified_at" is null or "student_roster"."claimed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_cover_image" ADD CONSTRAINT "book_cover_image_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_preorder_id_preorder_id_fk" FOREIGN KEY ("preorder_id") REFERENCES "public"."preorder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_refunded_by_user_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_batch_id_preorder_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."preorder_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_fulfilled_by_user_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder" ADD CONSTRAINT "preorder_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_book" ADD CONSTRAINT "preorder_batch_book_batch_id_preorder_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."preorder_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_book" ADD CONSTRAINT "preorder_batch_book_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_book_price_tier" ADD CONSTRAINT "preorder_batch_book_price_tier_batch_book_id_preorder_batch_book_id_fk" FOREIGN KEY ("batch_book_id") REFERENCES "public"."preorder_batch_book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_staff" ADD CONSTRAINT "preorder_batch_staff_batch_id_preorder_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."preorder_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_staff" ADD CONSTRAINT "preorder_batch_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_batch_staff" ADD CONSTRAINT "preorder_batch_staff_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_item" ADD CONSTRAINT "preorder_item_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_item" ADD CONSTRAINT "preorder_item_preorderId_batchId_fk" FOREIGN KEY ("preorder_id","batch_id") REFERENCES "public"."preorder"("id","batch_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preorder_item" ADD CONSTRAINT "preorder_item_batchId_bookId_fk" FOREIGN KEY ("batch_id","book_id") REFERENCES "public"."preorder_batch_book"("batch_id","book_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_imported_by_user_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_claimed_by_user_id_user_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "book_title_idx" ON "book" USING btree ("title");--> statement-breakpoint
CREATE INDEX "book_gradeLevel_subject_idx" ON "book" USING btree ("grade_level","subject");--> statement-breakpoint
CREATE INDEX "payment_preorderId_idx" ON "payment" USING btree ("preorder_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preorder_batchId_paymentStatus_idx" ON "preorder" USING btree ("batch_id","payment_status");--> statement-breakpoint
CREATE INDEX "preorder_batchId_pickupStatus_idx" ON "preorder" USING btree ("batch_id","pickup_status");--> statement-breakpoint
CREATE INDEX "preorder_userId_idx" ON "preorder" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "preorder_batch_status_idx" ON "preorder_batch" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preorder_batch_book_bookId_idx" ON "preorder_batch_book" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preorder_batch_book_price_tier_batchBookId_minQty_uidx" ON "preorder_batch_book_price_tier" USING btree ("batch_book_id","min_quantity");--> statement-breakpoint
CREATE INDEX "preorder_batch_staff_userId_idx" ON "preorder_batch_staff" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preorder_item_preorderId_bookId_uidx" ON "preorder_item" USING btree ("preorder_id","book_id");--> statement-breakpoint
CREATE INDEX "preorder_item_bookId_idx" ON "preorder_item" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actorId_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_roster_studentId_uidx" ON "student_roster" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "student_roster_claimedByUserId_idx" ON "student_roster" USING btree ("claimed_by_user_id");