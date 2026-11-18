CREATE TABLE "customer_intakes" (
	"token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"request_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_intakes_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "customer_intakes" ADD CONSTRAINT "customer_intakes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_intakes" ADD CONSTRAINT "customer_intakes_type_id_approval_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."approval_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_intakes" ADD CONSTRAINT "customer_intakes_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_intakes_customer_id_index" ON "customer_intakes" USING btree ("customer_id");