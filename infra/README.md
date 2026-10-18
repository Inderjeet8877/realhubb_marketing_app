# Broadzen local stack (Docker + nginx + Postgres)

Plan and security design: [PLAN.md](PLAN.md).

```
browser / Flutter app ──▶ nginx :80 ──▶ app (Next.js :3000) ──▶ postgres:16 (volume pgdata)
                                          ▲ migrate (one-shot: migrations + admin seed)
adminer (dev only) 127.0.0.1:8081 ──────────────────────────────▶ postgres
```

## First run
1. Start **Docker Desktop**.
2. `infra/.env` must exist. It is generated with random secrets and is **git-ignored**. To recreate it, copy `.env.example` and fill in the values.
3. Start the stack:
   ```powershell
   cd infra
   docker compose up -d --build
   docker compose logs migrate      # first run prints the generated admin password once
   ```
4. Open **http://localhost**. The admin panel is at **http://localhost/admin** (milestone B3).

## Everyday commands (run in `infra/`)
| Task | Command |
|---|---|
| Start / stop | `docker compose up -d` / `docker compose down` |
| Rebuild the app after code changes | `docker compose up -d --build app` |
| Logs | `docker compose logs -f app` (or `nginx`, `postgres`, `migrate`) |
| Status | `docker compose ps` |
| DB browser | `docker compose --profile dev up -d adminer`, then http://127.0.0.1:8081 (server `postgres`, user `broadzen_owner`, db `broadzen`) |
| psql shell | `docker compose exec postgres psql -U broadzen_owner -d broadzen` |
| **Isolation test** (proves workspaces can't see each other) | `docker compose run --rm migrate node scripts/test-isolation.mjs` |
| **Auth/admin end-to-end test** (sign-up → approval → isolation → lockout → CSRF, 37 checks) | `docker run --rm --network broadzen_default -e BASE=http://app:3000 -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... -v "<repo>/scripts:/s:ro" node:22-alpine node /s/test-auth-flow.mjs` |
| New migration (after editing `src/server/db/schema.ts`, run in repo root) | `npx drizzle-kit generate --name <change>`, then `docker compose up -d --build migrate app` |
| Backup | `sh scripts/backup.sh` → `infra/backups/*.sql.gz` (keeps 14) |
| Restore | `gunzip -c backups/<file>.sql.gz \| docker compose exec -T postgres psql -U broadzen_owner -d broadzen` |
| **Reset everything (deletes all data)** | `docker compose down -v` |

## Ports
| Port | Use |
|---|---|
| `80` | nginx (the only public entry) |
| `127.0.0.1:15432` | Postgres, localhost only. 5432 is taken by another Postgres on this PC, and Windows reserves 49xxx–55xxx |
| `127.0.0.1:8081` | Adminer (dev profile only) |

## Known local limitation
On Docker Desktop (Windows/Mac), nginx sees the Docker gateway (e.g. `172.18.0.1`) as the client, so **Login activity shows that IP locally**, and the per-IP rate limits apply to all local traffic together. On a Linux VPS nginx sees real client IPs. If you put a CDN or load balancer in front, configure `set_real_ip_from` + `real_ip_header` in `nginx.conf`.

## Security notes
- **Database roles:** the app connects as **`broadzen_app`**. It isn't superuser, isn't a table owner and has no BYPASSRLS, so Row-Level Security always applies. Migrations run as `broadzen_owner`.
- **Rate limits:** nginx limits `/api/auth/*` (10/min per IP) and the public enquiry form (5/min per IP).
- **Secrets:** only in `infra/.env` and the repo-root `.env.local`, both git-ignored. `.dockerignore` keeps them out of images.
- **Production checklist:**
  - add the TLS server block in `nginx/nginx.conf` (certbot);
  - set `COOKIE_SECURE=true`;
  - use strong unique secrets;
  - schedule `scripts/backup.sh` and copy the backups off-site;
  - remove the `127.0.0.1:15432` port mapping if you don't need it.

## Flutter app → local stack
Android emulator: `flutter run --dart-define=API_BASE=http://10.0.2.2`. `10.0.2.2` is the host machine as seen from the emulator; plain HTTP is allowed in debug builds only.
