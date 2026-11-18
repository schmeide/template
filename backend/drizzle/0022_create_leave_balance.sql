CREATE TABLE "leave_accounts" (
	"person_id" integer NOT NULL,
	"kind" varchar(100) NOT NULL,
	"account_id" integer NOT NULL,
	CONSTRAINT "leave_accounts_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "leave_accounts_person_id_kind_unique" UNIQUE("person_id","kind")
);
--> statement-breakpoint
CREATE TABLE "leave_postings" (
	"request_id" integer NOT NULL,
	"entry_id" integer NOT NULL,
	CONSTRAINT "leave_postings_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "leave_postings_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
ALTER TABLE "leave_accounts" ADD CONSTRAINT "leave_accounts_person_id_approval_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_accounts" ADD CONSTRAINT "leave_accounts_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_postings" ADD CONSTRAINT "leave_postings_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_postings" ADD CONSTRAINT "leave_postings_entry_id_ledger_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;