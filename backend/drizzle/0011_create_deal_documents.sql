CREATE TABLE "deal_documents" (
	"item_id" integer NOT NULL,
	"document_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_documents_item_id_index" ON "deal_documents" USING btree ("item_id");