CREATE TABLE "registry_attachments" (
	"file_id" integer PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registry_attachments" ADD CONSTRAINT "registry_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_attachments" ADD CONSTRAINT "registry_attachments_record_id_registry_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."registry_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registry_attachments_record_id_index" ON "registry_attachments" USING btree ("record_id");