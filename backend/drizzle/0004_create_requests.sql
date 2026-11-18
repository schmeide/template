CREATE TYPE "public"."approval_request_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'returned', 'withdrawn');--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"actor_id" integer,
	"outcome" "approval_request_status" NOT NULL,
	"comment" varchar(2000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "approval_people_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"type_id" integer NOT NULL,
	"submitter_id" integer,
	"contact" varchar(200) DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"status" "approval_request_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "approval_requests_who" CHECK ("approval_requests"."submitter_id" is not null or "approval_requests"."contact" <> '')
);
--> statement-breakpoint
CREATE TABLE "approval_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"fields" jsonb NOT NULL,
	"approver_id" integer,
	"public_token" uuid,
	CONSTRAINT "approval_types_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_id_approval_people_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_type_id_approval_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."approval_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_submitter_id_approval_people_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_types" ADD CONSTRAINT "approval_types_approver_id_approval_people_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."approval_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_decisions_request_id_index" ON "approval_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "approval_requests_status_index" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_requests_submitter_id_index" ON "approval_requests" USING btree ("submitter_id");