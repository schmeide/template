CREATE TABLE "period_invoices" (
	"document_id" integer PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "period_invoices" ADD CONSTRAINT "period_invoices_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_invoices" ADD CONSTRAINT "period_invoices_period_id_membership_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."membership_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "period_invoices_period_id_index" ON "period_invoices" USING btree ("period_id");