CREATE TYPE "public"."pipeline_activity_kind" AS ENUM('note', 'stage');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage_outcome" AS ENUM('won', 'lost');--> statement-breakpoint
CREATE TABLE "pipeline_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"kind" "pipeline_activity_kind" NOT NULL,
	"text" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"stage_id" integer NOT NULL,
	"position" integer NOT NULL,
	"owner" varchar(100) DEFAULT '' NOT NULL,
	"value" integer,
	"due_date" date,
	"customer_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_items_value_not_negative" CHECK ("pipeline_items"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" integer NOT NULL,
	"outcome" "pipeline_stage_outcome"
);
--> statement-breakpoint
ALTER TABLE "pipeline_activity" ADD CONSTRAINT "pipeline_activity_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_items_stage_id_position_index" ON "pipeline_items" USING btree ("stage_id","position");