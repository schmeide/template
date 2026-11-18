CREATE TYPE "public"."catalog_order_status" AS ENUM('new', 'accepted', 'ready', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TABLE "catalog_counter" (
	"id" integer PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"position" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "catalog_order_lines_order_id_position_unique" UNIQUE("order_id","position"),
	CONSTRAINT "catalog_order_lines_quantity_positive" CHECK ("catalog_order_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"status" "catalog_order_status" DEFAULT 'new' NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(50) DEFAULT '' NOT NULL,
	"address" varchar(1000) NOT NULL,
	"notes" varchar(2000) DEFAULT '' NOT NULL,
	"currency" char(3) NOT NULL,
	"subtotal" integer NOT NULL,
	"tax" integer NOT NULL,
	"total" integer NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "catalog_orders_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(2000) DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"tax_rate" integer DEFAULT 0 NOT NULL,
	"image_url" varchar(2000) DEFAULT '' NOT NULL,
	"category" varchar(100) DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_products_price_not_negative" CHECK ("catalog_products"."price" >= 0),
	CONSTRAINT "catalog_products_tax_rate_range" CHECK ("catalog_products"."tax_rate" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "catalog_order_lines" ADD CONSTRAINT "catalog_order_lines_order_id_catalog_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."catalog_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_order_lines" ADD CONSTRAINT "catalog_order_lines_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_orders_status_index" ON "catalog_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_products_category_index" ON "catalog_products" USING btree ("category");