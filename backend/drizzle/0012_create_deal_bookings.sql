CREATE TABLE "deal_bookings" (
	"item_id" integer NOT NULL,
	"booking_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_bookings" ADD CONSTRAINT "deal_bookings_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_bookings" ADD CONSTRAINT "deal_bookings_booking_id_scheduler_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."scheduler_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_bookings_item_id_index" ON "deal_bookings" USING btree ("item_id");