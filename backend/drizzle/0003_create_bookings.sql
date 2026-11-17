CREATE TYPE "public"."scheduler_booking_status" AS ENUM('booked', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "scheduler_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "scheduler_availability_weekday" CHECK ("scheduler_availability"."weekday" between 0 and 6),
	CONSTRAINT "scheduler_availability_order" CHECK ("scheduler_availability"."start_time" < "scheduler_availability"."end_time")
);
--> statement-breakpoint
CREATE TABLE "scheduler_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "scheduler_booking_status" DEFAULT 'booked' NOT NULL,
	"seat" integer NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduler_bookings_order" CHECK ("scheduler_bookings"."starts_at" < "scheduler_bookings"."ends_at"),
	CONSTRAINT "scheduler_bookings_seat" CHECK ("scheduler_bookings"."seat" between 1 and "scheduler_bookings"."capacity")
);
--> statement-breakpoint
CREATE TABLE "scheduler_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	CONSTRAINT "scheduler_exceptions_hours" CHECK (("scheduler_exceptions"."start_time" is null and "scheduler_exceptions"."end_time" is null) or coalesce("scheduler_exceptions"."start_time" < "scheduler_exceptions"."end_time", false))
);
--> statement-breakpoint
CREATE TABLE "scheduler_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(100) DEFAULT '' NOT NULL,
	"time_zone" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "scheduler_services_duration" CHECK ("scheduler_services"."duration_minutes" between 1 and 1440),
	CONSTRAINT "scheduler_services_buffer" CHECK ("scheduler_services"."buffer_minutes" between 0 and 1440),
	CONSTRAINT "scheduler_services_capacity" CHECK ("scheduler_services"."capacity" >= 1)
);
--> statement-breakpoint
ALTER TABLE "scheduler_availability" ADD CONSTRAINT "scheduler_availability_resource_id_scheduler_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."scheduler_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_bookings" ADD CONSTRAINT "scheduler_bookings_resource_id_scheduler_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."scheduler_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_bookings" ADD CONSTRAINT "scheduler_bookings_service_id_scheduler_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."scheduler_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_bookings" ADD CONSTRAINT "scheduler_bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduler_exceptions" ADD CONSTRAINT "scheduler_exceptions_resource_id_scheduler_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."scheduler_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduler_availability_resource_id_index" ON "scheduler_availability" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "scheduler_bookings_resource_id_starts_at_index" ON "scheduler_bookings" USING btree ("resource_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_bookings_one_per_seat" ON "scheduler_bookings" USING btree ("resource_id","starts_at","seat") WHERE "scheduler_bookings"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "scheduler_exceptions_resource_id_date_index" ON "scheduler_exceptions" USING btree ("resource_id","date");