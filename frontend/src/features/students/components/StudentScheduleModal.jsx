import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Calendar as CalendarIcon, Clock, User, Car, CheckCircle2, UserCog, GaugeCircle, Pencil, AlertCircle } from "lucide-react";
import { getStudentFullName, getLatestEnrollment, getCourseCode } from "../utils/studentsPageUtils";
import { api } from "../../../services/api";
import { useToast } from "../../../shared/utils/toast";

export default function StudentScheduleModal({ student, onClose }) {
  const queryClient = useQueryClient();
  const [, addToast] = useToast();
  
  const [instructors, setInstructors] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  
  const [form, setForm] = useState({
    tdc_date: "", tdc_instructor: "", tdc_careof: "",
    pdc_date: "", pdc_slot: "morning", pdc_instructor: "", pdc_careof: "",
    reschedule_reason: "emergency"
  });

  const fullName = getStudentFullName(student);
  const latestEnrollment = getLatestEnrollment(student);
  const courseCode = getCourseCode(student) || "N/A";
  
  const schedules = latestEnrollment?.Schedules || latestEnrollment?.scheduledSessions || [];
  
  const isPromo = courseCode.toUpperCase().includes("PROMO");
  const isTDC = courseCode.toUpperCase().includes("TDC") || isPromo;
  const isPDC = courseCode.toUpperCase().includes("PDC") || isPromo;

  let tdcSched = schedules.find(s => String(s.course_type).toLowerCase().includes("tdc"));
  let pdcSched = schedules.find(s => String(s.course_type).toLowerCase().includes("pdc"));

  if (!isPromo) {
    if (isTDC && !tdcSched && schedules.length > 0) tdcSched = schedules[0];
    if (isPDC && !pdcSched && schedules.length > 0) pdcSched = schedules[0];
  }

  function getSlotValue(sched) {
    if (!sched) return "morning";
    if (sched.slot) return sched.slot;
    if (sched.start_time && sched.start_time.startsWith("13")) return "afternoon";
    return "morning";
  }

  function getSlotLabel(sched) {
    return getSlotValue(sched) === "afternoon" ? "Afternoon (1:00 PM - 5:00 PM)" : "Morning (8:00 AM - 12:00 PM)";
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/instructors');
        if (!mounted) return;
        const data = resp?.data || resp;
        let list = [];
        if (Array.isArray(data)) list = data;
        else if (Array.isArray(data?.data)) list = data.data;
        else if (Array.isArray(data?.items)) list = data.items;
        else if (Array.isArray(data?.value)) list = data.value;
        setInstructors(list);
      } catch {
        /* ignore */
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ✅ FIX: Tinuturuan na nating bumasa ng 'String' ang modal kung sakaling na-map na siya from backend
  function getInstName(id, obj) {
    if (typeof obj === "string" && obj.trim() !== "" && obj !== "TBA" && obj !== "-") {
      return obj.toUpperCase();
    }
    if (obj?.name) return obj.name.toUpperCase();
    if (obj?.first_name) return `${obj.first_name} ${obj.last_name || ""}`.trim().toUpperCase();
    if (id) {
      const found = instructors.find(i => Number(i.id) === Number(id));
      if (found) return (found.name || `${found.first_name || ""} ${found.last_name || ""}`).trim().toUpperCase();
    }
    return "TBA";
  }

  const updateScheduleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        promo_schedule_tdc: isTDC ? {
          schedule_date: form.tdc_date || null,
          instructor_id: form.tdc_instructor || null,
          care_of_instructor_id: form.tdc_careof || null,
        } : undefined,
        promo_schedule_pdc: isPDC && form.pdc_date ? {
          schedule_date: form.pdc_date || null,
          slot: form.pdc_slot || "morning",
          instructor_id: form.pdc_instructor || null,
          care_of_instructor_id: form.pdc_careof || null,
        } : undefined,
      };
      return api.put(`/enrollments/${latestEnrollment.id}`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      addToast("Schedule updated successfully!", "success");
      setIsEditing(false);
      
      if (form.reschedule_reason === "penalty") {
        setTimeout(() => alert("Note: Please go to the Payment Ledger to add the Reschedule Penalty Fee for this student."), 500);
      }
    },
    onError: (error) => {
      addToast(error?.message || "Failed to update schedule.", "error");
    }
  });

  if (!student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#fff9ef] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]">
        
        {/* HEADER */}
        <div className="relative border-b border-[#e6d7b6] bg-[#800000] px-6 py-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f0d78a]">
            Class Schedule
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">{fullName}</h2>
          <p className="mt-1 text-xs text-white/80">Enrolled Course: {courseCode}</p>
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/20 p-2 text-white/80 transition hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-4">
          
          {/* TDC SECTION */}
          {isTDC && (
            <div className="rounded-xl border border-[#d9c9a0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fffaf0] border border-[#d9c9a0]">
                    <CalendarIcon size={20} className="text-[#800000]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#800000] uppercase text-sm">Theoretical Driving Course (TDC)</h3>
                    {!isEditing && <span className="inline-flex mt-1 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                      {tdcSched?.status === "completed" ? "Completed" : "Scheduled"}
                    </span>}
                  </div>
                </div>
              </div>

              {!tdcSched?.schedule_date && !isEditing ? (
                <div className="rounded-lg bg-slate-50 p-4 text-center border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-600">Schedule is currently pending or not set</p>
                  <p className="text-xs text-slate-400 mt-1">Details will appear here once finalized.</p>
                </div>
              ) : !isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={15} className="text-[#d4af37]" />
                    <span>Date: <strong className="text-slate-900">{tdcSched?.schedule_date || "TBA"}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-[#d4af37]" />
                    <span>Time: <strong className="text-slate-900">8:00 AM - 5:00 PM (Whole Day)</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-[#d4af37]" />
                    <span>Instructor: <strong className="text-slate-900">{getInstName(tdcSched?.instructor_id || tdcSched?.instructorId, tdcSched?.Instructor || tdcSched?.instructor)}</strong></span>
                  </div>
                  {(tdcSched?.care_of_instructor_id || tdcSched?.careOfInstructorId) && (
                    <div className="flex items-center gap-2">
                      <UserCog size={15} className="text-[#d4af37]" />
                      <span>Care Of: <strong className="text-slate-900">{getInstName(tdcSched?.care_of_instructor_id || tdcSched?.careOfInstructorId, tdcSched?.CareOfInstructor || tdcSched?.careOfInstructor)}</strong></span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Reschedule Date
                    <input type="date" value={form.tdc_date} onChange={e => setForm({...form, tdc_date: e.target.value})} className="h-9 rounded-md border border-slate-300 px-3 text-slate-800" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Main Instructor
                    <select value={form.tdc_instructor} onChange={e => setForm({...form, tdc_instructor: e.target.value})} className="h-9 uppercase rounded-md border border-slate-300 px-3 text-slate-800">
                      <option value="">TBA</option>
                      {instructors.map(i => <option key={i.id} value={i.id} className="uppercase">{String(i.name || `${i.first_name} ${i.last_name}`).toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Care of Instructor
                    <select value={form.tdc_careof} onChange={e => setForm({...form, tdc_careof: e.target.value})} className="h-9 uppercase rounded-md border border-slate-300 px-3 text-slate-800">
                      <option value="">None</option>
                      {instructors.map(i => <option key={i.id} value={i.id} className="uppercase">{String(i.name || `${i.first_name} ${i.last_name}`).toUpperCase()}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* PDC SECTION */}
          {isPDC && (
            <div className="rounded-xl border border-[#d9c9a0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fffaf0] border border-[#d9c9a0]">
                    <Car size={20} className="text-[#800000]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#800000] uppercase text-sm">Practical Driving Course (PDC)</h3>
                    {!isEditing && pdcSched?.schedule_date && <span className="inline-flex mt-1 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                      {pdcSched?.status === "completed" ? "Completed" : "Scheduled"}
                    </span>}
                  </div>
                </div>
              </div>

              {!pdcSched?.schedule_date && !isEditing ? (
                <div className="rounded-lg bg-slate-50 p-4 text-center border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-600">
                    {isPromo ? "PDC scheduled via Schedule PDC Later" : "Schedule is currently pending or not set"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Details will appear here once finalized.</p>
                </div>
              ) : !isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={15} className="text-[#d4af37]" />
                    <span>Date: <strong className="text-slate-900">{pdcSched?.schedule_date}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-[#d4af37]" />
                    <span className="capitalize">Time: <strong className="text-slate-900">{getSlotLabel(pdcSched)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-[#d4af37]" />
                    <span>Instructor: <strong className="text-slate-900">{getInstName(pdcSched?.instructor_id || pdcSched?.instructorId, pdcSched?.Instructor || pdcSched?.instructor)}</strong></span>
                  </div>
                  {(pdcSched?.care_of_instructor_id || pdcSched?.careOfInstructorId) && (
                    <div className="flex items-center gap-2">
                      <UserCog size={15} className="text-[#d4af37]" />
                      <span>Care Of: <strong className="text-slate-900">{getInstName(pdcSched?.care_of_instructor_id || pdcSched?.careOfInstructorId, pdcSched?.CareOfInstructor || pdcSched?.careOfInstructor)}</strong></span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Car size={15} className="text-[#d4af37]" />
                    <span className="capitalize">Vehicle: <strong className="text-slate-900">{latestEnrollment?.target_vehicle || "N/A"} ({latestEnrollment?.transmission_type || "N/A"})</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GaugeCircle size={15} className="text-[#d4af37]" />
                    <span className="capitalize">Level: <strong className="text-slate-900">{latestEnrollment?.pdc_category || "Beginner"}</strong></span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Reschedule Date
                    <input type="date" value={form.pdc_date} onChange={e => setForm({...form, pdc_date: e.target.value})} className="h-9 rounded-md border border-slate-300 px-3 text-slate-800" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Time Slot
                    <select value={form.pdc_slot} onChange={e => setForm({...form, pdc_slot: e.target.value})} className="h-9 uppercase rounded-md border border-slate-300 px-3 text-slate-800">
                      <option value="morning" className="uppercase">Morning (8AM - 12NN)</option>
                      <option value="afternoon" className="uppercase">Afternoon (1PM - 5PM)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Main Instructor
                    <select value={form.pdc_instructor} onChange={e => setForm({...form, pdc_instructor: e.target.value})} className="h-9 uppercase rounded-md border border-slate-300 px-3 text-slate-800">
                      <option value="">TBA</option>
                      {instructors.map(i => <option key={i.id} value={i.id} className="uppercase">{String(i.name || `${i.first_name} ${i.last_name}`).toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                    Care of Instructor
                    <select value={form.pdc_careof} onChange={e => setForm({...form, pdc_careof: e.target.value})} className="h-9 uppercase rounded-md border border-slate-300 px-3 text-slate-800">
                      <option value="">None</option>
                      {instructors.map(i => <option key={i.id} value={i.id} className="uppercase">{String(i.name || `${i.first_name} ${i.last_name}`).toUpperCase()}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* RESCHEDULE REASON (Shows only when editing) */}
          {isEditing && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <label className="flex flex-col gap-1 text-sm font-semibold text-blue-900">
                Reason for Rescheduling
                <select 
                  value={form.reschedule_reason} 
                  onChange={e => setForm({...form, reschedule_reason: e.target.value})}
                  className="mt-1 h-10 rounded-md border border-blue-300 px-3 text-slate-800"
                >
                  <option value="emergency">Emergency / Valid Reason (No Penalty)</option>
                  <option value="penalty">Other Reason (With Penalty Fee)</option>
                </select>
              </label>
              {form.reschedule_reason === "penalty" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-rose-600 font-medium">
                  <AlertCircle size={14} /> Note: You must manually add the Penalty Fee in the Payment Ledger after saving.
                </p>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between border-t border-[#e6d7b6] bg-white px-6 py-4">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                const pdcSlotVal = getSlotValue(pdcSched);
                setForm({
                  tdc_date: tdcSched?.schedule_date || "",
                  tdc_instructor: tdcSched?.instructor_id || tdcSched?.instructorId || tdcSched?.Instructor?.id || "",
                  tdc_careof: tdcSched?.care_of_instructor_id || tdcSched?.careOfInstructorId || tdcSched?.CareOfInstructor?.id || "",
                  pdc_date: pdcSched?.schedule_date || "",
                  pdc_slot: pdcSlotVal,
                  pdc_instructor: pdcSched?.instructor_id || pdcSched?.instructorId || pdcSched?.Instructor?.id || "",
                  pdc_careof: pdcSched?.care_of_instructor_id || pdcSched?.careOfInstructorId || pdcSched?.CareOfInstructor?.id || "",
                  reschedule_reason: "emergency"
                });
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold uppercase text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil size={16} /> Edit Schedule
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold uppercase text-slate-700 transition hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          )}

          <div className="flex gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#800000] px-6 py-2 text-sm font-bold uppercase text-white transition-colors hover:bg-[#680000]"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateScheduleMutation.mutate()}
                disabled={updateScheduleMutation.isPending}
                className="rounded-lg bg-[#800000] px-6 py-2 text-sm font-bold uppercase text-white transition-colors hover:bg-[#680000] disabled:opacity-50"
              >
                {updateScheduleMutation.isPending ? "SAVING..." : "SAVE CHANGES"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}