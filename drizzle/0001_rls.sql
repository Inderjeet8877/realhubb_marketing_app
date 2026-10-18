-- Row-Level Security (infra/PLAN.md §2, layer 3).
-- The app connects as broadzen_app, which is NOT the table owner and has no
-- BYPASSRLS, so these policies always apply to it. Each request sets, inside
-- its transaction:
--   app.tenant_id = '<uuid>'  → workspace-scoped access (normal user requests)
--   app.system    = 'on'      → server-only auth/admin code paths (never set from request input)
-- With neither set, every policy below evaluates to false: deny by default.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;
--> statement-breakpoint

-- Workspace tables: visible only inside their own workspace (or to system code).
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenants"
  USING (id = app_tenant_id() OR app_is_system())
  WITH CHECK (id = app_tenant_id() OR app_is_system());
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "users"
  USING (tenant_id = app_tenant_id() OR app_is_system())
  WITH CHECK (tenant_id = app_tenant_id() OR app_is_system());
--> statement-breakpoint

-- Platform tables: system code only (auth flows, admin APIs after a platform-admin check).
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON "sessions" USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON "login_attempts" USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON "enquiries" USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON "audit_log" USING (app_is_system()) WITH CHECK (app_is_system());
