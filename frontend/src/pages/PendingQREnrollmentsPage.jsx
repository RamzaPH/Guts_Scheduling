import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react";
import QREnrollmentEditModal from "./QREnrollmentEditModal";
import { api } from "../services/api";
import { getStudentFullName } from "../features/students/utils/studentsPageUtils";

function moneyLabel(value) {
  const numeric = Number(value || 0);
  return `PHP ${numeric.toFixed(2)}`;
}

function getPendingDesiredDate(enrollment) {
  const enrollmentType = String(enrollment?.enrollment_type || enrollment?.Enrollment?.enrollment_type || enrollment?.qrCode?.template?.enrollment_type || enrollment?.qrCode?.name || "").trim().toUpperCase();

  if (enrollmentType === "PDC") {
    return enrollment?.pdc_desired_date || enrollment?.promo_schedule_pdc?.schedule_date || "";
  }
  if (enrollmentType === "TDC") {
    return enrollment?.tdc_completion_deadline || enrollment?.promo_schedule_tdc?.schedule_date || "";
  }
  return enrollment?.pdc_desired_date || enrollment?.tdc_completion_deadline || "";
}

export default function PendingQREnrollmentsPage() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  
  // ✅ FIX: Gumamit na tayo ng localStorage para hindi mawala pag nag-refresh!
  const [reviewedIds, setReviewedIds] = useState(() => {
    try {
      const saved = localStorage.getItem("reviewedQREnrollments");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  async function loadPendingEnrollments() {
    const data = await api.get("/admin/enrollments/pending");
    return Array.isArray(data) ? data : [];
  }

  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      try {
        setError("");
        const data = await loadPendingEnrollments();
        if (!cancelled) {
          setEnrollments(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load pending QR enrollments.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadQueue();
    return () => { cancelled = true; };
  }, []);

  function handleReview(enrollment) {
    setEditingEnrollment(enrollment);
  }

  function handleEditSaveComplete(message, id) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(""), 3000);

    // ✅ FIX: I-save sa state AT sa localStorage
    if (id) {
      setReviewedIds((prev) => {
        if (prev.includes(id)) return prev; // Para hindi madoble
        const updated = [...prev, id];
        localStorage.setItem("reviewedQREnrollments", JSON.stringify(updated));
        return updated;
      });
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(128,0,0,0.08),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_55%,_#faf5f3_100%)] px-4 py-8 text-slate-900 card-light">
      <div className="mx-auto max-w-6xl space-y-6">
        {toastMsg && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm flex items-center gap-2 card-light">
            <CheckCircle2 size={16} />
            {toastMsg}
          </div>
        )}
        <header className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] card-light">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#800000]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#800000]">
            <ShieldCheck size={14} />
            QR Review Queue
          </p>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Pending QR enrollments</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Review the public submissions captured through QR. Once you review and save the changes, it will move to the Pending Approvals page for payment.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[280px]">
              <div className="card-light flex h-full min-h-[96px] flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Queued</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{Math.max(0, enrollments.length - reviewedIds.length)}</p>
              </div>
              <div className="card-light flex h-full min-h-[96px] flex-col justify-between overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Action</p>
                <p className="mt-2 text-base font-bold leading-tight text-slate-950 sm:text-lg">Review</p>
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600 shadow-sm card-light">
            <Loader2 size={16} className="animate-spin" />
            Loading pending QR enrollments...
          </div>
        ) : null}

        {!loading && !error && !enrollments.length ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm card-light">
            <CheckCircle2 className="mx-auto text-emerald-600" size={32} />
            <h2 className="mt-4 text-2xl font-bold text-slate-950">No pending QR enrollments</h2>
            <p className="mt-2 text-sm text-slate-600">Once a public submission arrives, it will appear here for approval before payment.</p>
          </div>
        ) : null}

        {!loading && enrollments.length > 0 ? (
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm card-light">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Queue details</p>
              <p className="text-xs text-slate-500">The enrollment moves to Pending Approvals after your review.</p>
            </div>

            <div className="thin-scrollbar overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Enrollment</th>
                    <th className="px-5 py-4">Student</th>
                    <th className="px-5 py-4">QR Source</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Submitted</th>
                    <th className="px-5 py-4">
                      <div className="flex flex-col">
                        <span>Action</span>
                        {reviewedIds.length > 0 && (
                          <span className="mt-1 w-max rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            {reviewedIds.length} Reviewed
                          </span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.map((enrollment) => {
                    const isReviewed = reviewedIds.includes(enrollment.id);

                    return (
                      <tr key={enrollment.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-950">#{enrollment.id}</div>
                          <div className="text-xs text-slate-500">{enrollment.enrollment_type || enrollment.client_type || "QR submission"}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {getStudentFullName(enrollment.student || enrollment.Student)}
                          </div>
                          <div className="text-xs text-slate-500">{enrollment.student?.email || enrollment.profile?.gmail_account || "-"}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{enrollment.qrCode?.name || "-"}</div>
                          <div className="text-xs text-slate-500">{enrollment.qrCode?.token || "-"}</div>
                          {getPendingDesiredDate(enrollment) ? (
                            <div className="mt-1 text-xs font-medium text-[#800000]">
                              Desired Date: {getPendingDesiredDate(enrollment)}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-700">{moneyLabel(enrollment.payment_summary?.total_due || enrollment.fee_amount)}</td>
                        <td className="px-5 py-4 text-slate-700">
                          <div className="flex items-center gap-2">
                            <Clock3 size={14} className="text-slate-400" />
                            {enrollment.createdAt ? new Date(enrollment.createdAt).toLocaleString() : "-"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => handleReview(enrollment)}
                            disabled={isReviewed}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition ${
                              isReviewed 
                                ? "bg-slate-400 cursor-not-allowed opacity-70" 
                                : "bg-[#800000] shadow-[0_12px_28px_rgba(128,0,0,0.2)] hover:bg-[#680000]"
                            }`}
                          >
                            {!isReviewed && <ArrowRight size={14} />}
                            {isReviewed ? "Reviewed" : "Review"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <QREnrollmentEditModal
        isOpen={Boolean(editingEnrollment)}
        enrollment={editingEnrollment}
        onClose={() => setEditingEnrollment(null)}
        onSaveComplete={handleEditSaveComplete}
      />
    </div>
  );
}