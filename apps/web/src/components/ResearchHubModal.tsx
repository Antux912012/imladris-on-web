// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  ComputeJob,
  Department,
  ExecuteEngine,
  InstitutionalTemplate,
  ReviewLink,
} from "@imladris/shared";
import { Archive, Building2, Cpu, EyeOff, GitBranch, Layers, X } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../state/workspaceStore";

export function ResearchHubModal() {
  const {
    user,
    activeWorkspace,
    workspaces,
    setWorkspaces,
    setActiveWorkspace,
    showResearchHubModal,
    setShowResearchHubModal,
  } = useWorkspaceStore();

  const [tab, setTab] = useState<"review" | "git" | "templates" | "departments" | "hpc">("review");
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Feature 6: Review links
  const [reviewLinks, setReviewLinks] = useState<ReviewLink[]>([]);
  const [reviewLabel, setReviewLabel] = useState("External Referee #1");
  const [blindAuthors, setBlindAuthors] = useState(true);

  // Feature 7: Git & Zenodo
  const [gitRemoteUrl, setGitRemoteUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitStatusText, setGitStatusText] = useState("");
  const [gitCommitMsg, setGitCommitMsg] = useState("Update manuscript");
  const [archiveTitle, setArchiveTitle] = useState("");
  const [archiveProvider, setArchiveProvider] = useState<"zenodo-sandbox" | "zenodo" | "dataverse">("zenodo-sandbox");

  // Feature 8: Templates & Zotero
  const [templates, setTemplates] = useState<InstitutionalTemplate[]>([]);
  const [zoteroName, setZoteroName] = useState("");
  const [zoteroGroupId, setZoteroGroupId] = useState("");

  // Feature 9: Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptName, setDeptName] = useState("");
  const [deptQuota, setDeptQuota] = useState(10240);

  // Feature 10: HPC
  const [hpcJobs, setHpcJobs] = useState<ComputeJob[]>([]);
  const [hpcTarget, setHpcTarget] = useState<"slurm-highmem" | "gpu-a100" | "k8s-gpu">("slurm-highmem");
  const [hpcEngine, setHpcEngine] = useState<ExecuteEngine>("python");
  const [hpcCode, setHpcCode] = useState("import math\nprint('HPC batch check:', math.factorial(10))");

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [tplRes, deptRes] = await Promise.all([
        api.listTemplates(),
        api.listDepartments(),
      ]);
      setTemplates(tplRes.templates);
      setDepartments(deptRes.departments);

      if (activeWorkspace) {
        const [revRes, gitRes, hpcRes] = await Promise.all([
          api.listReviewLinks(activeWorkspace.id).catch(() => ({ links: [] })),
          api.getGitStatus(activeWorkspace.id).catch(() => ({ remote: null, status: "" })),
          api.listHpcJobs(activeWorkspace.id).catch(() => ({ jobs: [] })),
        ]);
        setReviewLinks(revRes.links);
        if (gitRes.remote) {
          setGitRemoteUrl(gitRes.remote.remoteUrl);
          setGitBranch(gitRes.remote.branch);
        }
        setGitStatusText(gitRes.status);
        setHpcJobs(hpcRes.jobs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Research Hub");
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (showResearchHubModal) {
      void loadData();
    }
  }, [showResearchHubModal, loadData]);

  if (!showResearchHubModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-hub-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowResearchHubModal(false);
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
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" style={{ color: "var(--accent)" }} />
            <div>
              <h2 id="research-hub-title" className="text-lg font-bold">
                Research Hub &amp; Infrastructure
              </h2>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                Double-Blind Review, Git/Zenodo Archival, Institutional Templates, Departments, and HPC/GPU Queue.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowResearchHubModal(false)}
            aria-label="Close Research Hub"
            className="ui-hover rounded-lg p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: "var(--border-subtle)" }}>
          {(
            [
              ["review", "Double-Blind Review"],
              ["git", "Git & Zenodo"],
              ["templates", "Templates & Zotero"],
              ["departments", "Departments"],
              ["hpc", "HPC / GPU Queue"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: tab === id ? "var(--accent)" : "var(--bg-sidebar)",
                color: tab === id ? "var(--accent-fg)" : "var(--fg-primary)",
              }}
            >
              {label}
            </button>
          ))}
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

        {tab === "review" && activeWorkspace && (
          <div className="mt-4 space-y-4">
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setError(null);
                try {
                  await api.createReviewLink(activeWorkspace.id, {
                    label: reviewLabel,
                    blindAuthors,
                    expiresInHours: 168,
                  });
                  setStatusMsg("Created time-limited peer review link.");
                  await loadData();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to create review link");
                }
              }}
              className="flex flex-wrap items-center gap-3 rounded-xl p-4"
              style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
            >
              <EyeOff className="h-4 w-4" style={{ color: "var(--accent)" }} />
              <input
                type="text"
                value={reviewLabel}
                onChange={(e) => setReviewLabel(e.target.value)}
                placeholder="Referee Label"
                className="rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={blindAuthors}
                  onChange={(e) => setBlindAuthors(e.target.checked)}
                />
                Double-Blind (Anonymize Authors)
              </label>
              <button
                type="submit"
                className="rounded px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Generate 7-Day Link
              </button>
            </form>

            <div className="space-y-2">
              {reviewLinks.map((l) => (
                <div
                  key={l.token}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <span className="font-semibold">{l.label}</span>{" "}
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--bg-surface)" }}>
                      {l.blindAuthors ? "Double-Blind" : "Open"}
                    </span>
                    <div className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      /api/review/{l.token} · Expires {new Date(l.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  {!l.revoked ? (
                    <button
                      type="button"
                      onClick={() => void api.revokeReviewLink(activeWorkspace.id, l.token).then(loadData)}
                      className="ui-control rounded px-2.5 py-1 text-[11px]"
                      style={{ color: "var(--danger)" }}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--danger)" }}>Revoked</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "git" && activeWorkspace && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl p-4" style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <GitBranch className="h-4 w-4" style={{ color: "var(--accent)" }} /> GitHub / GitLab Sync
              </div>
              <input
                type="url"
                value={gitRemoteUrl}
                onChange={(e) => setGitRemoteUrl(e.target.value)}
                placeholder="https://gitlab.university.edu/lab/manuscript.git"
                className="w-full rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  className="w-28 rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                />
                <button
                  type="button"
                  onClick={() =>
                    void api.configureGit(activeWorkspace.id, gitRemoteUrl, gitBranch).then(() => {
                      setStatusMsg("Git remote configured.");
                      return loadData();
                    })
                  }
                  className="ui-control rounded px-3 py-1.5 text-xs font-medium"
                >
                  Save Remote
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gitCommitMsg}
                  onChange={(e) => setGitCommitMsg(e.target.value)}
                  placeholder="Commit message"
                  className="min-w-0 flex-1 rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                />
                <button
                  type="button"
                  onClick={() =>
                    void api.syncGit(activeWorkspace.id, "commit", gitCommitMsg).then((r) => {
                      setGitStatusText(r.output);
                      setStatusMsg(r.commitHash ? `Committed ${r.commitHash}` : "Commit ran.");
                    })
                  }
                  className="rounded px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Commit
                </button>
              </div>
              <pre className="max-h-28 overflow-auto rounded p-2 font-mono text-[10px]" style={{ backgroundColor: "var(--bg-window)" }}>
                {gitStatusText || "Clean working tree"}
              </pre>
            </div>

            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setError(null);
                try {
                  const res = await api.depositArchive(activeWorkspace.id, {
                    provider: archiveProvider,
                    title: archiveTitle || activeWorkspace.name,
                    description: "Reproducible Mallorn archive generated by Imladris on Web",
                  });
                  setStatusMsg(`Archive ${res.archiveFileName} generated (${res.fileCount} files).`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Deposit failed");
                }
              }}
              className="space-y-3 rounded-xl p-4"
              style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Archive className="h-4 w-4" style={{ color: "var(--accent)" }} /> Zenodo / Dataverse Archival
              </div>
              <select
                value={archiveProvider}
                onChange={(e) => setArchiveProvider(e.target.value as "zenodo-sandbox" | "zenodo" | "dataverse")}
                className="ui-control w-full rounded px-2.5 py-1.5 text-xs"
              >
                <option value="zenodo-sandbox">Zenodo Sandbox</option>
                <option value="zenodo">Zenodo Production</option>
                <option value="dataverse">Dataverse</option>
              </select>
              <input
                type="text"
                value={archiveTitle}
                onChange={(e) => setArchiveTitle(e.target.value)}
                placeholder="Archive Title (defaults to workspace name)"
                className="w-full rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
              <button
                type="submit"
                className="rounded px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Create .mallorn.json Deposit
              </button>
            </form>
          </div>
        )}

        {tab === "templates" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex flex-col justify-between rounded-xl p-4"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--bg-surface)" }}>
                      {tpl.category}
                    </span>
                    <div className="mt-2 text-xs font-bold">{tpl.name}</div>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      {tpl.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await api.instantiateTemplate(tpl.id);
                      setWorkspaces([...workspaces, res.workspace]);
                      setActiveWorkspace(res.workspace);
                      setShowResearchHubModal(false);
                    }}
                    className="mt-3 rounded px-3 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                await api.syncZoteroLibrary({ name: zoteroName, groupId: zoteroGroupId });
                setZoteroName("");
                setZoteroGroupId("");
                setStatusMsg("Zotero group library synced.");
              }}
              className="flex flex-wrap items-center gap-2 rounded-xl p-4"
              style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
            >
              <span className="text-xs font-semibold">Sync Zotero Group Library:</span>
              <input
                type="text"
                required
                value={zoteroName}
                onChange={(e) => setZoteroName(e.target.value)}
                placeholder="Lab Library Name"
                className="rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
              <input
                type="text"
                required
                value={zoteroGroupId}
                onChange={(e) => setZoteroGroupId(e.target.value)}
                placeholder="Zotero Group ID"
                className="rounded px-2.5 py-1.5 text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
              <button
                type="submit"
                className="ui-control rounded px-3 py-1.5 text-xs font-medium"
              >
                Sync BibTeX
              </button>
            </form>
          </div>
        )}

        {tab === "departments" && (
          <div className="mt-4 space-y-4">
            {user?.systemRole === "ADMIN" && (
              <form
                onSubmit={async (e: FormEvent) => {
                  e.preventDefault();
                  await api.createDepartment(deptName, deptQuota);
                  setDeptName("");
                  setStatusMsg("Department created.");
                  await loadData();
                }}
                className="flex flex-wrap items-center gap-2 rounded-xl p-4"
                style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
              >
                <Building2 className="h-4 w-4" style={{ color: "var(--accent)" }} />
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Department / Lab Name"
                  className="rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                />
                <input
                  type="number"
                  value={deptQuota}
                  onChange={(e) => setDeptQuota(Number(e.target.value))}
                  className="w-28 rounded px-2.5 py-1.5 text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
                />
                <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>MB quota</span>
                <button
                  type="submit"
                  className="rounded px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Create Department
                </button>
              </form>
            )}

            <div className="space-y-2">
              {departments.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--fg-muted)" }}>No departments configured yet.</p>
              ) : (
                departments.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <span className="font-semibold">{d.name}</span>{" "}
                      <span className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>({d.slug})</span>
                    </div>
                    <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      Quota: {d.quotaMb} MB · Role: {d.myRole ?? "MEMBER"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === "hpc" && activeWorkspace && (
          <div className="mt-4 space-y-4">
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                await api.submitHpcJob(activeWorkspace.id, {
                  engine: hpcEngine,
                  target: hpcTarget,
                  code: hpcCode,
                });
                setStatusMsg("HPC / GPU job queued.");
                await loadData();
              }}
              className="space-y-3 rounded-xl p-4"
              style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Cpu className="h-4 w-4" style={{ color: "var(--accent)" }} />
                <select
                  value={hpcTarget}
                  onChange={(e) => setHpcTarget(e.target.value as "slurm-highmem" | "gpu-a100" | "k8s-gpu")}
                  className="ui-control rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="slurm-highmem">Slurm High-Memory Partition</option>
                  <option value="gpu-a100">NVIDIA A100 GPU Queue</option>
                  <option value="k8s-gpu">Kubernetes GPU Pool</option>
                </select>
                <select
                  value={hpcEngine}
                  onChange={(e) => setHpcEngine(e.target.value as ExecuteEngine)}
                  className="ui-control rounded px-2.5 py-1.5 text-xs"
                >
                  <option value="python">Python</option>
                  <option value="r">R</option>
                  <option value="julia">Julia</option>
                  <option value="bash">Bash</option>
                </select>
                <button
                  type="submit"
                  className="rounded px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Submit Batch Job
                </button>
              </div>
              <textarea
                rows={4}
                value={hpcCode}
                onChange={(e) => setHpcCode(e.target.value)}
                className="w-full rounded p-2 font-mono text-xs outline-none"
                style={{ backgroundColor: "var(--bg-window)", border: "1px solid var(--border-subtle)" }}
              />
            </form>

            <div className="space-y-2">
              {hpcJobs.map((j) => (
                <div
                  key={j.id}
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: "var(--bg-sidebar)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {j.slurmJobId ?? j.id} · {j.target} ({j.engine})
                    </span>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "var(--bg-surface)" }}>
                      {j.status}
                    </span>
                  </div>
                  {j.stdout && (
                    <pre className="mt-1 overflow-x-auto font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      {j.stdout}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
