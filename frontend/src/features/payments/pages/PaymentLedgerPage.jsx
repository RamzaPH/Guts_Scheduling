import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, List } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resourceServices } from "../../../services/resources";
import { fetchStudents } from "../../students/services/studentsApi";
import {
  getEnrollmentPaymentSummary,
  getPaymentCategoryLabel,
  getLatestEnrollment,
  getCourseCode,
} from "../../students/utils/studentsPageUtils";
import AddPromoModal from "../components/AddPromoModal";
import RecordPaymentModal from "../components/RecordPaymentModal";
import PaymentHistoryModal from "../components/PaymentHistoryModal";

const PAYMENT_LEDGER_VIEWS = {
  overall: { label: "Overall Payment Ledger", includeExternal: true, source: null },
  qr: { label: "QR Enrollment/Enrollment Page Payment Ledger", includeExternal: false, source: null },
  otdc: { label: "OTDC Payment Ledger", includeExternal: true, source: "otdc" },
  saferoads: { label: "Saferoads Payment Ledger", includeExternal: true, source: "saferoads" },
  odep: { label: "Saferoads Payment Ledger(ODEP)", includeExternal: true, source: "saferoads" },
};

function resolveLedgerView(view) {
  return PAYMENT_LEDGER_VIEWS[String(view || "overall").toLowerCase()] || PAYMENT_LEDGER_VIEWS.overall;
}

function updateEnrollmentPromoSummary(enrollment, promoPrice, promoOfferId) {
  if (!enrollment) return enrollment;

  const previousAdditionalAmount = Number(enrollment.additional_promos_amount || 0);
  const nextAdditionalAmount = Number((Number(promoPrice || 0)).toFixed(2));
  const baseFeeAmount = Math.max(Number(enrollment.fee_amount || 0) - previousAdditionalAmount, 0);
  const nextIds = Number.isInteger(Number(promoOfferId)) && Number(promoOfferId) > 0 ? [Number(promoOfferId)] : (Array.isArray(enrollment.additional_promo_offer_ids) ? enrollment.additional_promo_offer_ids : []);

  return {
    ...enrollment,
    additional_promo_offer_ids: nextIds,
    additional_promos_amount: nextAdditionalAmount,
    fee_amount: Number((baseFeeAmount + nextAdditionalAmount).toFixed(2)),
  };
}

function patchStudentsCollection(collection, row, promoPrice, promoOfferId) {
  const patchStudent = (student) => {
    if (String(student?.id) !== String(row?.student?.id)) {
      return student;
    }

    const enrollmentKeys = ["Enrollments", "enrollments"];
    for (const key of enrollmentKeys) {
      if (Array.isArray(student?.[key]) && student[key].length > 0) {
        const nextEnrollments = student[key].map((item, index) => {
          if (index !== 0 || String(item?.id) !== String(row?.enrollment?.id)) {
            return item;
          }
          return updateEnrollmentPromoSummary(item, promoPrice, promoOfferId);
        });

        return {
          ...student,
          [key]: nextEnrollments,
        };
      }
    }

    return student;
  };

  if (Array.isArray(collection)) {
    return collection.map(patchStudent);
  }

  if (collection && Array.isArray(collection.data)) {
    return {
      ...collection,
      data: collection.data.map(patchStudent),
    };
  }

  return collection;
}

function money(value) {
  const numeric = Number(value || 0);
  return `PHP ${numeric.toFixed(2)}`;
}

function statusTone(status) {
  if (status === "completed_payment") return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (status === "partial_payment") return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  if (status === "with_balance") return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function StatusBadge({ label, tone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

export default function PaymentLedgerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [paymentFilter, setPaymentFilter] = useState("with_balance");
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [promoTarget, setPromoTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [banner, setBanner] = useState("");
  const view = String(searchParams.get("view") || "overall").toLowerCase();
  const ledgerView = resolveLedgerView(view);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["students", "payment-ledger", view],
    queryFn: () => fetchStudents({ includeExternal: ledgerView.includeExternal, source: ledgerView.source }),
  });

  const { data: promoOffersData = [] } = useQuery({
    queryKey: ["promo-offers", "payment-ledger"],
    queryFn: async () => {
      const response = await resourceServices.promoOffers.list();
      return Array.isArray(response) ? response : response?.data || [];
    },
  });

  const promoOffers = useMemo(
    () => (Array.isArray(promoOffersData) ? promoOffersData : []).filter((offer) => String(offer?.status || "").toLowerCase() === "active"),
    [promoOffersData]
  );

  const students = useMemo(() => (Array.isArray(data) ? data : data?.data || []), [data]);

  const rows = useMemo(() => {
    return students
      .map((student) => {
        const enrollment = getLatestEnrollment(student);
        const sourceLabel = String(student?.source_channel || student?.external_source || student?.StudentProfile?.tdc_source || "").toLowerCase();
        const isImportedTdc = sourceLabel === "saferoads" || sourceLabel === "otdc";

        if (!enrollment && !isImportedTdc) return null;
        if (enrollment && String(enrollment.status || "").toLowerCase() === "pending" && !isImportedTdc) return null;

        const summary = getEnrollmentPaymentSummary(enrollment, student);
        const category = getPaymentCategoryLabel(enrollment);
        const course = getCourseCode(student);

        return {
          student,
          enrollment,
          summary,
          category,
          course,
        };
      })
      .filter(Boolean)
      .filter((row) => {
        if (paymentFilter === "all") return true;
        if (paymentFilter === "completed_payment") return row.summary.paymentStatus === "completed_payment";
        // Show enrollments with with_balance (includes partial and full balance owing) excluding not_set
        return row.summary.paymentStatus === "with_balance" || row.summary.paymentStatus === "partial_payment";
      })
      .sort((a, b) => {
        if (paymentFilter === "completed_payment") return Number(a.student.id) - Number(b.student.id);
        return Number(b.summary.remainingBalance) - Number(a.summary.remainingBalance);
      });
  }, [students, paymentFilter]);

  const totals = useMemo(() => {
    const allLedgerRows = students
      .map((student) => getEnrollmentPaymentSummary(getLatestEnrollment(student), student))
      .filter(Boolean);

    return {
      withBalance: allLedgerRows.filter((row) => row.paymentStatus !== "completed_payment" && row.paymentStatus !== "not_set").length,
      completed: allLedgerRows.filter((row) => row.paymentStatus === "completed_payment").length,
    };
  }, [students]);

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ row, form }) => {
      setBanner("");
      const payment = await resourceServices.payments.create({
        enrollment_id: row.enrollment.id,
        amount: form.amount,
        payment_method: form.payment_method,
        payment_status: "paid",
        reference_number: form.reference_number || null,
      });

      const remainingAfter = Number(row.summary.remainingBalance) - Number(form.amount);
      const nextStatus = remainingAfter <= 0 ? "completed" : "confirmed";
      await resourceServices.enrollments.update(row.enrollment.id, { status: nextStatus });

      return payment;
    },
    onSuccess: async () => {
      setBanner("Payment saved successfully.");
      setPaymentTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["students", "payment-ledger"] });
    },
    onError: (error) => {
      setBanner(error?.message || "Failed to save payment.");
    },
  });

  const addPromoMutation = useMutation({
    mutationFn: async ({ row, promoOffer, promoPrice, payNow }) => {
      setBanner("");
      const previousAdditionalAmount = Number(row.enrollment?.additional_promos_amount || 0);
      const nextAdditionalAmount = Number(promoPrice || 0);
      const nextIds = [Number(promoOffer.id)];
      const delta = Number((nextAdditionalAmount - previousAdditionalAmount).toFixed(2));

      await resourceServices.enrollments.update(row.enrollment.id, {
        additional_promo_offer_ids: nextIds,
        additional_promos_amount: nextAdditionalAmount,
      });

      return {
        row,
        promoOffer,
        promoPrice: nextAdditionalAmount,
        payNow: Boolean(payNow),
        nextRemainingBalance: Number((Number(row.summary.remainingBalance || 0) + delta).toFixed(2)),
        nextTotalDue: Number((Number(row.summary.totalDue || 0) + delta).toFixed(2)),
      };
    },
    onSuccess: async ({ row, promoOffer, promoPrice, payNow, nextRemainingBalance, nextTotalDue }) => {
      setBanner(`Promo added successfully: ${promoOffer.name}`);
      setPromoTarget(null);

      queryClient.setQueryData(["students", "payment-ledger", view], (current) =>
        patchStudentsCollection(current, row, promoPrice, promoOffer.id)
      );
      queryClient.setQueryData(["students"], (current) =>
        patchStudentsCollection(current, row, promoPrice, promoOffer.id)
      );

      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["students", "payment-ledger"] });
      if (promoPrice > 0) {
        if (payNow) {
          setPaymentTarget({
            ...row,
            summary: {
              ...row.summary,
              remainingBalance: nextRemainingBalance,
              totalDue: nextTotalDue,
            },
            enrollment: updateEnrollmentPromoSummary(row.enrollment, promoPrice, promoOffer.id),
          });
          setBanner(`Promo added and ready for payment: PHP ${promoPrice.toFixed(2)}.`);
        } else {
          setBanner(`Promo added successfully. Use Add Payment to record payment of PHP ${promoPrice.toFixed(2)}.`);
        }
      }
    },
    onError: (error) => {
      setBanner(error?.message || "Failed to add promo.");
    },
  });

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300 bg-gradient-to-r from-white to-slate-100 p-5 shadow-sm card-light">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Ledger</h1>
            <p className="text-sm text-slate-600">Admin and Sub Admin only</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(PAYMENT_LEDGER_VIEWS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("view", key);
                return next;
              })}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${view === key ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 card-light">
            <p className="text-xs font-semibold uppercase text-rose-700">With Balance</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totals.withBalance}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 card-light">
            <p className="text-xs font-semibold uppercase text-emerald-700">Completed Payments</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{totals.completed}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 card-light">
            <p className="text-xs font-semibold uppercase text-slate-500">Current Filter</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { value: "with_balance", label: "With Balance" },
                { value: "completed_payment", label: "Completed" },
                { value: "all", label: "All" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPaymentFilter(item.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${paymentFilter === item.value ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {banner ? (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          banner.toLowerCase().includes("failed") || banner.toLowerCase().includes("error")
            ? "border border-rose-200 bg-rose-50 text-rose-700"
            : "border border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {banner}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm card-light">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Ledger Entries</p>
            <p className="text-xs text-slate-500">{ledgerView.label} - students grouped by remaining balance and completion</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <List size={14} />
            {rows.length} records
          </div>
        </div>

        <div className="thin-scrollbar overflow-auto max-h-[70vh]">
          <table className="min-w-[1660px] table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-[#800000] text-left text-white">
              <tr>
                <th className="w-[220px] px-4 py-3 font-semibold">Student</th>
                <th className="w-[100px] px-4 py-3 font-semibold">Course</th>
                <th className="w-[180px] px-4 py-3 font-semibold">Promo Offer</th>
                <th className="w-[160px] px-4 py-3 font-semibold">Payment Terms</th>
                <th className="w-[140px] px-4 py-3 font-semibold">Status</th>
                <th className="w-[140px] px-4 py-3 font-semibold">Total Paid</th>
                <th className="w-[140px] px-4 py-3 font-semibold">Balance</th>
                <th className="w-[160px] px-4 py-3 font-semibold">Payments</th>
                <th className="w-[240px] rounded-tr-xl px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading payment ledger...</td>
                </tr>
              ) : null}

              {!isLoading && isError ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-rose-700">Failed to load payment ledger.</td>
                </tr>
              ) : null}

              {!isLoading && !isError && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">No matching payment records found.</td>
                </tr>
              ) : null}

              {!isLoading && !isError ? rows.map((row, index) => {
                const fullName = [row.student.first_name, row.student.middle_name, row.student.last_name].filter(Boolean).join(" ");
                const paymentLabel = row.summary.paymentStatus === "completed_payment"
                  ? "Completed"
                  : row.summary.paymentStatus === "partial_payment"
                    ? "Partial"
                    : row.summary.paymentStatus === "with_balance"
                      ? "With Balance"
                      : "Not Set";

                return (
                  <tr key={row.student.id} className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-[#D4AF37]/10`}>
                    <td className="px-4 py-2.5 align-top">
                      <p className="font-semibold text-slate-900">{fullName || `Student #${row.student.id}`}</p>
                      <p className="text-xs text-slate-500">ID #{row.student.id}</p>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <p className="font-semibold text-slate-800">{row.course || "N/A"}</p>
                    </td>
                    <td className="px-4 py-2.5 align-top text-slate-700">{row.category.promoOfferName}</td>
                    <td className="px-4 py-2.5 align-top text-slate-700">{row.category.paymentTerms}</td>
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge label={paymentLabel} tone={statusTone(row.summary.paymentStatus)} />
                    </td>
                    <td className="px-4 py-2.5 align-top text-slate-700">{money(row.summary.totalPaid)}</td>
                    <td className="px-4 py-2.5 align-top text-slate-900">
                      <p className="font-semibold">{money(row.summary.remainingBalance)}</p>
                    </td>
                    <td className="px-4 py-2.5 align-top text-slate-700">
                      {Array.isArray(row.enrollment?.payments) ? row.enrollment.payments.length : 0}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="flex flex-wrap gap-2">
                        {row.enrollment?.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPaymentTarget(row)}
                              className="rounded-md bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6d1224]"
                            >
                              Add Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => setPromoTarget(row)}
                              className="rounded-md border border-[#800000] bg-white px-3 py-1.5 text-xs font-semibold text-[#800000] hover:bg-[#800000]/5"
                            >
                              Add Promo
                            </button>
                          </>
                        ) : null}
                        {!row.enrollment?.id ? (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                            Imported record
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => navigate(`/students?focusStudentId=${row.student.id}`)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Open Student
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryTarget(row)}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Payment History
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : null}
            </tbody>
          </table>
        </div>
      </div>

      {promoTarget ? (
        <AddPromoModal
          studentName={[promoTarget.student.first_name, promoTarget.student.middle_name, promoTarget.student.last_name].filter(Boolean).join(" ")}
          currentBalance={promoTarget.summary.remainingBalance}
          promoOffers={promoOffers}
          onSubmit={(selection) => addPromoMutation.mutate({ row: promoTarget, ...selection })}
          onCancel={() => setPromoTarget(null)}
          isPending={addPromoMutation.isPending}
        />
      ) : null}

      {paymentTarget ? (
        <RecordPaymentModal
          studentName={[paymentTarget.student.first_name, paymentTarget.student.middle_name, paymentTarget.student.last_name].filter(Boolean).join(" ")}
          remainingBalance={paymentTarget.summary.remainingBalance}
          onSubmit={(form) => recordPaymentMutation.mutate({ row: paymentTarget, form })}
          onCancel={() => setPaymentTarget(null)}
          isPending={recordPaymentMutation.isPending}
        />
      ) : null}

      {historyTarget ? (
        <PaymentHistoryModal
          studentName={[historyTarget.student.first_name, historyTarget.student.middle_name, historyTarget.student.last_name].filter(Boolean).join(" ")}
          paymentTerms={historyTarget.category?.paymentTerms}
          totalPaid={historyTarget.summary?.totalPaid}
          remainingBalance={historyTarget.summary?.remainingBalance}
          payments={[...(Array.isArray(historyTarget.enrollment?.payments) ? historyTarget.enrollment.payments : [])].sort((a, b) => {
            const dateA = new Date(a?.payment_date || a?.created_at || a?.createdAt || 0).getTime();
            const dateB = new Date(b?.payment_date || b?.created_at || b?.createdAt || 0).getTime();
            return dateB - dateA;
          })}
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}
    </section>
  );
}