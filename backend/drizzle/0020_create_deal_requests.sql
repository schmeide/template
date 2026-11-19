CREATE TABLE "deal_requests" (
	"item_id" integer NOT NULL,
	"request_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_requests" ADD CONSTRAINT "deal_requests_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_requests" ADD CONSTRAINT "deal_requests_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_requests_item_id_index" ON "deal_requests" USING btree ("item_id");