import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertCircle } from "lucide-react";
import { api } from "../services/api";
import { buildAddress } from "../features/students/utils/studentsPageUtils";

// Use shared address builder which converts PSGC codes to labels when possible
// and composes a readable address string.

function normalizeBooleanValue(value) {
  return value === true || value === "true" || value === "Schedule Now";
}

export default function QREnrollmentEditModal({ isOpen, enrollment, onClose, onSaveComplete }) {
  const queryClient = useQueryClient();
  const enrollmentType = String(
    enrollment?.enrollment_type
      || enrollment?.Enrollment?.enrollment_type
      || enrollment?.qrCode?.template?.enrollment_type
      || enrollment?.qrCode?.name
      || ""
  ).trim().toUpperCase();
  const isPdcEnrollment = enrollmentType === "PDC";
  const isPromoEnrollment = enrollmentType === "PROMO";
  const [form, setForm] = useState({
    promo_schedule_tdc: {
      schedule_date: "",
      instructor_id: null,
      care_of_instructor_id: null,
    },
    promo_schedule_pdc: {
      enabled: "Schedule Now",
      schedule_date: "",
      instructor_id: null,
      care_of_instructor_id: null,
    },
    student: {
      first_name: "",
      middle_name: "",
      last_name: "",
      phone: "",
    },
    profile: {
      gmail_account: "",
    },
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [instructors, setInstructors] = useState([]);

  // Fetch instructors on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/instructors');
        if (!mounted) return;
        // backend may return { value: [...] } or { data: [...] } or an array
        const list = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.data)
          ? resp.data
          : Array.isArray(resp?.value)
          ? resp.value
          : [];

        setInstructors(list.map((i) => ({ value: i.id, label: i.name || `${i.first_name || ''} ${i.last_name || ''}`.trim() })));
      } catch {
        // ignore - dropdown will remain empty
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Load form data when modal opens
  useEffect(() => {
    if (!isOpen || !enrollment) {
      return;
    }

    Promise.resolve().then(() => {
      setForm({
        promo_schedule_tdc: {
          schedule_date: enrollment?.promo_schedule_tdc?.schedule_date || "",
          instructor_id: enrollment?.promo_schedule_tdc?.instructor_id || null,
          care_of_instructor_id: enrollment?.promo_schedule_tdc?.care_of_instructor_id || null,
        },
        promo_schedule_pdc: {
          enabled: isPdcEnrollment || enrollment?.promo_schedule_pdc?.enabled ? "Schedule Now" : "Schedule Later",
          schedule_date: enrollment?.promo_schedule_pdc?.schedule_date || "",
          instructor_id: enrollment?.promo_schedule_pdc?.instructor_id || null,
          care_of_instructor_id: enrollment?.promo_schedule_pdc?.care_of_instructor_id || null,
        },
        student: {
          first_name: enrollment?.student?.first_name || "",
          middle_name: enrollment?.student?.middle_name || "",
          last_name: enrollment?.student?.last_name || "",
          phone: enrollment?.student?.phone || "",
        },
        profile: {
          gmail_account: enrollment?.profile?.gmail_account || enrollment?.Student?.StudentProfile?.gmail_account || "",
        },
      });
      setErrorMessage("");
    });
  }, [isOpen, enrollment, isPdcEnrollment]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        promo_schedule_tdc: {
          schedule_date: form.promo_schedule_tdc.schedule_date || null,
          instructor_id: form.promo_schedule_tdc.instructor_id || null,
          care_of_instructor_id: form.promo_schedule_tdc.care_of_instructor_id || null,
        },
        promo_schedule_pdc: {
          enabled: normalizeBooleanValue(form.promo_schedule_pdc.enabled),
          schedule_date: normalizeBooleanValue(form.promo_schedule_pdc.enabled)
            ? form.promo_schedule_pdc.schedule_date || null
            : null,
          instructor_id: form.promo_schedule_pdc.instructor_id || null,
          care_of_instructor_id: form.promo_schedule_pdc.care_of_instructor_id || null,
        },
        student: {
          first_name: form.student.first_name,
          middle_name: form.student.middle_name,
          last_name: form.student.last_name,
          phone: form.student.phone,
        },
        profile: {
          gmail_account: form.profile.gmail_account,
        },
      };

      return api.put(`/enrollments/${enrollment.id}`, payload);
    },
    onSuccess: async () => {
      // Only invalidate the specific key for pending QR enrollments on the PendingQREnrollmentsPage
      // This prevents the broad ["enrollments"] invalidation from affecting other pages like Pending Approvals
      await queryClient.invalidateQueries({ 
        queryKey: ["enrollments", "pending"],
        exact: false,
      });

      if (typeof onSaveComplete === "function") {
        onSaveComplete("QR enrollment updated successfully.");
      }

      onClose();
    },
    onError: (error) => {
      setErrorMessage(error?.message || "Failed to save changes. Please try again.");
    },
  });

  function handleFieldChange(section, field, value) {
    setErrorMessage("");

    setForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (!form.promo_schedule_tdc.schedule_date) {
      setErrorMessage("TDC desired date is required.");
      return;
    }

    if ((isPdcEnrollment || normalizeBooleanValue(form.promo_schedule_pdc.enabled)) && !form.promo_schedule_pdc.schedule_date) {
      setErrorMessage("PDC desired date is required when Schedule Now is selected.");
      return;
    }

    if (!form.student.first_name || !form.student.last_name) {
      setErrorMessage("Student first and last name are required.");
      return;
    }

    saveMutation.mutate();
  }

  if (!isOpen || !enrollment) {
    return null;
  }

  const studentName = enrollment.student?.first_name || enrollment.Student?.first_name || "Student";
  const schedulePdcNow = isPdcEnrollment || normalizeBooleanValue(form.promo_schedule_pdc.enabled);

  return (
    <div
      style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
      className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
    >
      <div className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#d9c9a0] bg-[#fff9ef] shadow-2xl card-light">
        <div className="flex items-start justify-between border-b border-[#e6d7b6] bg-[#800000] px-6 py-5 text-white">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f0d78a]">QR Enrollment</p>
            <h2 className="mt-2 text-2xl font-bold">Edit Submission</h2>
            <p className="mt-1 text-sm text-white/80">{studentName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="thin-scrollbar flex-1 overflow-y-auto px-6 py-5">
          {errorMessage && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Student Information Section */}
            <section>
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Student Information</h3>
              {/* Address display (read-only) */}
              <div className="mb-3">
                <p className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Address</p>
                <p className="mt-2 rounded-lg border border-[#d9c9a0] bg-white px-3 py-2 text-sm text-slate-800">
                  {buildAddress(enrollment?.profile || enrollment?.Student?.StudentProfile || {}) || "(No address provided)"}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">First Name *</span>
                  <input
                    type="text"
                    value={form.student.first_name}
                    onChange={(event) => handleFieldChange("student", "first_name", event.target.value)}
                    className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Middle Name</span>
                  <input
                    type="text"
                    value={form.student.middle_name}
                    onChange={(event) => handleFieldChange("student", "middle_name", event.target.value)}
                    className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Last Name *</span>
                  <input
                    type="text"
                    value={form.student.last_name}
                    onChange={(event) => handleFieldChange("student", "last_name", event.target.value)}
                    className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Contact Number</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.student.phone}
                    onChange={(event) => handleFieldChange("student", "phone", event.target.value.replace(/\D/g, "").slice(0, 11))}
                    className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Gmail / Email Account</span>
                  <input
                    type="email"
                    value={form.profile.gmail_account}
                    onChange={(event) => handleFieldChange("profile", "gmail_account", event.target.value)}
                    className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>
              </div>
            </section>

            {!isPdcEnrollment ? (
              <section>
                <h3 className="mb-4 text-sm font-semibold text-slate-900">TDC Schedule Session</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Desired Date *</span>
                    <input
                      type="date"
                      value={form.promo_schedule_tdc.schedule_date}
                      onChange={(event) => handleFieldChange("promo_schedule_tdc", "schedule_date", event.target.value)}
                      className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Instructor (Optional)</span>
                    <select
                      value={form.promo_schedule_tdc.instructor_id ?? ""}
                      onChange={(e) => handleFieldChange("promo_schedule_tdc", "instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                    >
                      <option value="">Select instructor</option>
                      {instructors.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Care of Instructor (Optional)</span>
                    <select
                      value={form.promo_schedule_tdc.care_of_instructor_id ?? ""}
                      onChange={(e) => handleFieldChange("promo_schedule_tdc", "care_of_instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                    >
                      <option value="">Select care-of instructor</option>
                      {instructors.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 rounded-lg border border-[#d9c9a0] bg-white px-3 py-2 text-xs text-slate-600">
                  Encoder/staff will finalize the instructor, time slot, and schedule details after review.
                </p>
              </section>
            ) : null}

            {isPdcEnrollment ? (
              <section>
                <h3 className="mb-4 text-sm font-semibold text-slate-900">PDC Schedule Session</h3>
                <div className="space-y-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Desired Date *</span>
                    <input
                      type="date"
                      value={form.promo_schedule_pdc.schedule_date}
                      onChange={(event) => handleFieldChange("promo_schedule_pdc", "schedule_date", event.target.value)}
                      className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Instructor (Optional)</span>
                      <select
                        value={form.promo_schedule_pdc.instructor_id ?? ""}
                        onChange={(e) => handleFieldChange("promo_schedule_pdc", "instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                        className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                      >
                        <option value="">Select instructor</option>
                        {instructors.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Care of Instructor (Optional)</span>
                      <select
                        value={form.promo_schedule_pdc.care_of_instructor_id ?? ""}
                        onChange={(e) => handleFieldChange("promo_schedule_pdc", "care_of_instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                        className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                      >
                        <option value="">Select care-of instructor</option>
                        {instructors.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="rounded-lg border border-[#d9c9a0] bg-white px-3 py-2 text-xs text-slate-600">
                    Staff will assign the final schedule details after review.
                  </p>
                </div>
              </section>
            ) : null}

            {isPromoEnrollment ? (
              <section>
                <h3 className="mb-4 text-sm font-semibold text-slate-900">PDC Schedule Session</h3>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-600 mb-3">PDC Start Option</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleFieldChange("promo_schedule_pdc", "enabled", "Schedule Now")}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        schedulePdcNow
                          ? "bg-[#800000] text-white"
                          : "border border-[#d9c9a0] bg-white text-slate-700 hover:border-[#800000]"
                      }`}
                    >
                      Schedule PDC Now
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFieldChange("promo_schedule_pdc", "enabled", "Schedule Later")}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        !schedulePdcNow
                          ? "bg-[#800000] text-white"
                          : "border border-[#d9c9a0] bg-white text-slate-700 hover:border-[#800000]"
                      }`}
                    >
                      Schedule PDC Later
                    </button>
                  </div>
                </div>

                {schedulePdcNow ? (
                  <div className="space-y-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Desired Date *</span>
                      <input
                        type="date"
                        value={form.promo_schedule_pdc.schedule_date}
                        onChange={(event) => handleFieldChange("promo_schedule_pdc", "schedule_date", event.target.value)}
                        className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Instructor (Optional)</span>
                        <select
                          value={form.promo_schedule_pdc.instructor_id ?? ""}
                          onChange={(e) => handleFieldChange("promo_schedule_pdc", "instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                        >
                          <option value="">Select instructor</option>
                          {instructors.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Care of Instructor (Optional)</span>
                        <select
                          value={form.promo_schedule_pdc.care_of_instructor_id ?? ""}
                          onChange={(e) => handleFieldChange("promo_schedule_pdc", "care_of_instructor_id", e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="h-10 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                        >
                          <option value="">Select care-of instructor</option>
                          {instructors.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#d9c9a0] bg-white px-4 py-3">
                    <p className="text-sm text-slate-600">
                      PDC is set to Schedule Later. The date can be filled once Schedule PDC Now is selected or updated later by staff.
                    </p>
                  </div>
                )}

                <p className="mt-2 rounded-lg border border-[#d9c9a0] bg-white px-3 py-2 text-xs text-slate-600">
                  If Schedule Now is selected, staff will use the preferred date and assign instructor, vehicle, and final slot after review.
                </p>
              </section>
            ) : null}
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-[#e6d7b6] bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-[#800000] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#680000] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
