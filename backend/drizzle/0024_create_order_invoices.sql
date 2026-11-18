CREATE TABLE "order_invoices" (
	"order_id" integer NOT NULL,
	"document_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_order_id_catalog_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."catalog_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_invoices_order_id_index" ON "order_invoices" USING btree ("order_id");