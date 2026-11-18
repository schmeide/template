CREATE TABLE "document_conversions" (
	"quote_id" integer PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_conversions_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
ALTER TABLE "document_conversions" ADD CONSTRAINT "document_conversions_quote_id_documents_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_conversions" ADD CONSTRAINT "document_conversions_invoice_id_documents_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;