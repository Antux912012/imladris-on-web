// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import {
  assignments,
  assignmentSubmissions,
  courseEnrollments,
  courses,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema.js";
import { hashPassword } from "../auth/password.js";
import { requireAuth } from "../auth/rbac.js";
import { recordAuditEvent } from "../audit/logger.js";

const CreateCourseBody = z.object({
  code: z.string().min(1).max(32),
  title: z.string().min(1).max(160),
  term: z.string().min(1).max(64).default("Fall 2026"),
  templateWorkspaceId: z.string().min(1).optional(),
  ltiContextId: z.string().max(120).optional(),
});

const SyncRosterBody = z.object({
  members: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(1).max(80),
        role: z.enum(["INSTRUCTOR", "TA", "STUDENT"]).default("STUDENT"),
      })
    )
    .min(1)
    .max(500),
});

const CreateAssignmentBody = z.object({
  title: z.string().min(1).max(160),
  instructions: z.string().max(4000).default(""),
  dueAt: z.number().int().positive().optional(),
});

const GradeSubmissionBody = z.object({
  grade: z.string().min(1).max(32),
  feedback: z.string().max(2000).default(""),
});

const LtiLaunchBody = z.object({
  contextId: z.string().min(1).max(120),
  contextTitle: z.string().min(1).max(160).optional(),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  role: z.enum(["INSTRUCTOR", "TA", "STUDENT"]).default("STUDENT"),
});

async function copyWorkspaceFiles(
  workspacesRoot: string,
  sourceWorkspaceId: string | null,
  targetWorkspaceId: string,
  fallbackTitle: string
): Promise<void> {
  const targetDir = path.join(workspacesRoot, targetWorkspaceId);
  await fs.mkdir(targetDir, { recursive: true });
  if (sourceWorkspaceId) {
    const sourceDir = path.join(workspacesRoot, sourceWorkspaceId);
    try {
      await fs.cp(sourceDir, targetDir, { recursive: true });
      return;
    } catch {
      // Fall through to starter template
    }
  }
  await fs.writeFile(
    path.join(targetDir, "assignment.qmd"),
    `---\ntitle: "${fallbackTitle}"\nformat: html\n---\n\n# Assignment\n\nWrite your analysis below.\n`,
    "utf8"
  );
}

async function computeWorkspaceHash(dir: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ent.isFile()) {
        const data = await fs.readFile(path.join(dir, ent.name));
        hash.update(ent.name);
        hash.update(data);
      }
    }
  } catch {
    // Empty workspace
  }
  return hash.digest("hex");
}

export async function registerClassroomRoutes(
  app: FastifyInstance,
  db: AppDb,
  config: AppConfig
): Promise<void> {
  app.get("/api/classroom/courses", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    if (user.systemRole === "ADMIN") {
      const allCourses = await db
        .select()
        .from(courses)
        .orderBy(desc(courses.createdAt));
      return reply.send({
        courses: allCourses.map((c) => ({ ...c, myRole: "INSTRUCTOR" })),
      });
    }

    const rows = await db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        term: courses.term,
        instructorId: courses.instructorId,
        templateWorkspaceId: courses.templateWorkspaceId,
        ltiContextId: courses.ltiContextId,
        createdAt: courses.createdAt,
        myRole: courseEnrollments.role,
      })
      .from(courseEnrollments)
      .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
      .where(eq(courseEnrollments.userId, user.id))
      .orderBy(desc(courses.createdAt));

    return reply.send({ courses: rows });
  });

  app.post("/api/classroom/courses", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;
    if (user.systemRole !== "ADMIN" && user.accessLevel !== "FULL") {
      return reply.code(403).send({ error: "Insufficient access level to create courses" });
    }

    const parsed = CreateCourseBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid course payload" });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    await db.insert(courses).values({
      id,
      code: parsed.data.code.trim(),
      title: parsed.data.title.trim(),
      term: parsed.data.term.trim(),
      instructorId: user.id,
      templateWorkspaceId: parsed.data.templateWorkspaceId ?? null,
      ltiContextId: parsed.data.ltiContextId ?? null,
      createdAt: now,
    });
    await db.insert(courseEnrollments).values({
      courseId: id,
      userId: user.id,
      role: "INSTRUCTOR",
      enrolledAt: now,
    });
    await recordAuditEvent(db, {
      workspaceId: parsed.data.templateWorkspaceId ?? null,
      userId: user.id,
      action: "course_created",
      targetPath: id,
      payload: { code: parsed.data.code, title: parsed.data.title },
    });

    return reply.code(201).send({
      course: {
        id,
        code: parsed.data.code.trim(),
        title: parsed.data.title.trim(),
        term: parsed.data.term.trim(),
        instructorId: user.id,
        templateWorkspaceId: parsed.data.templateWorkspaceId ?? null,
        ltiContextId: parsed.data.ltiContextId ?? null,
        createdAt: now,
        myRole: "INSTRUCTOR",
      },
    });
  });

  app.post<{ Params: { courseId: string } }>(
    "/api/classroom/courses/:courseId/roster",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const [enrollment] = await db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, req.params.courseId),
            eq(courseEnrollments.userId, user.id)
          )
        )
        .limit(1);

      if (
        user.systemRole !== "ADMIN" &&
        enrollment?.role !== "INSTRUCTOR" &&
        enrollment?.role !== "TA"
      ) {
        return reply.code(403).send({ error: "Instructor or Admin access required" });
      }

      const parsed = SyncRosterBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid roster payload" });
      }

      const now = Date.now();
      let enrolled = 0;
      for (const member of parsed.data.members) {
        const email = member.email.trim().toLowerCase();
        let [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!u) {
          const newId = crypto.randomUUID();
          const passwordHash = await hashPassword(crypto.randomBytes(18).toString("hex"));
          await db.insert(users).values({
            id: newId,
            email,
            displayName: member.displayName.trim(),
            passwordHash,
            avatarColor: "#26a269",
            systemRole: "USER",
            accessLevel: member.role === "STUDENT" ? "EDITOR" : "FULL",
            disabled: false,
            authProvider: "local",
            createdAt: now,
          });
          u = { id: newId };
        }
        await db
          .insert(courseEnrollments)
          .values({
            courseId: req.params.courseId,
            userId: u.id,
            role: member.role,
            enrolledAt: now,
          })
          .onConflictDoUpdate({
            target: [courseEnrollments.courseId, courseEnrollments.userId],
            set: { role: member.role },
          });
        enrolled += 1;
      }

      return reply.send({ enrolled });
    }
  );

  app.get<{ Params: { courseId: string } }>(
    "/api/classroom/courses/:courseId/assignments",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const list = await db
        .select()
        .from(assignments)
        .where(eq(assignments.courseId, req.params.courseId))
        .orderBy(desc(assignments.createdAt));

      const subs = await db
        .select({
          id: assignmentSubmissions.id,
          assignmentId: assignmentSubmissions.assignmentId,
          studentId: assignmentSubmissions.studentId,
          studentEmail: users.email,
          studentName: users.displayName,
          workspaceId: assignmentSubmissions.workspaceId,
          status: assignmentSubmissions.status,
          grade: assignmentSubmissions.grade,
          feedback: assignmentSubmissions.feedback,
          snapshotHash: assignmentSubmissions.snapshotHash,
          submittedAt: assignmentSubmissions.submittedAt,
        })
        .from(assignmentSubmissions)
        .innerJoin(users, eq(assignmentSubmissions.studentId, users.id));

      return reply.send({
        assignments: list.map((a) => ({
          ...a,
          locked: Boolean(a.locked),
          submissions: subs.filter((s) => s.assignmentId === a.id),
        })),
      });
    }
  );

  app.post<{ Params: { courseId: string } }>(
    "/api/classroom/courses/:courseId/assignments",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, req.params.courseId))
        .limit(1);
      if (!course) {
        return reply.code(404).send({ error: "Course not found" });
      }

      const parsed = CreateAssignmentBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid assignment payload" });
      }

      const assignmentId = crypto.randomUUID();
      const now = Date.now();
      await db.insert(assignments).values({
        id: assignmentId,
        courseId: course.id,
        title: parsed.data.title.trim(),
        instructions: parsed.data.instructions,
        dueAt: parsed.data.dueAt ?? null,
        locked: false,
        createdAt: now,
      });

      const students = await db
        .select()
        .from(courseEnrollments)
        .where(
          and(
            eq(courseEnrollments.courseId, course.id),
            eq(courseEnrollments.role, "STUDENT")
          )
        );

      let forksCreated = 0;
      for (const st of students) {
        const wsId = crypto.randomUUID();
        const slug = `${course.code.toLowerCase()}-${assignmentId.slice(0, 6)}-${st.userId.slice(0, 6)}`;
        await db.insert(workspaces).values({
          id: wsId,
          slug,
          name: `${course.code}: ${parsed.data.title.trim()}`,
          kernelMode: "PERSONAL",
          ownerId: st.userId,
          createdAt: now,
        });
        await db.insert(workspaceMembers).values({
          workspaceId: wsId,
          userId: st.userId,
          role: "EDITOR",
          joinedAt: now,
        });
        await db
          .insert(workspaceMembers)
          .values({
            workspaceId: wsId,
            userId: course.instructorId,
            role: "OWNER",
            joinedAt: now,
          })
          .onConflictDoNothing();

        await copyWorkspaceFiles(
          config.workspacesRoot,
          course.templateWorkspaceId,
          wsId,
          parsed.data.title.trim()
        );

        await db.insert(assignmentSubmissions).values({
          id: crypto.randomUUID(),
          assignmentId,
          studentId: st.userId,
          workspaceId: wsId,
          status: "IN_PROGRESS",
        });
        forksCreated += 1;
      }

      return reply.code(201).send({
        assignment: {
          id: assignmentId,
          courseId: course.id,
          title: parsed.data.title.trim(),
          instructions: parsed.data.instructions,
          dueAt: parsed.data.dueAt ?? null,
          locked: false,
          createdAt: now,
        },
        forksCreated,
      });
    }
  );

  app.post<{ Params: { assignmentId: string } }>(
    "/api/classroom/assignments/:assignmentId/submit",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const [assignment] = await db
        .select()
        .from(assignments)
        .where(eq(assignments.id, req.params.assignmentId))
        .limit(1);
      if (!assignment) {
        return reply.code(404).send({ error: "Assignment not found" });
      }
      if (assignment.locked && assignment.dueAt && Date.now() > assignment.dueAt) {
        return reply.code(403).send({ error: "Assignment deadline has passed and is locked" });
      }

      const [sub] = await db
        .select()
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.assignmentId, assignment.id),
            eq(assignmentSubmissions.studentId, user.id)
          )
        )
        .limit(1);
      if (!sub) {
        return reply.code(404).send({ error: "No assignment workspace found for student" });
      }

      const snapshotHash = await computeWorkspaceHash(
        path.join(config.workspacesRoot, sub.workspaceId)
      );
      const submittedAt = Date.now();

      await db
        .update(assignmentSubmissions)
        .set({
          status: "SUBMITTED",
          snapshotHash,
          submittedAt,
        })
        .where(eq(assignmentSubmissions.id, sub.id));

      await recordAuditEvent(db, {
        workspaceId: sub.workspaceId,
        userId: user.id,
        action: "assignment_submitted",
        targetPath: assignment.id,
        payload: { snapshotHash },
      });

      return reply.send({ status: "SUBMITTED", snapshotHash, submittedAt });
    }
  );

  app.post<{ Params: { submissionId: string } }>(
    "/api/classroom/submissions/:submissionId/grade",
    async (req, reply) => {
      const user = await requireAuth(req, reply, db, config);
      if (!user) return;

      const parsed = GradeSubmissionBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid grade payload" });
      }

      const [sub] = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, req.params.submissionId))
        .limit(1);
      if (!sub) {
        return reply.code(404).send({ error: "Submission not found" });
      }

      await db
        .update(assignmentSubmissions)
        .set({
          status: "GRADED",
          grade: parsed.data.grade.trim(),
          feedback: parsed.data.feedback.trim(),
        })
        .where(eq(assignmentSubmissions.id, sub.id));

      await recordAuditEvent(db, {
        workspaceId: sub.workspaceId,
        userId: user.id,
        action: "submission_graded",
        targetPath: sub.id,
        payload: { grade: parsed.data.grade },
      });

      return reply.send({ ok: true, status: "GRADED", grade: parsed.data.grade.trim() });
    }
  );

  app.post("/api/classroom/lti/launch", async (req, reply) => {
    const user = await requireAuth(req, reply, db, config);
    if (!user) return;

    const parsed = LtiLaunchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid LTI 1.3 launch payload" });
    }

    let [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.ltiContextId, parsed.data.contextId))
      .limit(1);

    if (!course) {
      const courseId = crypto.randomUUID();
      await db.insert(courses).values({
        id: courseId,
        code: parsed.data.contextId.slice(0, 24),
        title: parsed.data.contextTitle ?? `LTI Course ${parsed.data.contextId}`,
        term: "Active Term",
        instructorId: user.id,
        ltiContextId: parsed.data.contextId,
        createdAt: Date.now(),
      });
      [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    }

    if (course) {
      await db
        .insert(courseEnrollments)
        .values({
          courseId: course.id,
          userId: user.id,
          role: parsed.data.role,
          enrolledAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: [courseEnrollments.courseId, courseEnrollments.userId],
          set: { role: parsed.data.role },
        });
    }

    return reply.send({ ok: true, course });
  });
}
