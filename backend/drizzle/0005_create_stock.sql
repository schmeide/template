CREATE TYPE "public"."ledger_entry_kind" AS ENUM('in', 'out', 'adjust');--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit" varchar(20) DEFAULT '' NOT NULL,
	"floor" integer DEFAULT 0,
	"low_at" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"entry_date" date NOT NULL,
	"who" varchar(100) DEFAULT '' NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"reference" varchar(100) DEFAULT '' NOT NULL,
	"reverses" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_reverses_unique" UNIQUE("reverses"),
	CONSTRAINT "ledger_entries_quantity_not_zero" CHECK ("ledger_entries"."quantity" <> 0),
	CONSTRAINT "ledger_entries_quantity_sign" CHECK ("ledger_entries"."reverses" is not null or "ledger_entries"."kind" = 'adjust'
        or ("ledger_entries"."kind" = 'in' and "ledger_entries"."quantity" > 0)
        or ("ledger_entries"."kind" = 'out' and "ledger_entries"."quantity" < 0))
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_ledger_entries_id_fk" FOREIGN KEY ("reverses") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_account_id_entry_date_index" ON "ledger_entries" USING btree ("account_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_entry_date_index" ON "ledger_entries" USING btree ("entry_date");