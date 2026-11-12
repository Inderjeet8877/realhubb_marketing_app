CREATE TABLE "whatsapp_connections" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"waba_id" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text NOT NULL,
	"verified_name" text,
	"quality_rating" text,
	"access_token_enc" text NOT NULL,
	"connected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_phone_idx" ON "whatsapp_connections" USING btree ("phone_number_id");--> statement-breakpoint
-- RLS: a workspace sees only its own connection; admin APIs use system context.
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "whatsapp_connections"
  USING (tenant_id = app_tenant_id() OR app_is_system())
  WITH CHECK (tenant_id = app_tenant_id() OR app_is_system());
