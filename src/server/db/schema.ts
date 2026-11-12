// Broadzen Postgres schema (infra/PLAN.md §3).
// Workspace-owned tables carry tenant_id and are protected by Row-Level
// Security (see drizzle/*_rls.sql). Platform tables (login_attempts,
// enquiries, audit_log) are only reachable through admin APIs.
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const tenantStatus = pgEnum('tenant_status', ['pending', 'active', 'suspended', 'rejected']);
export const userStatus = pgEnum('user_status', ['pending', 'approved', 'rejected', 'suspended']);
export const userRole = pgEnum('user_role', ['owner', 'admin', 'agent']);
export const loginMethod = pgEnum('login_method', ['password', 'google']);
export const loginResult = pgEnum('login_result', [
  'ok',
  'bad_password',
  'no_account',
  'pending',
  'rejected',
  'suspended',
  'locked',
]);
export const enquiryStatus = pgEnum('enquiry_status', ['new', 'contacted', 'invited', 'closed']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: tenantStatus('status').notNull().default('pending'),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    googleSub: text('google_sub'),
    role: userRole('role').notNull().default('owner'),
    status: userStatus('status').notNull().default('pending'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Emails are unique case-insensitively across the whole platform.
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    uniqueIndex('users_google_sub_uq').on(t.googleSub),
    index('users_tenant_idx').on(t.tenantId),
    index('users_status_idx').on(t.status),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    device: text('device'),
    ip: inet('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.refreshTokenHash), index('sessions_user_idx').on(t.userId)],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    method: loginMethod('method').notNull(),
    result: loginResult('result').notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('login_attempts_created_idx').on(t.createdAt),
    index('login_attempts_email_created_idx').on(sql`lower(${t.email})`, t.createdAt),
  ],
);

export const enquiries = pgTable(
  'enquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    company: text('company'),
    message: text('message'),
    status: enquiryStatus('status').notNull().default('new'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('enquiries_created_idx').on(t.createdAt), index('enquiries_status_idx').on(t.status)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

/** One WhatsApp Business number per workspace, connected by a platform admin (B5 part 1). */
export const whatsappConnections = pgTable(
  'whatsapp_connections',
  {
    tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
    wabaId: text('waba_id').notNull(),
    phoneNumberId: text('phone_number_id').notNull(),
    displayPhone: text('display_phone').notNull(),
    verifiedName: text('verified_name'),
    qualityRating: text('quality_rating'),
    /** AES-256-GCM, see src/server/crypto.ts. Never returned by any API. */
    accessTokenEnc: text('access_token_enc').notNull(),
    connectedBy: uuid('connected_by').references(() => users.id, { onDelete: 'set null' }),
    connectedAt: createdAt(),
  },
  (t) => [uniqueIndex('whatsapp_connections_phone_idx').on(t.phoneNumberId)],
);
