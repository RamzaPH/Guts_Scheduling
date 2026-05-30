import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, X } from "lucide-react";
import { fetchDailyReports, updateScheduleRemarks } from "../services/dashboardApi";
import { formatDateToISO, formatReadableDate } from "../../../shared/utils/date";
import { useAuth } from "../../auth/hooks/useAuth";

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeRuleText(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized.includes("manual") && normalized.includes("automatic")) {
    return "Manual Transmission (M/T) allowed to drive A/T or Automatic Transmission (A/T) not allowed to drive M/T";
  }
  if (normalized.includes("manual")) {
    return "Manual Transmission (M/T) allowed to drive A/T";
  }
  if (normalized.includes("automatic")) {
    return "Automatic Transmission (A/T) not allowed to drive M/T";
  }
  return value || "-";
}

function courseTypeLabel(courseType) {
  if (!courseType) return "";
  const normalized = String(courseType).toLowerCase();
  if (normalized === "tdc") return "TDC (For TDC Application)";
  if (normalized === "pdc_beginner") return "PDC (For PDC Beginner Application)";
  if (normalized === "pdc_experience") return "PDC (For PDC Experience Application)";
  return "";
}

function groupInstructorKey(entry) {
  return [
    normalizeText(entry.careOfInstructor || entry.instructor),
    normalizeText(entry.instructor),
    normalizeText(entry.transmissionRule || entry.transmissionType),
    normalizeText(entry.vehicleType),
    normalizeText(entry.courseType),
  ].join("|");
}

function extractTrainerName(value) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const trainerMatch = text.match(/\b([^(/]+?)\s*\(Trainer\)\s*$/i);
  if (trainerMatch?.[1]) {
    return trainerMatch[1].trim();
  }

  const splitMatch = text.split("/").map((part) => part.trim());
  if (splitMatch.length > 1) {
    const candidate = splitMatch[splitMatch.length - 1].replace(/\s*\(Trainer\)\s*$/i, "").trim();
    if (candidate) return candidate;
  }

  return text.replace(/\s*\(Care Of\)\s*/i, " ").replace(/\s*\(Trainer\)\s*$/i, "").trim() || "-";
}

function buildDraftKey(scope, scheduleId) {
  return `${scope}:${scheduleId}`;
}

function studentDraftKey(scheduleId) {
  return buildDraftKey("student", scheduleId);
}

function cleanRemarksValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/^\[AUTO_GROUP:/i.test(normalized)) return "";
  if (normalized.toLowerCase() === "available schedule slot") return "";
  return value;
}

function groupByInstructor(entries) {
  const grouped = new Map();

  entries.forEach((entry) => {
    const key = groupInstructorKey(entry);
    const slot = String(entry.slot || "").toLowerCase();

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        instructor: extractTrainerName(entry.instructor || "-"),
        careOf: entry.careOfInstructor || entry.instructor || "-",
        transmission: escapeRuleText(entry.transmissionRule || entry.transmissionType || "-"),
        vehicleType: entry.vehicleType || "-",
        courseType: entry.courseType || "",
        instructorRemarks: entry.instructorRemarks || "",
        morningStudents: [],
        afternoonStudents: [],
        otherStudents: [],
        allEntries: [],
      });
    }

    const normalizedSlot = slot === "afternoon" ? "afternoon" : slot === "morning" ? "morning" : "other";

    const group = grouped.get(key);
    group[normalizedSlot === "morning" ? "morningStudents" : normalizedSlot === "afternoon" ? "afternoonStudents" : "otherStudents"].push({
      ...entry,
      slot,
    });
    group.allEntries.push({ ...entry, slot });
  });

  return Array.from(grouped.values());
}

function InstructorScheduleCards({
  groups,
  remarksDrafts,
  instructorRemarksDrafts,
  onDraftChange,
  onInstructorDraftChange,
  onSave,
  onSaveInstructorRemarks,
  savingDraftKey,
  canSave,
  printMode = false,
}) {
  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7c58f] bg-[#fff8e8] px-4 py-6 text-center text-sm text-slate-600">
        No schedules found for this date.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[18px] border border-[#7e2b2b] bg-[#6b2b2b] p-3 md:p-4">
      {groups.map((group) => (
        <article key={group.key} className="rounded-2xl border border-[#d2c08d] bg-[#d8cfb1] p-3 text-[13px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)] md:p-4">
          {group.courseType ? (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a1717]">
              {courseTypeLabel(group.courseType)}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <section className="min-w-0 rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a1717]">Instructor Details</p>
              <div className="space-y-1 text-[14px] font-normal leading-[1.45] text-slate-900 md:text-[15px]">
                <p><span className="font-medium">Instructor Name:</span> {group.instructor || "-"}</p>
                <p><span className="font-medium">Care-of Instructor Name:</span> {group.careOf || "-"}</p>
                <p><span className="font-medium">Vehicle Transmission:</span> {group.transmission || "-"}</p>
                <p><span className="font-medium">Vehicle To Be Used:</span> {group.vehicleType || "-"}</p>
              </div>

              {printMode ? (
                <p className="mt-3 text-[12px] leading-[1.45] text-slate-900">
                  Instructor Remarks: {cleanRemarksValue(instructorRemarksDrafts[group.key] ?? group.instructorRemarks ?? "") || "-"}
                </p>
              ) : (
                <>
                  <label className="mt-3 block">
                    <span className="text-[12px] font-medium text-[#5f4b2d]">Instructor Remarks</span>
                    <textarea
                      value={instructorRemarksDrafts[group.key] ?? group.instructorRemarks ?? ""}
                      onChange={(event) => onInstructorDraftChange?.(group.key, event.target.value)}
                      rows={3}
                      placeholder="Type remarks"
                      className="mt-1 w-full rounded-xl border border-[#c9b57f] bg-[#f6efda] px-3 py-2 text-[13px] outline-none focus:border-[#800000]"
                    />
                  </label>

                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onSaveInstructorRemarks?.(group)}
                      disabled={!canSave || savingDraftKey === group.key}
                      className="rounded-lg bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#650000] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingDraftKey === group.key ? "Saving..." : "Save Remarks"}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="min-w-0 rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-[#efe4c8] px-6 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-slate-900">
                  MORNING (8AM - 12NN)
                </span>
              </div>

              <div className="space-y-3">
                {group.morningStudents.length ? (
                  group.morningStudents.map((entry) => (
                    <ScheduleCard
                      key={entry.id}
                      entry={entry}
                      remarksDrafts={remarksDrafts}
                      onDraftChange={onDraftChange}
                      onSave={onSave}
                      savingDraftKey={savingDraftKey}
                      canSave={canSave}
                      printMode={printMode}
                    />
                  ))
                ) : (
                  <EmptySlotCard />
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-[#efe4c8] px-6 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-slate-900">
                  AFTERNOON (1PM-5PM)
                </span>
              </div>

              <div className="space-y-3">
                {group.afternoonStudents.length ? (
                  group.afternoonStudents.map((entry) => (
                    <ScheduleCard
                      key={entry.id}
                      entry={entry}
                      remarksDrafts={remarksDrafts}
                      onDraftChange={onDraftChange}
                      onSave={onSave}
                      savingDraftKey={savingDraftKey}
                      canSave={canSave}
                      printMode={printMode}
                    />
                  ))
                ) : (
                  <EmptySlotCard />
                )}
              </div>
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}

function DailyEnrollmentCards({ entries }) {
  if (!entries.length) {
    return null;
  }

  return (
    <section className="mb-4 rounded-[18px] border border-[#d7c58f] bg-[#fff8e8] p-3 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a1717]">Daily Enrollments</p>
          <p className="text-[12px] text-slate-600">Public QR and enrollment-page submissions for the selected date.</p>
        </div>
        <span className="rounded-full bg-[#efe4c8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-900">
          {entries.length} entries
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4 text-[13px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a1717]">{entry.transactionType || "Enrollment"}</p>
            <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{entry.studentName || "-"}</p>
            <div className="mt-2 space-y-1 text-[13px] leading-[1.45] text-slate-900">
              <p><span className="font-medium">Course:</span> {entry.course || "-"}</p>
              <p><span className="font-medium">Instructor:</span> {entry.instructor || "-"}</p>
              <p><span className="font-medium">Care Of:</span> {entry.careOf || "-"}</p>
              <p><span className="font-medium">Vehicle:</span> {entry.vehicleType || "-"}</p>
              <p><span className="font-medium">Slot:</span> {entry.slotLabel || "-"}</p>
            </div>
            {entry.remarks ? (
              <p className="mt-3 rounded-xl border border-[#cbb981] bg-[#f4ebcf] px-3 py-2 text-[12px] text-slate-700">
                {entry.remarks}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptySlotCard() {
  return (
    <div className="rounded-xl border border-dashed border-[#c9b57f] bg-[#efe4c8] px-3 py-6 text-center text-sm text-slate-700">
      No schedules.
    </div>
  );
}

function ScheduleCard({
  entry,
  remarksDrafts,
  onDraftChange,
  onSave,
  savingDraftKey,
  canSave,
  printMode = false,
}) {
  const draftKey = studentDraftKey(entry.id);
  const resolvedRemarks = cleanRemarksValue(remarksDrafts[draftKey] ?? entry.studentRemarks ?? entry.remarks ?? "");

  return (
    <article className="rounded-xl border border-[#cbb981] bg-[#efe4c8] p-3">
      <p className="text-[14px] font-semibold leading-[1.3] text-slate-900 md:text-[15px]">{entry.studentName || "-"}</p>
      <div className="mt-2 space-y-1 text-[13px] font-normal leading-[1.45] text-slate-900 md:text-[14px]">
        <p>LTO/LTMS Portal Account: {entry.ltoPortalAccount || "-"}</p>
        <p>Email Address: {entry.studentEmail || "-"}</p>
        <p>Contact: {entry.studentContact || "-"}</p>
        {entry.isAlreadyDriver ? (
          <>
            <p>Target Vehicle: {entry.targetVehicle || "-"}</p>
            <p>Target Transmission: {escapeRuleText(entry.transmissionRule || entry.transmissionType || "-")}</p>
          </>
        ) : null}
      </div>

      {printMode ? (
        <p className="mt-3 text-[15px] leading-[1.45] text-slate-900">Student Remarks: {resolvedRemarks || "-"}</p>
      ) : (
        <>
          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-[#5f4b2d]">Student Remarks</span>
            <textarea
              value={resolvedRemarks}
              onChange={(event) => onDraftChange?.(draftKey, event.target.value)}
              rows={2}
              placeholder="Type remarks"
              className="mt-1 w-full rounded-xl border border-[#c9b57f] bg-[#f6efda] px-3 py-2 text-[13px] outline-none focus:border-[#800000]"
            />
          </label>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onSave?.({ id: entry.id, draftKey })}
              disabled={!canSave || savingDraftKey === draftKey}
              className="rounded-lg bg-[#800000] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#650000] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingDraftKey === draftKey ? "Saving..." : "Save Remarks"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function CalendarSchedulePrintView({ selectedDate, groups, remarksDrafts, instructorRemarksDrafts }) {
  return (
    <section className="calendar-print-root hidden print:block print:text-[11pt] print:text-slate-900">
      <div className="mx-auto min-h-[297mm] w-[210mm] bg-[#f8f2e4] px-4 py-4 [font-family:'Trebuchet_MS','Segoe_UI',sans-serif] [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
        <header className="mb-6 rounded-xl border border-[#d7c58f] bg-[#8b0000] px-4 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f0d78a]">Calendar Schedule</p>
          <h2 className="mt-1 text-[32px] font-bold leading-tight">{selectedDate ? formatReadableDate(selectedDate) : "Selected date"}</h2>
        </header>

        <div className="space-y-4">
          {groups.map((group) => (
            <article key={group.key} className="rounded-2xl border-2 border-[#8b0000] bg-[#d8cfb1] p-4 shadow-md [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
              {group.courseType ? (
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b0000]">
                  {courseTypeLabel(group.courseType)}
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-4">
                {/* INSTRUCTOR COLUMN */}
                <section className="rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#5a1717]">
                    Instructor Details
                  </p>
                  <div className="space-y-1 text-[12px] font-normal leading-[1.4] text-slate-900">
                    <p>
                      <span className="font-semibold">Instructor Name:</span>
                      <br />
                      {group.instructor || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Care-of Instructor Name:</span>
                      <br />
                      {group.careOf || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Vehicle Transmission:</span>
                      <br />
                      {group.transmission || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Vehicle To Be Used:</span>
                      <br />
                      {group.vehicleType || "-"}
                    </p>
                    <p>
                      <span className="font-semibold">Instructor Remarks:</span>
                      <br />
                      {cleanRemarksValue(instructorRemarksDrafts[group.key] ?? group.instructorRemarks ?? "") || "-"}
                    </p>
                  </div>
                </section>

                {/* MORNING COLUMN */}
                <section className="rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
                  <div className="mb-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5a1717]">
                      Morning (8am - 12nn)
                    </p>
                  </div>

                  <div className="space-y-2">
                    {group.morningStudents.length ? (
                      group.morningStudents.map((entry) => {
                        const resolvedRemarks = cleanRemarksValue(remarksDrafts[studentDraftKey(entry.id)] ?? entry.studentRemarks ?? entry.remarks ?? "");
                        return (
                          <div key={entry.id} className="rounded-xl border border-[#cbb981] bg-[#efe4c8] p-2">
                            <p className="text-[11px] font-semibold leading-tight text-slate-900">
                              {entry.studentName || "-"}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-700">
                              {entry.ltoPortalAccount || "-"}
                            </p>
                            <p className="text-[10px] text-slate-700">
                              {entry.studentEmail || "-"}
                            </p>
                            <p className="text-[10px] text-slate-700">
                              {entry.studentContact || "-"}
                            </p>
                            {resolvedRemarks && (
                              <p className="mt-1 text-[9px] italic text-slate-600">
                                Student Remarks: {resolvedRemarks}
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#c9b57f] bg-[#efe4c8] px-2 py-4 text-center text-[10px] text-slate-600">
                        No schedules
                      </div>
                    )}
                  </div>
                </section>

                {/* AFTERNOON COLUMN */}
                <section className="rounded-2xl border border-[#cbb981] bg-[#eadfbe] p-4">
                  <div className="mb-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#5a1717]">
                      Afternoon (1pm-5pm)
                    </p>
                  </div>

                  <div className="space-y-2">
                    {group.afternoonStudents.length ? (
                      group.afternoonStudents.map((entry) => {
                        const resolvedRemarks = cleanRemarksValue(remarksDrafts[studentDraftKey(entry.id)] ?? entry.studentRemarks ?? entry.remarks ?? "");
                        return (
                          <div key={entry.id} className="rounded-xl border border-[#cbb981] bg-[#efe4c8] p-2">
                            <p className="text-[11px] font-semibold leading-tight text-slate-900">
                              {entry.studentName || "-"}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-700">
                              {entry.ltoPortalAccount || "-"}
                            </p>
                            <p className="text-[10px] text-slate-700">
                              {entry.studentEmail || "-"}
                            </p>
                            <p className="text-[10px] text-slate-700">
                              {entry.studentContact || "-"}
                            </p>
                            {resolvedRemarks && (
                              <p className="mt-1 text-[9px] italic text-slate-600">
                                Student Remarks: {resolvedRemarks}
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#c9b57f] bg-[#efe4c8] px-2 py-4 text-center text-[10px] text-slate-600">
                        No schedules
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function CalendarScheduleModal({
  isOpen,
  selectedDate,
  onClose,
}) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const selectedDateIso = selectedDate ? formatDateToISO(selectedDate) : "";
  const [remarksDrafts, setRemarksDrafts] = useState({});
  const [instructorRemarksDrafts, setInstructorRemarksDrafts] = useState({});

  const canSaveRemarks = role === "admin";

  const remarksMutation = useMutation({
    mutationFn: async ({ scheduleEntries, scheduleIds, scheduleId, remarks, studentRemarks, instructorRemarks, draftKey }) => {
      const entries = Array.isArray(scheduleEntries) && scheduleEntries.length
        ? scheduleEntries
        : (Array.isArray(scheduleIds) && scheduleIds.length
          ? scheduleIds.map((id) => ({ id, remarks }))
          : [scheduleId].filter(Boolean).map((id) => ({ id, remarks })));

      await Promise.all(entries.map((entry) => updateScheduleRemarks({
        scheduleId: entry.id,
        remarks: entry.remarks ?? remarks ?? studentRemarks ?? "",
        studentRemarks,
        instructorRemarks,
      })));

      return { draftKey };
    },
    onSuccess: async (_, vars) => {
      setRemarksDrafts((current) => ({ ...current, [vars.draftKey]: "" }));
      setInstructorRemarksDrafts((current) => ({ ...current, [vars.draftKey]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["reports", "daily", "calendar-schedule-modal", selectedDateIso] });
      await queryClient.invalidateQueries({ queryKey: ["reports", "daily"] });
    },
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "daily", "calendar-schedule-modal", selectedDateIso],
    queryFn: () =>
      fetchDailyReports({
        mode: "day",
        date: selectedDateIso,
      }),
    enabled: isOpen && Boolean(selectedDateIso),
    staleTime: 15 * 1000,
  });

  const allSchedules = useMemo(() => {
    const availability = Array.isArray(data?.availability) ? data.availability : [];
    return availability.flatMap((slot) =>
      (slot?.schedules || []).map((entry) => ({
        ...entry,
        slot: slot.slot,
      }))
    );
  }, [data]);

  const dailyEnrollmentEntries = useMemo(() => {
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.filter((item) => String(item?.transactionType || "").toLowerCase().includes("enrollment"));
  }, [data]);

  const instructorGroups = useMemo(() => groupByInstructor(allSchedules), [allSchedules]);

  function updateDraft(draftKey, value) {
    setRemarksDrafts((current) => ({
      ...current,
      [draftKey]: value,
    }));
  }

  function updateInstructorDraft(draftKey, value) {
    setInstructorRemarksDrafts((current) => ({
      ...current,
      [draftKey]: value,
    }));
  }

  function saveRemarks(entry) {
    if (!entry?.id || !canSaveRemarks) {
      return;
    }

    const draftValue = String(remarksDrafts[entry.draftKey] || "").trim();
    const fallbackRemarks = draftValue || String(entry.studentRemarks || entry.remarks || "").trim();

    remarksMutation.mutate({
      scheduleId: entry.id,
      remarks: fallbackRemarks,
      studentRemarks: draftValue,
      draftKey: entry.draftKey,
    });
  }

  function saveInstructorRemarks(group) {
    if (!group?.allEntries?.length || !canSaveRemarks) {
      return;
    }

    const draftValue = String(instructorRemarksDrafts[group.key] || "").trim();
    const scheduleEntries = group.allEntries.map((entry) => ({
      id: entry.id,
      remarks: String(entry.studentRemarks || entry.remarks || "").trim(),
    }));

    remarksMutation.mutate({
      scheduleEntries,
      instructorRemarks: draftValue,
      draftKey: group.key,
    });
  }

  function handlePrint() {
    window.print();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
        className="fixed inset-y-0 right-0 z-9999 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/55 p-3 backdrop-blur-sm print:hidden md:p-4"
      >
        <div className="flex max-h-[92vh] w-[min(96vw,1260px)] flex-col overflow-hidden rounded-[24px] border border-[#d4af37]/30 bg-[linear-gradient(180deg,#fffdf7_0%,#f8f2e4_100%)] [font-family:'Trebuchet_MS','Segoe_UI',sans-serif] shadow-[0_32px_80px_rgba(40,8,8,0.45)] lg:w-[min(calc(100vw-300px),1260px)]">
          <header className="flex items-start justify-between gap-4 border-b border-[#e6d7b6] bg-[#8b0000] px-6 py-5 text-white">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f0d78a]">Calendar Schedule</p>
              <h2 className="mt-2 text-[29px] font-semibold leading-tight md:text-[44px]">{selectedDate ? formatReadableDate(selectedDate) : "Selected date"}</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-[#6f0000] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5a0000]"
              >
                <Printer size={16} />
                Print Report
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/25 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f8f2e4] p-3 md:p-4">
            {isLoading ? (
              <div className="rounded-2xl border border-[#dfcfaa] bg-white/80 px-5 py-10 text-center text-lg text-slate-700">
                Loading schedule details...
              </div>
            ) : null}

            {isError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center text-base text-red-700">
                {error?.message || "Failed to load schedule details for this date."}
              </div>
            ) : null}

            {remarksMutation.isError ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {remarksMutation.error?.message || "Failed to save remarks."}
              </div>
            ) : null}

            {!canSaveRemarks ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Only admins can save schedule remarks.
              </div>
            ) : null}

            {!isLoading && !isError ? (
              <>
                <DailyEnrollmentCards entries={dailyEnrollmentEntries} />
                <InstructorScheduleCards
                  groups={instructorGroups}
                  remarksDrafts={remarksDrafts}
                  instructorRemarksDrafts={instructorRemarksDrafts}
                  onDraftChange={updateDraft}
                  onInstructorDraftChange={updateInstructorDraft}
                  onSave={saveRemarks}
                  onSaveInstructorRemarks={saveInstructorRemarks}
                  savingDraftKey={remarksMutation.variables?.draftKey}
                  canSave={canSaveRemarks}
                />
              </>
            ) : null}
          </main>
        </div>
      </div>

      {!isLoading && !isError ? (
        <CalendarSchedulePrintView
          selectedDate={selectedDate}
          groups={instructorGroups}
          remarksDrafts={remarksDrafts}
          instructorRemarksDrafts={instructorRemarksDrafts}
        />
      ) : null}
    </>
  );
}
