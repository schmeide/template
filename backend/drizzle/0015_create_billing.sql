CREATE TABLE "billed_entries" (
	"entry_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billed_entries_entry_id_document_id_pk" PRIMARY KEY("entry_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"account_id" integer PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"rate" integer NOT NULL,
	CONSTRAINT "billing_accounts_rate_not_negative" CHECK ("billing_accounts"."rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "billed_entries" ADD CONSTRAINT "billed_entries_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billed_entries" ADD CONSTRAINT "billed_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billed_entries_document_id_index" ON "billed_entries" USING btree ("document_id");