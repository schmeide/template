CREATE TABLE "order_stock_issues" (
	"order_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_stock_items" (
	"product_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_stock_items_product_id_account_id_unique" UNIQUE("product_id","account_id"),
	CONSTRAINT "order_stock_items_quantity_positive" CHECK ("order_stock_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_stock_issues" ADD CONSTRAINT "order_stock_issues_order_id_catalog_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."catalog_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_items" ADD CONSTRAINT "order_stock_items_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stock_items" ADD CONSTRAINT "order_stock_items_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;