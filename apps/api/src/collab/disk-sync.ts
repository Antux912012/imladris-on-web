// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import * as Y from "yjs";
import type { AppDb } from "../db/client.js";
import { documentSnapshots } from "../db/schema.js";
import { resolveSafeWorkspacePath } from "../routes/files.js";
import type { WorkspaceEventBus } from "../ws/events.js";

export function sha256Hex(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function loadDocumentToYDoc(
  db: AppDb,
  workspacesRoot: string,
  workspaceId: string,
  relPath: string,
  doc: Y.Doc
): Promise<void> {
  const { targetPath } = resolveSafeWorkspacePath(workspacesRoot, workspaceId, relPath);

  let diskText: string | null = null;
  try {
    diskText = await fs.readFile(targetPath, "utf8");
  } catch {
    diskText = null;
  }

  const [latest] = await db
    .select()
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.workspaceId, workspaceId),
        eq(documentSnapshots.relPath, relPath)
      )
    )
    .orderBy(desc(documentSnapshots.updatedAt))
    .limit(1);

  if (latest) {
    const diskHash = diskText !== null ? sha256Hex(diskText) : null;
    if (diskHash === null || diskHash === latest.sha256Hash) {
      Y.applyUpdate(doc, new Uint8Array(latest.yjsState));
      return;
    }
  }

  if (diskText !== null) {
    const yText = doc.getText("codemirror");
    if (yText.toString() !== diskText) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, diskText);
      });
    }
  }
}

export async function persistYDocToDiskAndSnapshot(
  db: AppDb,
  workspacesRoot: string,
  workspaceId: string,
  relPath: string,
  doc: Y.Doc,
  updatedBy: string | null,
  bus?: WorkspaceEventBus
): Promise<void> {
  const { targetPath } = resolveSafeWorkspacePath(workspacesRoot, workspaceId, relPath);
  const content = doc.getText("codemirror").toString();
  const hash = sha256Hex(content);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.imladris-tmp-${crypto.randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, targetPath);

  const [latest] = await db
    .select({ sha256Hash: documentSnapshots.sha256Hash })
    .from(documentSnapshots)
    .where(
      and(
        eq(documentSnapshots.workspaceId, workspaceId),
        eq(documentSnapshots.relPath, relPath)
      )
    )
    .orderBy(desc(documentSnapshots.updatedAt))
    .limit(1);

  if (!latest || latest.sha256Hash !== hash) {
    await db.insert(documentSnapshots).values({
      id: crypto.randomUUID(),
      workspaceId,
      relPath,
      yjsState: state,
      sha256Hash: hash,
      message: null,
      isCheckpoint: false,
      updatedBy,
      updatedAt: Date.now(),
    });
  }

  bus?.publish(workspaceId, {
    type: "file_tree_changed",
    payload: { relPath },
  });
}
