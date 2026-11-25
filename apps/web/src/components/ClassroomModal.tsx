// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, GraduationCap, Plus, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

interface CourseItem {
  id: string;
  code: string;
  title: string;
  term: string;
  templateWorkspaceId: string | null;
  myRole: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  instructions: string;
  dueAt: number | null;
  locked: boolean;
  submissions: Array<{
    id: string;
    studentId: string;
    studentEmail: string;
    studentName: string;
    workspaceId: string;
    status: string;
    grade: string | null;
    feedback: string | null;
    snapshotHash: string | null;
    submittedAt: number | null;
  }>;
}

export function ClassroomModal() {
  const {
    user,
    workspaces,
    setWorkspaces,
    setActiveWorkspace,
    showClassroomModal,
    setShowClassroomModal,
  } = useWorkspaceStore();

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Create course
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseTerm, setCourseTerm] = useState("Fall 2026");
  const [templateWsId, setTemplateWsId] = useState("");

  // Roster sync
  const [rosterText, setRosterText] = useState("");

  // Create assignment
  const [assignTitle, setAssignTitle] = useState("");
  const [assignInstructions, setAssignInstructions] = useState("");

  // Grade inline
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [gradeVal, setGradeVal] = useState("");
  const [feedbackVal, setFeedbackVal] = useState("");

  const loadCourses = useCallback(async () => {
    try {
      const res = await api.listCourses();
      setCourses(res.courses);
      if (res.courses.length > 0 && !selectedCourse) {
        setSelectedCourse(res.courses[0]!);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    }
  }, [selectedCourse]);

  const loadAssignments = useCallback(async (courseId: string) => {
    try {
      const res = await api.listCourseAssignments(courseId);
      setAssignments(res.assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    }
  }, []);

  useEffect(() => {
    if (!showClassroomModal) return;
    void loadCourses();
  }, [showClassroomModal, loadCourses]);

  useEffect(() => {
    if (showClassroomModal && selectedCourse) {
      void loadAssignments(selectedCourse.id);
    }
  }, [showClassroomModal, selectedCourse, loadAssignments]);

  if (!showClassroomModal) return null;

  const canTeach =
    user?.systemRole === "ADMIN" ||
    selectedCourse?.myRole === "INSTRUCTOR" ||
    selectedCourse?.myRole === "TA";

  async function handleCreateCourse(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCourse({
        code: courseCode.trim(),
        title: courseTitle.trim(),
        term: courseTerm.trim(),
        templateWorkspaceId: templateWsId || undefined,
      });
      setCourseCode("");
      setCourseTitle("");
      setShowCreateCourse(false);
      setStatusMsg("Course created.");
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create course");
    }
  }

  async function handleSyncRoster(e: FormEvent) {
    e.preventDefault();
    if (!selectedCourse) return;
    setError(null);
    const lines = rosterText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const members = lines.map((line) => {
      const [email = "", displayName = "", role = "STUDENT"] = line
        .split(",")
        .map((s) => s.trim());
      return {
        email,
        displayName: displayName || email.split("@")[0] || "Student",
        role: (role === "INSTRUCTOR" || role === "TA" ? role : "STUDENT") as
          | "INSTRUCTOR"
          | "TA"
          | "STUDENT",
      };
    });
    if (members.length === 0) return;
    try {
      const res = await api.syncCourseRoster(selectedCourse.id, members);
      setRosterText("");
      setStatusMsg(`Enrolled ${res.enrolled} roster member(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync roster");
    }
  }

  async function handleCreateAssignment(e: FormEvent) {
    e.preventDefault();
    if (!selectedCourse) return;
    setError(null);
    try {
      const res = await api.createCourseAssignment(selectedCourse.id, {
        title: assignTitle.trim(),
        instructions: assignInstructions.trim(),
      });
      setAssignTitle("");
      setAssignInstructions("");
      setStatusMsg(`Assignment distributed (${res.forksCreated} student forks created).`);
      const wsRes = await api.listWorkspaces();
      setWorkspaces(wsRes.workspaces);
      await loadAssignments(selectedCourse.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create assignment");
    }
  }

  async function handleSubmit(assignmentId: string) {
    if (!selectedCourse) return;
    setError(null);
    try {
      const res = await api.submitAssignment(assignmentId);
      setStatusMsg(`Submitted! Snapshot SHA-256: ${res.snapshotHash.slice(0, 12)}...`);
      await loadAssignments(selectedCourse.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    }
  }

  async function handleGrade(subId: string) {
    if (!selectedCourse || !gradeVal.trim()) return;
    setError(null);
    try {
      await api.gradeSubmission(subId, gradeVal.trim(), feedbackVal.trim());
      setGradingSubId(null);
      setGradeVal("");
      setFeedbackVal("");
      await loadAssignments(selectedCourse.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed");
    }
  }

  async function openSubmissionWorkspace(workspaceId: string) {
    const wsRes = await api.listWorkspaces();
    setWorkspaces(wsRes.workspaces);
    const found = wsRes.workspaces.find((w) => w.id === workspaceId);
    if (found) {
      setActiveWorkspace(found);
      setShowClassroomModal(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="classroom-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowClassroomModal(false);
      }}
    >
      <div
        className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-xl p-6 shadow-2xl"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--fg-primary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <div>
              <h2 id="classroom-title" className="text-lg font-bold">
                Classroom &amp; Lab Assignments (LTI 1.3 Ready)
              </h2>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Manage university courses, sync rosters, distribute per-student workspace forks, and grade submissions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClassroomModal(false)}
            aria-label="Close Classroom"
            className="ui-hover rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCourse(c)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor:
                    selectedCourse?.id === c.id ? "var(--accent)" : "var(--bg-sidebar)",
                  color:
                    selectedCourse?.id === c.id ? "var(--accent-fg)" : "var(--fg-primary)",
                }}
              >
                {c.code}: {c.title} ({c.myRole})
              </button>
            ))}
          </div>
          {(user?.systemRole === "ADMIN" || user?.accessLevel === "FULL") && (
            <button
              type="button"
              onClick={() => setShowCreateCourse((v) => !v)}
              className="ui-control inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> New Course
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ color: "var(--danger)", backgroundColor: "rgba(192,28,40,0.12)" }}>
            {error}
          </div>
        )}
        {statusMsg && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ color: "var(--success)", backgroundColor: "rgba(38,162,105,0.12)" }}>
            {statusMsg}
          </div>
        )}

        {showCreateCourse && (
          <form
            onSubmit={handleCreateCourse}
            className="mt-4 grid gap-3 rounded-xl p-4 sm:grid-cols-4"
            style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
          >
            <input
              type="text"
              required
              placeholder="Code (e.g. BIO-401)"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              className="rounded px-2.5 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
            />
            <input
              type="text"
              required
              placeholder="Course Title"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              className="rounded px-2.5 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
            />
            <input
              type="text"
              required
              placeholder="Term (e.g. Fall 2026)"
              value={courseTerm}
              onChange={(e) => setCourseTerm(e.target.value)}
              className="rounded px-2.5 py-1.5 text-xs outline-none"
              style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
            />
            <select
              value={templateWsId}
              onChange={(e) => setTemplateWsId(e.target.value)}
              className="ui-control rounded px-2 py-1.5 text-xs"
            >
              <option value="">Template Workspace (optional)</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <div className="sm:col-span-4 flex justify-end">
              <button
                type="submit"
                className="rounded px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Create Course
              </button>
            </div>
          </form>
        )}

        {selectedCourse ? (
          <div className="mt-5 space-y-4">
            {canTeach && (
              <div className="grid gap-4 md:grid-cols-2">
                <form
                  onSubmit={handleSyncRoster}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    <Users className="h-3.5 w-3.5" /> Sync Roster (CSV lines: email,name,role)
                  </div>
                  <textarea
                    rows={3}
                    value={rosterText}
                    onChange={(e) => setRosterText(e.target.value)}
                    placeholder={"student1@uni.edu,Alice,STUDENT\nstudent2@uni.edu,Bob,STUDENT"}
                    className="w-full rounded p-2 font-mono text-[11px] outline-none"
                    style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                  />
                  <button
                    type="submit"
                    className="mt-2 rounded px-3 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Enroll Students
                  </button>
                </form>

                <form
                  onSubmit={handleCreateAssignment}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                    <BookOpen className="h-3.5 w-3.5" /> Distribute New Assignment
                  </div>
                  <input
                    type="text"
                    required
                    value={assignTitle}
                    onChange={(e) => setAssignTitle(e.target.value)}
                    placeholder="Lab 1: Survival Analysis"
                    className="mb-2 w-full rounded px-2.5 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                  />
                  <input
                    type="text"
                    value={assignInstructions}
                    onChange={(e) => setAssignInstructions(e.target.value)}
                    placeholder="Instructions (optional)"
                    className="mb-2 w-full rounded px-2.5 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                  />
                  <button
                    type="submit"
                    className="rounded px-3 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Create &amp; Fork to Students
                  </button>
                </form>
              </div>
            )}

            <div className="space-y-3">
              {assignments.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                  No assignments created for this course yet.
                </p>
              ) : (
                assignments.map((a) => {
                  const mySub = a.submissions.find((s) => s.studentId === user?.id);
                  return (
                    <div
                      key={a.id}
                      className="rounded-xl p-4"
                      style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{a.title}</div>
                          {a.instructions && (
                            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                              {a.instructions}
                            </p>
                          )}
                        </div>
                        {mySub && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openSubmissionWorkspace(mySub.workspaceId)}
                              className="ui-control rounded px-2.5 py-1 text-xs"
                            >
                              Open My Fork
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSubmit(a.id)}
                              className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold"
                              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {mySub.status === "SUBMITTED" ? "Resubmit" : "Submit"}
                            </button>
                          </div>
                        )}
                      </div>

                      {canTeach && a.submissions.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {a.submissions.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                            >
                              <div>
                                <span className="font-semibold">{sub.studentName}</span>{" "}
                                <span style={{ color: "var(--fg-muted)" }}>({sub.studentEmail})</span>{" "}
                                <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--bg-sidebar)" }}>
                                  {sub.status}
                                </span>
                                {sub.grade && (
                                  <span className="ml-2 font-semibold" style={{ color: "var(--success)" }}>
                                    Grade: {sub.grade}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void openSubmissionWorkspace(sub.workspaceId)}
                                  className="ui-control rounded px-2 py-0.5 text-[11px]"
                                >
                                  Inspect
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGradingSubId(gradingSubId === sub.id ? null : sub.id);
                                    setGradeVal(sub.grade ?? "");
                                    setFeedbackVal(sub.feedback ?? "");
                                  }}
                                  className="ui-control rounded px-2 py-0.5 text-[11px]"
                                >
                                  Grade
                                </button>
                              </div>
                              {gradingSubId === sub.id && (
                                <div className="mt-2 flex w-full flex-wrap gap-2">
                                  <input
                                    type="text"
                                    placeholder="Grade (e.g. 95/100)"
                                    value={gradeVal}
                                    onChange={(e) => setGradeVal(e.target.value)}
                                    className="w-32 rounded px-2 py-1 text-xs outline-none"
                                    style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Feedback"
                                    value={feedbackVal}
                                    onChange={(e) => setFeedbackVal(e.target.value)}
                                    className="min-w-0 flex-1 rounded px-2 py-1 text-xs outline-none"
                                    style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleGrade(sub.id)}
                                    className="rounded px-3 py-1 text-xs font-semibold"
                                    style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                                  >
                                    Save Grade
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-xs" style={{ color: "var(--fg-muted)" }}>
            You are not enrolled in any courses yet.
          </p>
        )}
      </div>
    </div>
  );
}
