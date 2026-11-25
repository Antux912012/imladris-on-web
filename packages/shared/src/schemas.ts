// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const RoleSchema = z.enum(["OWNER", "EDITOR", "REVIEWER", "VIEWER"]);
export type Role = z.infer<typeof RoleSchema>;

export const KernelModeSchema = z.enum(["SHARED", "PERSONAL"]);
export type KernelMode = z.infer<typeof KernelModeSchema>;

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  avatarColor: z.string().min(4),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  kernelMode: KernelModeSchema,
  ownerId: z.string().min(1),
  role: RoleSchema.optional(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ExecuteEngineSchema = z.enum(["r", "python", "bash"]);
export type ExecuteEngine = z.infer<typeof ExecuteEngineSchema>;

export const ExecuteRequestSchema = z.object({
  engine: ExecuteEngineSchema,
  code: z.string(),
  chunkId: z.string().optional(),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export const ExecuteResponseSchema = z.object({
  ok: z.boolean(),
  engine: ExecuteEngineSchema,
  chunkId: z.string().optional(),
  stdout: z.string(),
  stderr: z.string(),
  plots: z.array(z.string()),
  durationMs: z.number().nonnegative(),
});
export type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;

export const EnvVariableSchema = z.object({
  name: z.string(),
  type: z.string(),
  preview: z.string(),
  isDataFrame: z.boolean(),
  rows: z.number().int().nonnegative().optional(),
  cols: z.number().int().nonnegative().optional(),
  columns: z.array(z.string()).default([]),
});
export type EnvVariable = z.infer<typeof EnvVariableSchema>;

export const ExportFormatSchema = z.enum([
  "html",
  "pdf",
  "odt",
  "odp",
  "rtf",
  "docx",
  "latex",
  "revealjs",
  "ipynb",
  "mallorn",
]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ExportRequestSchema = z.object({
  path: z.string().min(1),
  format: ExportFormatSchema,
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export const CommentMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string(),
  authorColor: z.string(),
  body: z.string(),
  createdAt: z.number(),
});
export type CommentMessage = z.infer<typeof CommentMessageSchema>;

export const CommentThreadSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  relPath: z.string(),
  anchorLine: z.number().int().min(1),
  anchorQuote: z.string(),
  resolved: z.boolean(),
  createdBy: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.number(),
  resolvedAt: z.number().nullable(),
  messages: z.array(CommentMessageSchema),
});
export type CommentThread = z.infer<typeof CommentThreadSchema>;

export const WorkspaceMemberSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  avatarColor: z.string(),
  role: RoleSchema,
  joinedAt: z.number(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const DocumentSnapshotMetaSchema = z.object({
  id: z.string(),
  relPath: z.string(),
  sha256Hash: z.string(),
  message: z.string().nullable(),
  isCheckpoint: z.boolean(),
  updatedBy: z.string().nullable(),
  updatedByName: z.string().nullable(),
  updatedAt: z.number(),
});
export type DocumentSnapshotMeta = z.infer<typeof DocumentSnapshotMetaSchema>;

export const CommunityPluginEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  author: z.string().optional(),
  entryUrl: z.string().url().optional(),
  scriptUrl: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
});
export type CommunityPluginEntry = z.infer<typeof CommunityPluginEntrySchema>;

export const WorkspaceEventSchema = z.object({
  type: z.enum([
    "stdout",
    "plot",
    "env_updated",
    "file_tree_changed",
    "member_joined",
    "comment_added",
    "comment_resolved",
    "revision_created",
  ]),
  payload: z.unknown(),
});
export type WorkspaceEvent = z.infer<typeof WorkspaceEventSchema>;
