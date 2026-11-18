CREATE TABLE "deal_accounts" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "deal_accounts" ADD CONSTRAINT "deal_accounts_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_accounts" ADD CONSTRAINT "deal_accounts_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;