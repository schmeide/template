CREATE TYPE "public"."lease_rent_period" AS ENUM('monthly', 'weekly');--> statement-breakpoint
CREATE TABLE "leases" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"first_day" date NOT NULL,
	"last_day" date,
	"rent" integer NOT NULL,
	"rent_period" "lease_rent_period" DEFAULT 'monthly' NOT NULL,
	"deposit" integer DEFAULT 0 NOT NULL,
	"notes" varchar(2000) DEFAULT '' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_last_day_after_first" CHECK ("leases"."last_day" >= "leases"."first_day"),
	CONSTRAINT "leases_rent_not_negative" CHECK ("leases"."rent" >= 0),
	CONSTRAINT "leases_deposit_not_negative" CHECK ("leases"."deposit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_record_id_registry_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."registry_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leases_record_id_first_day_index" ON "leases" USING btree ("record_id","first_day");--> statement-breakpoint
CREATE INDEX "leases_customer_id_index" ON "leases" USING btree ("customer_id");