CREATE TABLE "request_units" (
	"request_id" integer PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_units" ADD CONSTRAINT "request_units_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_units" ADD CONSTRAINT "request_units_record_id_registry_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."registry_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_units_record_id_index" ON "request_units" USING btree ("record_id");