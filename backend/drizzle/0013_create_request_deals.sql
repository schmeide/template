CREATE TABLE "request_deals" (
	"request_id" integer PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_deals_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "request_deals" ADD CONSTRAINT "request_deals_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_deals" ADD CONSTRAINT "request_deals_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE no action ON UPDATE no action;