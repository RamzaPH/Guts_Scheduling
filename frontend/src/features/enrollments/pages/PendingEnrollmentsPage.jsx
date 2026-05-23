import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, GraduationCap } from "lucide-react";
import { resourceServices } from "../../../services/resources";
import { api } from "../../../services/api";
import PaymentDetailsModal from "../components/PaymentDetailsModal.jsx";
import ToastStack from "../../../shared/utils/ToastStack";
import { getStudentSourceLabel, getStudentFullName } from "../../students/utils/studentsPageUtils";
import { resolvePromoPrice } from "../../../shared/utils/promoPricing";

export default function PendingEnrollmentsPage() {
  const [toastMsg, setToastMsg] = useState("");
  const [selectedForPayment, setSelectedForPayment] = useState(null);

  function toast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  const { data: enrollments = [], isLoading, refetch } = useQuery({
    queryKey: ["enrollments", "pending"],
    queryFn: async () => {
      const all = await resourceServices.enrollments.list();
      return (all || []).filter((e) => {
        // Only include pending enrollments from QR/manual enrollment (not OTDC/SafeRoads)
        const isPending = String(e?.status || "") === "pending";
        const hasStudent = e?.student || e?.Student;
        const studentRecord = e?.student || e?.Student;
        const source = getStudentSourceLabel(studentRecord);
        const isQrOrManual = source === "Walk-in"; // Only walk-in students (QR/manual enrollment)
        return isPending && hasStudent && isQrOrManual;
      });
    },
    staleTime: 5000,
  });

  const { data: promoOffers = [] } = useQuery({
    queryKey: ["promo-offers"],
    queryFn: async () => {
      try {
        const resp = await api.get("/promo-offers");
        return resp || [];
      } catch {
        return [];
      }
    },
  });

  // TAMA NA PARAAN: Ibabalik lang ng useMemo ang options, walang setState na mangyayari
  const promoOfferOptions = useMemo(() => {
    return (promoOffers || []).map((po) => ({
      value: po.id,
      label: `${po.name} - ₱${resolvePromoPrice(po).toFixed(2)}`,
      discounted_price: po.discounted_price,
      fixed_price: po.fixed_price,
      name: po.name,
    }));
  }, [promoOffers]);

  const rejectMutation = useMutation({
    mutationFn: async (enrollmentId) => {
      return api.put(`/enrollments/${enrollmentId}`, { status: "rejected" });
    },
    onSuccess: () => {
      toast("Enrollment rejected successfully.");
      refetch();
    },
    onError: (e) => {
      toast(`Error: ${e.message}`);
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ enrollmentId, paymentData }) => {
      return api.put(`/enrollments/${enrollmentId}`, {
        ...paymentData,
        status: "confirmed",
      });
    },
    onSuccess: () => {
      toast("Enrollment confirmed with payment details.");
      setSelectedForPayment(null);
      refetch();
    },
    onError: (e) => {
      toast(`Error: ${e.message}`);
    },
  });

  function handleAccept(enrollment) {
    setSelectedForPayment(enrollment);
  }

  function handleReject(enrollment) {
    if (window.confirm(`Reject enrollment for ${getStudentFullName(enrollment.student || enrollment.Student)}?`)) {
      rejectMutation.mutate(enrollment.id);
    }
  }

  function handlePaymentSubmit(paymentData) {
    // Convert empty strings to null to avoid validation errors
    const sanitized = Object.fromEntries(
      Object.entries(paymentData).map(([key, value]) => [
        key,
        (typeof value === 'string' && value.trim() === '') ? null : value,
      ])
    );
    updatePaymentMutation.mutate({
      enrollmentId: selectedForPayment.id,
      paymentData: sanitized,
    });
  }

  const pendingCount = enrollments.length;

  return (
    <section className="space-y-4">
      {toastMsg && (
        <div className="rounded-lg bg-[#800000] px-4 py-3 text-sm font-medium text-white shadow">
          {toastMsg}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pending Enrollments</h1>
          <p className="mt-0.5 text-sm text-slate-500">Review and approve pending enrollments before staff can proceed.</p>
        </div>
        <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 text-sm font-semibold text-[#800000]">
          {pendingCount} pending
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-slate-400">Loading…</div>
        ) : pendingCount === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400">No pending enrollments.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="px-5 py-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <GraduationCap size={16} className="shrink-0 text-slate-500" />
                      <p className="font-semibold text-slate-900">
                        {getStudentFullName(enrollment.student || enrollment.Student)}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {enrollment.enrollment_type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{enrollment.student?.email}</p>
                    {enrollment.promo_offer_id && (
                      <p className="mt-1 text-xs text-slate-600">
                        <span className="font-semibold">Promo:</span> {enrollment.promo_offer_id}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAccept(enrollment)}
                      disabled={rejectMutation.isPending || updatePaymentMutation.isPending}
                      className="flex items-center gap-1 rounded-lg bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6d1224] disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(enrollment)}
                      disabled={rejectMutation.isPending || updatePaymentMutation.isPending}
                      className="flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedForPayment && (
        <PaymentDetailsModal
          enrollment={selectedForPayment}
          student={selectedForPayment.student || selectedForPayment.Student}
          studentProfile={(selectedForPayment.student || selectedForPayment.Student)?.StudentProfile}
          studentName={getStudentFullName(selectedForPayment.student || selectedForPayment.Student)}
          studentEmail={(selectedForPayment.student || selectedForPayment.Student)?.StudentProfile?.gmail_account || (selectedForPayment.student || selectedForPayment.Student)?.email}
          studentPhone={(selectedForPayment.student || selectedForPayment.Student)?.phone}
          enrollmentLabel={`Enrollment #${selectedForPayment.id}`}
          courseLabel={selectedForPayment.DLCode?.code || selectedForPayment.enrolling_for || "N/A"}
          promoOfferLabel={selectedForPayment.promoOffer?.name || selectedForPayment.PromoOffer?.name || selectedForPayment.promo_offer_id || "None"}
          promoOfferOptions={promoOfferOptions}
          onSubmit={handlePaymentSubmit}
          onCancel={() => setSelectedForPayment(null)}
          isPending={updatePaymentMutation.isPending}
        />
      )}

      <ToastStack />
    </section>
  );
}