CREATE TABLE "directory_entries" (
	"person_id" integer NOT NULL,
	"email" varchar(200) DEFAULT '' NOT NULL,
	"phone" varchar(50) DEFAULT '' NOT NULL,
	"job_title" varchar(100) DEFAULT '' NOT NULL,
	"team" varchar(100) DEFAULT '' NOT NULL,
	"starts_on" date,
	"leaves_on" date,
	"notes" varchar(2000) DEFAULT '' NOT NULL,
	CONSTRAINT "directory_entries_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
ALTER TABLE "directory_entries" ADD CONSTRAINT "directory_entries_person_id_approval_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."approval_people"("id") ON DELETE no action ON UPDATE no action;