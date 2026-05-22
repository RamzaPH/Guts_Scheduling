import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, LoaderCircle, RotateCcw, Trash2, UserCog, X } from "lucide-react";
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "../../users/hooks/useUsers";
import { useAuth } from "../../auth/hooks/useAuth";
import { api } from "../../../services/api";

const ROLES = [
  { value: "admin", label: "Main Admin", color: "bg-[#800000]/10 text-[#800000] border-[#800000]/30" },
  { value: "sub_admin", label: "Sub Admin", color: "bg-[#D4AF37]/10 text-amber-700 border-amber-300" },
  { value: "staff", label: "Staff", color: "bg-slate-100 text-slate-600 border-slate-300" },
];

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.value === role) || ROLES[2];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${r.color}`}>
      {r.label}
    </span>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "staff" };
const EMPTY_EDIT_FORM = {
  name: "",
  email: "",
  role: "staff",
  newPassword: "",
  mustChangePassword: true,
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/20";

export default function ManageUsersPage() {
  const { auth } = useAuth();
  const currentUserId = auth?.user?.id;
  const { data: users = [], isLoading } = useUsers();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupState, setBackupState] = useState("idle");
  const [backupError, setBackupError] = useState("");
  const [backupStepIndex, setBackupStepIndex] = useState(0);
  const [backupElapsedMs, setBackupElapsedMs] = useState(0);
  const [backupResultMessage, setBackupResultMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreSelection, setRestoreSelection] = useState("");
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [isRestoreRunning, setIsRestoreRunning] = useState(false);
  const [restoreStepIndex, setRestoreStepIndex] = useState(0);
  const [restoreElapsedMs, setRestoreElapsedMs] = useState(0);
  const [restoreError, setRestoreError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const backupTimerRef = useRef(null);
  const restoreTimerRef = useRef(null);

  const availableBackupFiles = backupStatus?.backups?.length
    ? backupStatus.backups
    : backupStatus?.latestBackup
      ? [backupStatus.latestBackup]
      : [];

  const backupSteps = [
    "Preparing backup request",
    "Running database dump",
    "Writing backup file",
    "Finalizing status and cleanup",
  ];

  const restoreSteps = [
    "Validating backup selection",
    "Preparing database restore",
    "Importing backup file",
    "Finalizing restore",
  ];

  function toast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  const loadBackupStatus = useCallback(async () => {
    try {
      const payload = await api.get("/backups/status");
      setBackupStatus(payload);
      return payload;
    } catch {
      setBackupStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadBackupStatus();
    });
  }, [loadBackupStatus]);

  useEffect(() => {
    if (!showBackupModal && !showRestoreModal) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadBackupStatus();
    }, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, [showBackupModal, showRestoreModal, loadBackupStatus]);

  const createUser = useCreateUser({
    onSuccess: () => { setShowModal(false); setForm(EMPTY_FORM); toast("User created successfully."); },
    onError: (e) => setFormError(e?.details ? e.details.join(" ") : e.message),
  });

  const updateUser = useUpdateUser({
    onSuccess: () => {
      setEditUser(null);
      setEditForm(EMPTY_EDIT_FORM);
      setEditError("");
      toast("User updated successfully.");
    },
    onError: (e) => {
      const msg = e?.details ? e.details.join(" ") : (e.message || "Failed to update user.");
      setEditError(msg);
      toast(`Error: ${msg}`);
    },
  });

  const deleteUser = useDeleteUser({
    onSuccess: () => toast("User deleted."),
    onError: (e) => toast(`Error: ${e.message}`),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.name || !form.email || !form.password) {
      setFormError("All fields are required.");
      return;
    }
    createUser.mutate(form);
  }

  function openEditModal(user) {
    setEditError("");
    setEditUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "staff",
      newPassword: "",
      mustChangePassword: true,
    });
  }

  function handleEditSave() {
    if (!editUser) return;

    const payload = {
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
    };

    if (editForm.newPassword.trim()) {
      payload.newPassword = editForm.newPassword;
      payload.mustChangePassword = Boolean(editForm.mustChangePassword);
    }

    setEditError("");
    updateUser.mutate({ id: editUser.id, data: payload });
  }

  async function handleRunBackup() {
    const startedAt = Date.now();
    setBackupStepIndex(0);
    setBackupElapsedMs(0);
    setBackupResultMessage("");
    setBackupError("");
    setBackupState("processing");
    setShowBackupModal(true);

    if (backupTimerRef.current) {
      clearInterval(backupTimerRef.current);
    }

    try {
      setIsBackupRunning(true);
      backupTimerRef.current = setInterval(() => {
        setBackupElapsedMs(Date.now() - startedAt);
        setBackupStepIndex((current) => Math.min(current + 1, backupSteps.length - 1));
      }, 1200);

      const payload = await api.post("/backups/run", {});
      const successMessage = `Backup complete: ${payload.backupFileName || "database backup created"}`;
      setBackupResultMessage(successMessage);
      setBackupState("success");
      toast(successMessage);
      await loadBackupStatus();
    } catch (error) {
      // Some environments return a non-2xx response even when the backup completes.
      // Refresh status and show success if the status file reports success.
      const statusPayload = await loadBackupStatus();
      if (statusPayload?.status?.status === "success") {
        const successMessage = `Backup complete: ${statusPayload.status.backupFileName || "database backup created"}`;
        setBackupResultMessage(successMessage);
        setBackupState("success");
        toast(successMessage);
      } else {
        const failedMessage = error?.message || "Request failed";
        setBackupError(failedMessage);
        setBackupState("failed");
        toast(`Backup failed: ${failedMessage}`);
      }
    } finally {
      if (backupTimerRef.current) {
        clearInterval(backupTimerRef.current);
        backupTimerRef.current = null;
      }
      setBackupElapsedMs(Date.now() - startedAt);
      setIsBackupRunning(false);
    }
  }

  function closeBackupModal() {
    if (isBackupRunning) {
      return;
    }
    setShowBackupModal(false);
    setBackupState("idle");
    setBackupError("");
    setBackupResultMessage("");
  }

  function openRestoreModal() {
    const latestBackupName = availableBackupFiles[0]?.name || "";
    if (!latestBackupName) {
      toast("No backup file available to restore.");
      return;
    }

    setRestoreError("");
    setRestoreSelection(latestBackupName);
    setRestoreConfirmText("");
    setShowRestoreModal(true);
  }

  async function handleRunRestore() {
    if (!restoreSelection) {
      setRestoreError("Select a backup file to restore.");
      return;
    }

    const startedAt = Date.now();
    setRestoreStepIndex(0);
    setRestoreElapsedMs(0);
    setRestoreError("");

    if (restoreTimerRef.current) {
      clearInterval(restoreTimerRef.current);
    }

    try {
      setIsRestoreRunning(true);
      restoreTimerRef.current = setInterval(() => {
        setRestoreElapsedMs(Date.now() - startedAt);
        setRestoreStepIndex((current) => Math.min(current + 1, restoreSteps.length - 1));
      }, 1200);

      const payload = await api.post("/backups/restore", { backupFileName: restoreSelection });
      toast(`Restore complete: ${payload.restoredBackupFileName || restoreSelection}`);
      setShowRestoreModal(false);
      setRestoreConfirmText("");
      await loadBackupStatus();
    } catch (error) {
      toast(`Restore failed: ${error?.message || "Request failed"}`);
      setRestoreError(error?.message || "Failed to restore backup.");
    } finally {
      if (restoreTimerRef.current) {
        clearInterval(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }
      setRestoreElapsedMs(Date.now() - startedAt);
      setIsRestoreRunning(false);
    }
  }

  function formatTimestamp(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "-";
    return date.toLocaleString();
  }

  function formatElapsed(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatBackupOption(backup) {
    if (!backup) return "";
    const parts = [backup.name];
    if (backup.modifiedAt) {
      parts.push(new Date(backup.modifiedAt).toLocaleString());
    }
    if (Number.isFinite(backup.sizeBytes)) {
      parts.push(formatFileSize(backup.sizeBytes));
    }
    return parts.join(" • ");
  }

  return (
    <section className="space-y-4">
      {showBackupModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                {backupState === "success" ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : backupState === "failed" ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                {backupState === "success" ? (
                  <>
                    <h2 className="text-lg font-bold text-emerald-700">Backup complete</h2>
                    <p className="text-sm text-slate-600">{backupResultMessage}</p>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Backup finished successfully. You can close this dialog when ready.
                    </div>
                  </>
                ) : backupState === "failed" ? (
                  <>
                    <h2 className="text-lg font-bold text-red-700">Backup failed</h2>
                    <p className="text-sm text-slate-600">{backupError || "Backup request did not complete."}</p>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      Review server logs or retry the backup action.
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-slate-900">Backup in progress</h2>
                    <p className="text-sm text-slate-600">
                      The database backup is running now. Please wait until it finishes before doing anything else on this page.
                    </p>
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Do not refresh, close, or cancel this action. Interrupting a backup can leave incomplete files behind.
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <span>Current process</span>
                        <span>{formatElapsed(backupElapsedMs)}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {backupSteps.map((step, index) => {
                          const isActive = index === backupStepIndex;
                          const isComplete = index < backupStepIndex;
                          return (
                            <div
                              key={step}
                              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                                isActive
                                  ? "border-[#800000]/30 bg-[#800000]/5 text-[#800000]"
                                  : isComplete
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-white text-slate-500"
                              }`}
                            >
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${isActive ? "bg-[#800000] text-white" : isComplete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                                {isComplete ? "✓" : index + 1}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{step}</span>
                              {isActive && <LoaderCircle className="h-4 w-4 animate-spin" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                {backupState !== "processing" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeBackupModal}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isRestoreRunning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <h2 className="text-lg font-bold text-slate-900">Restore in progress</h2>
                <p className="text-sm text-slate-600">
                  The selected backup is being imported. Do not refresh, close, or use the database while this runs.
                </p>
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Restoring a backup overwrites the current database contents.
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Current process</span>
                    <span>{formatElapsed(restoreElapsedMs)}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {restoreSteps.map((step, index) => {
                      const isActive = index === restoreStepIndex;
                      const isComplete = index < restoreStepIndex;
                      return (
                        <div
                          key={step}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                            isActive
                              ? "border-[#800000]/30 bg-[#800000]/5 text-[#800000]"
                              : isComplete
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${isActive ? "bg-[#800000] text-white" : isComplete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                            {isComplete ? "✓" : index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{step}</span>
                          {isActive && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="rounded-lg bg-[#800000] px-4 py-3 text-sm font-medium text-white shadow">
          {toastMsg}
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-xl bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">User Management</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage admin and staff accounts.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => void handleRunBackup()}
            disabled={isBackupRunning || isRestoreRunning}
            aria-busy={isBackupRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#800000]/30 bg-white px-4 py-2 text-sm font-semibold text-[#800000] transition hover:bg-[#800000]/5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isBackupRunning ? <LoaderCircle size={14} className="animate-spin" /> : <Database size={14} />}
            {isBackupRunning ? "Backup Running..." : "Backup Now"}
          </button>

          <button
            type="button"
            onClick={openRestoreModal}
            disabled={isBackupRunning || isRestoreRunning || !backupStatus?.latestBackup}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <RotateCcw size={14} />
            Restore Backup
          </button>

          <button
            type="button"
            onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(""); }}
            disabled={isBackupRunning || isRestoreRunning}
            className="rounded-lg bg-[#800000] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d1224] sm:w-auto"
          >
            + Add User
          </button>
        </div>
      </div>

      {backupStatus ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm text-slate-700 shadow-sm">
          <p className="font-semibold text-slate-900">Database Backup Status</p>
          <p className="mt-1">
            Last Result: {String(backupStatus?.status?.status || "unknown").toUpperCase()} |
            Last Run: {formatTimestamp(backupStatus?.status?.timestamp)}
          </p>
          <p className="text-xs text-slate-500">
            Latest File: {backupStatus?.latestBackup?.name || backupStatus?.status?.backupFileName || "No backup file found"}
          </p>
        </div>
      ) : null}

      {showRestoreModal && (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-amber-600 px-6 py-4">
              <h2 className="text-base font-semibold text-white">Restore Backup</h2>
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreError("");
                  setRestoreConfirmText("");
                }}
                className="text-white/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Restoring will overwrite the current database contents with the selected backup.
              </div>
              {restoreError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{restoreError}</p>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Select backup file</label>
                <select
                  value={restoreSelection}
                  onChange={(e) => setRestoreSelection(e.target.value)}
                  className={inputClass}
                >
                  {availableBackupFiles.length > 0 ? (
                    availableBackupFiles.map((backup) => (
                      <option key={backup.name} value={backup.name}>
                        {formatBackupOption(backup)}
                      </option>
                    ))
                  ) : (
                    <option value="">No backup files found</option>
                  )}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {availableBackupFiles.length} backup file(s) available. Latest file is selected by default.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Type RESTORE to confirm
                </label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestoreModal(false);
                    setRestoreError("");
                    setRestoreConfirmText("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRestoreRunning || !restoreSelection || restoreConfirmText.trim().toUpperCase() !== "RESTORE"}
                  onClick={() => void handleRunRestore()}
                  className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                >
                  {isRestoreRunning ? "Restoring…" : "Restore Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-400">No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-5 py-3 text-slate-600">{u.email}</td>
                  <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        title="Edit user"
                        onClick={() => openEditModal(u)}
                        className="rounded-md p-1.5 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700"
                      >
                        <UserCog size={15} />
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          title="Delete user"
                          onClick={() => { if (window.confirm(`Delete user "${u.name}"?`)) deleteUser.mutate(u.id); }}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#800000] px-6 py-4">
              <h2 className="text-base font-semibold text-white">Add New User</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-white/70 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {formError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>
              )}
              {[
                { label: "Full Name", field: "name", type: "text", placeholder: "e.g. Juan dela Cruz" },
                { label: "Email Address", field: "email", type: "email", placeholder: "email@example.com" },
                { label: "Password", field: "password", type: "password", placeholder: "Min. 10 chars; upper, lower, number, special" },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field} className="relative">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                  <input
                    type={field === "password" && showPassword ? "text" : type}
                    placeholder={placeholder}
                    value={form[field]}
                    onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                    className={inputClass}
                  />
                  {field === "password" && (
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-9 text-slate-500"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-8 1.02-2.7 2.79-4.86 4.95-6.18"/><path d="M1 1l22 22"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>}
                    </button>
                  )}
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputClass}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={createUser.isPending} className="rounded-lg bg-[#800000] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#6d1224] disabled:opacity-60">
                  {createUser.isPending ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#800000] px-6 py-4">
              <h2 className="text-base font-semibold text-white">Edit User — {editUser.name}</h2>
              <button
                type="button"
                onClick={() => {
                  setEditUser(null);
                  setEditError("");
                }}
                className="text-white/70 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {editError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</p>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Full Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                  className={inputClass}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-semibold text-slate-600">New Password (optional)</label>
                <input
                  type={showEditPassword ? "text" : "password"}
                  value={editForm.newPassword}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Leave blank to keep current password"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword((s) => !s)}
                  className="absolute right-3 top-9 text-slate-500"
                  aria-label={showEditPassword ? "Hide password" : "Show password"}
                >
                  {showEditPassword ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-8 1.02-2.7 2.79-4.86 4.95-6.18"/><path d="M1 1l22 22"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(editForm.mustChangePassword)}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, mustChangePassword: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]"
                  disabled={!editForm.newPassword.trim()}
                />
                Force password change on next login
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditUser(null);
                    setEditError("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateUser.isPending}
                  onClick={handleEditSave}
                  className="rounded-lg bg-[#800000] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#6d1224] disabled:opacity-60"
                >
                  {updateUser.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
