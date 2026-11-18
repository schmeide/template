CREATE TABLE "dashboard_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"sold_on" date NOT NULL,
	"category" varchar(100) NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handbook_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(100000) DEFAULT '' NOT NULL,
	"section" varchar(100) DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"track_reads" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" integer,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', "handbook_pages"."title"), 'A') || setweight(to_tsvector('english', "handbook_pages"."body"), 'B')) STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handbook_reads" (
	"page_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"version" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handbook_reads_page_id_person_id_pk" PRIMARY KEY("page_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "handbook_pages" ADD CONSTRAINT "handbook_pages_updated_by_id_approval_people_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_reads" ADD CONSTRAINT "handbook_reads_page_id_handbook_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."handbook_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handbook_reads" ADD CONSTRAINT "handbook_reads_person_id_approval_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_sales_sold_on_index" ON "dashboard_sales" USING btree ("sold_on");--> statement-breakpoint
CREATE INDEX "dashboard_sales_category_sold_on_index" ON "dashboard_sales" USING btree ("category","sold_on");--> statement-breakpoint
CREATE INDEX "handbook_pages_section_position_index" ON "handbook_pages" USING btree ("section","position");--> statement-breakpoint
CREATE INDEX "handbook_pages_search_index" ON "handbook_pages" USING gin ("search");