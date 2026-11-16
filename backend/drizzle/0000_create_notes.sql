CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"body" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
