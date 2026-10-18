#!/bin/sh
# Runs once, when the Postgres volume is first created.
# broadzen_owner (POSTGRES_USER) owns the schema and runs migrations.
# broadzen_app is what the web app connects as: no superuser, no BYPASSRLS,
# not a table owner, so Row-Level Security always applies to it.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE broadzen_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO broadzen_app;
GRANT USAGE ON SCHEMA public TO broadzen_app;
-- Tables/sequences/functions created later by migrations (as the owner) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO broadzen_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO broadzen_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO broadzen_app;
SQL
