CREATE TYPE "public"."document_status" AS ENUM('draft', 'sent', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('invoice');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank transfer', 'card', 'cash', 'check', 'other');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"phone" varchar(50) DEFAULT '' NOT NULL,
	"address" varchar(1000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"type" "document_type" PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"position" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_rate" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_lines_document_id_position_unique" UNIQUE("document_id","position"),
	CONSTRAINT "document_lines_quantity_positive" CHECK ("document_lines"."quantity" > 0),
	CONSTRAINT "document_lines_tax_rate_range" CHECK ("document_lines"."tax_rate" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "document_type" NOT NULL,
	"number" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"notes" varchar(2000) DEFAULT '' NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"share_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "documents_type_number_unique" UNIQUE("type","number"),
	CONSTRAINT "documents_due_after_issue" CHECK ("documents"."due_date" >= "documents"."issue_date")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;