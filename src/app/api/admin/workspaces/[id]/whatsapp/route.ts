import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withSystem } from '@/server/db';
import { auditLog, tenants, whatsappConnections } from '@/server/db/schema';
import { assertUuid, AuthError, parseBody, requireAdmin, route } from '@/server/auth/core';
import { encryptSecret } from '@/server/crypto';
import { verifyWhatsAppNumber } from '@/server/whatsapp';

type Ctx = { params: Promise<{ id: string }> };

const metaId = (label: string) => z.string().trim().regex(/^\d{5,25}$/, `${label} is the long number from Meta, digits only.`);
const Body = z.object({
  wabaId: metaId('WhatsApp Business Account ID'),
  phoneNumberId: metaId('Phone number ID'),
  accessToken: z.string().trim().min(20, 'Paste the full access token.').max(1000).regex(/^\S+$/, 'The access token cannot contain spaces.'),
});

/** Connects (or replaces) a workspace's WhatsApp number after Meta confirms the details. The token is stored encrypted. */
export const PUT = route(async (req, { params }: Ctx) => {
  const admin = await requireAdmin(req);
  const tenantId = assertUuid((await params).id);
  const b = await parseBody(req, Body);

  const [t] = await withSystem((tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)));
  if (!t) throw new AuthError(404, 'not_found', 'Workspace not found.');

  const n = await verifyWhatsAppNumber(b.wabaId, b.phoneNumberId, b.accessToken);
  const row = { wabaId: b.wabaId, phoneNumberId: b.phoneNumberId, ...n, accessTokenEnc: encryptSecret(b.accessToken), connectedBy: admin.userId, connectedAt: new Date() };

  await withSystem(async (tx) => {
    const [taken] = await tx
      .select({ id: whatsappConnections.tenantId })
      .from(whatsappConnections)
      .where(and(eq(whatsappConnections.phoneNumberId, b.phoneNumberId), ne(whatsappConnections.tenantId, tenantId)));
    if (taken) throw new AuthError(409, 'number_taken', 'This number is already connected to another workspace.');
    await tx.insert(whatsappConnections).values({ tenantId, ...row }).onConflictDoUpdate({ target: whatsappConnections.tenantId, set: row });
    await tx.insert(auditLog).values({ actorUserId: admin.userId, tenantId, action: 'whatsapp.connected', target: n.displayPhone });
  });
  return NextResponse.json({ whatsapp: n });
});

/** Disconnects the workspace's number and deletes the stored token. */
export const DELETE = route(async (req, { params }: Ctx) => {
  const admin = await requireAdmin(req);
  const tenantId = assertUuid((await params).id);
  await withSystem(async (tx) => {
    const [gone] = await tx
      .delete(whatsappConnections)
      .where(eq(whatsappConnections.tenantId, tenantId))
      .returning({ displayPhone: whatsappConnections.displayPhone });
    if (gone) await tx.insert(auditLog).values({ actorUserId: admin.userId, tenantId, action: 'whatsapp.disconnected', target: gone.displayPhone });
  });
  return NextResponse.json({ ok: true });
});
