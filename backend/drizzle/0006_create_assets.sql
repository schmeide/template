CREATE TYPE "public"."registry_status" AS ENUM('in_use', 'in_storage', 'in_repair', 'lost');--> statement-breakpoint
CREATE TABLE "registry_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"tag" varchar(100) DEFAULT '' NOT NULL,
	"category_id" integer,
	"status" "registry_status" DEFAULT 'in_use' NOT NULL,
	"owner" varchar(100) DEFAULT '' NOT NULL,
	"expires_on" date,
	"notes" varchar(2000) DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registry_records" ADD CONSTRAINT "registry_records_category_id_registry_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."registry_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registry_categories_name_key" ON "registry_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "registry_records_name_id_index" ON "registry_records" USING btree ("name","id");--> statement-breakpoint
CREATE INDEX "registry_records_expires_on_id_index" ON "registry_records" USING btree ("expires_on","id");--> statement-breakpoint
CREATE INDEX "registry_records_created_at_id_index" ON "registry_records" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "registry_records_category_id_index" ON "registry_records" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "registry_records_status_index" ON "registry_records" USING btree ("status");