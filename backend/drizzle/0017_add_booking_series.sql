ALTER TABLE "scheduler_bookings" ADD COLUMN "series_id" uuid;--> statement-breakpoint
CREATE INDEX "scheduler_bookings_series_id_index" ON "scheduler_bookings" USING btree ("series_id");