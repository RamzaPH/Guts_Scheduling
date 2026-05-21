import { X } from "lucide-react";

function money(value) {
  const numeric = Number(value || 0);
  return `PHP ${numeric.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "paid") return "Paid";
  if (normalized === "pending") return "Pending";
  if (normalized === "failed") return "Failed";
  if (normalized === "refunded") return "Refunded";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function paymentStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (normalized === "pending") return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  if (normalized === "failed") return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
  if (normalized === "refunded") return "bg-violet-100 text-violet-700 ring-1 ring-violet-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

export default function PaymentHistoryModal({
  studentName,
  paymentTerms,
  totalPaid,
  remainingBalance,
  payments = [],
  onClose,
}) {
  return (
    <div
      style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
      className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#800000] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Payment History — {studentName || "Student"}</h2>
            <p className="mt-0.5 text-xs text-white/80">Track payment status, amounts paid, terms, and OR numbers.</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Payment Terms</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{paymentTerms || "Not set"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Total Paid</p>
            <p className="mt-1 text-sm font-semibold text-emerald-700">{money(totalPaid)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Current Balance</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{money(remainingBalance)}</p>
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-auto p-4">
          <table className="min-w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-white text-left text-slate-700">
              <tr className="border-b border-slate-200">
                <th className="w-[140px] px-3 py-2 font-semibold">Date</th>
                <th className="w-[120px] px-3 py-2 font-semibold">Amount</th>
                <th className="w-[120px] px-3 py-2 font-semibold">Method</th>
                <th className="w-[130px] px-3 py-2 font-semibold">Status</th>
                <th className="w-[180px] px-3 py-2 font-semibold">OR Number</th>
              </tr>
            </thead>
            <tbody>
              {!Array.isArray(payments) || payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No payment records found for this student.
                  </td>
                </tr>
              ) : (
                payments.map((payment, index) => {
                  const status = paymentStatusLabel(payment?.payment_status);
                  const tone = paymentStatusTone(payment?.payment_status);
                  const method = String(payment?.payment_method || "-")
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (char) => char.toUpperCase());
                  const createdAt = payment?.payment_date || payment?.created_at || payment?.createdAt;

                  return (
                    <tr key={payment?.id || `${createdAt}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-2.5 text-slate-700">{formatDate(createdAt)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{money(payment?.amount)}</td>
                      <td className="px-3 py-2.5 text-slate-700">{method || "-"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{payment?.reference_number || payment?.receipt_number || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
