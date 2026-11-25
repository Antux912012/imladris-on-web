// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import type { AppDb } from "../db/client.js";
import { auditEvents } from "../db/schema.js";

export async function recordAuditEvent(
  db: AppDb,
  params: {
    workspaceId?: string | null;
    userId?: string | null;
    action: string;
    targetPath?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      targetPath: params.targetPath ?? null,
      payloadJson: JSON.stringify(params.payload ?? {}),
      createdAt: Date.now(),
    });
  } catch {
    // Non-fatal: audit write should not crash caller if DB is closing in tests
  }
}
