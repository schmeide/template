CREATE TABLE "membership_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"fee" integer NOT NULL,
	"months" integer,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_levels_fee_not_negative" CHECK ("membership_levels"."fee" >= 0),
	CONSTRAINT "membership_levels_months_positive" CHECK ("membership_levels"."months" > 0)
);
--> statement-breakpoint
CREATE TABLE "membership_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"level_id" integer NOT NULL,
	"level_name" varchar(100) NOT NULL,
	"fee" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_periods_ends_after_starts" CHECK ("membership_periods"."ends_on" > "membership_periods"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_level_id_membership_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."membership_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_periods_customer_id_starts_on_index" ON "membership_periods" USING btree ("customer_id","starts_on");