// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import {
  blob,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarColor: text("avatar_color").notNull(),
  systemRole: text("system_role").notNull().default("USER"),
  accessLevel: text("access_level").notNull().default("FULL"),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  authProvider: text("auth_provider").notNull().default("local"),
  externalSubject: text("external_subject"),
  createdAt: integer("created_at").notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kernelMode: text("kernel_mode").notNull().default("SHARED"),
  toolchainId: text("toolchain_id"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]
);

export const documentSnapshots = sqliteTable("document_snapshots", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  relPath: text("rel_path").notNull(),
  yjsState: blob("yjs_state", { mode: "buffer" }).notNull(),
  sha256Hash: text("sha256_hash").notNull(),
  message: text("message"),
  isCheckpoint: integer("is_checkpoint", { mode: "boolean" }).notNull().default(false),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at").notNull(),
});

export const commentThreads = sqliteTable("comment_threads", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  relPath: text("rel_path").notNull(),
  anchorLine: integer("anchor_line").notNull().default(1),
  anchorQuote: text("anchor_quote").notNull().default(""),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
});

export const commentMessages = sqliteTable("comment_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => commentThreads.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const inviteTokens = sqliteTable("invite_tokens", {
  token: text("token").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  expiresAt: integer("expires_at").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetPath: text("target_path"),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const ssoProviders = sqliteTable("sso_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  protocol: text("protocol").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  issuerUrl: text("issuer_url").notNull().default(""),
  clientId: text("client_id").notNull().default(""),
  clientSecret: text("client_secret").notNull().default(""),
  scopes: text("scopes").notNull().default("openid profile email"),
  roleMappingJson: text("role_mapping_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const toolchainProfiles = sqliteTable("toolchain_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  language: text("language").notNull(),
  imageRef: text("image_ref").notNull(),
  packagesJson: text("packages_json").notNull().default("[]"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const electronicSignatures = sqliteTable("electronic_signatures", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  relPath: text("rel_path").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  meaning: text("meaning").notNull(),
  reason: text("reason").notNull().default(""),
  sha256Hash: text("sha256_hash").notNull(),
  signatureHash: text("signature_hash").notNull(),
  signedAt: integer("signed_at").notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  term: text("term").notNull(),
  instructorId: text("instructor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateWorkspaceId: text("template_workspace_id").references(
    () => workspaces.id,
    { onDelete: "set null" }
  ),
  ltiContextId: text("lti_context_id"),
  createdAt: integer("created_at").notNull(),
});

export const courseEnrollments = sqliteTable(
  "course_enrollments",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("STUDENT"),
    enrolledAt: integer("enrolled_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.courseId, table.userId] })]
);

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instructions: text("instructions").notNull().default(""),
  dueAt: integer("due_at"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const assignmentSubmissions = sqliteTable("assignment_submissions", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => assignments.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("IN_PROGRESS"),
  grade: text("grade"),
  feedback: text("feedback"),
  snapshotHash: text("snapshot_hash"),
  submittedAt: integer("submitted_at"),
});
