import { ArrowUpDown, ChevronDown, ChevronUp, Clock, Eye, Pencil, Trash2, Calendar } from "lucide-react";
import {
  buildAddress,
  getCourseCode,
  getEnrollmentTimelineDates,
  getEnrollmentLifecycleStatus,
  getEnrollmentPaymentSummary,
  getPaymentCategoryLabel,
  getLatestEnrollment,
  getLatestScheduleForEnrollment,
  getStudentFullName,
  getStudentScheduleRemarks,
  getStudentSourceLabel,
} from "../utils/studentsPageUtils";
import { getDisplayStatusLabel } from "../utils/statusUpdateConfig";

const twoLineClampStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

function getStatusTone(statusLabel) {
  const normalizedStatusLabel = String(statusLabel || "").toUpperCase();
  if (normalizedStatusLabel.includes("CANCELLED")) return "slate";
  if (normalizedStatusLabel.includes("FAILED")) return "red";
  if (normalizedStatusLabel.includes("PASSED") || normalizedStatusLabel.includes("COMPLETED")) return "green";
  if (
    normalizedStatusLabel.includes("RETAKE") ||
    normalizedStatusLabel.includes("ABSENT") ||
    normalizedStatusLabel.includes("RESCHED") ||
    normalizedStatusLabel.includes("PENALTY")
  ) {
    return "amber";
  }
  if (normalizedStatusLabel.includes("NOT SET")) return "slate";
  return "maroon";
}

function getPaymentTone(paymentStatus) {
  if (paymentStatus === "completed_payment") return "green";
  if (paymentStatus === "partial_payment") return "amber";
  if (paymentStatus === "with_balance") return "red";
  return "slate";
}

function ClampedText({ value }) {
  const safeValue = value || "-";
  return (
    <p style={twoLineClampStyle} className="break-words" title={safeValue}>
      {safeValue}
    </p>
  );
}

function Badge({ label, tone }) {
  const styles = {
    green: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    red: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
    amber: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
    maroon: "bg-[#800000]/10 text-[#800000] ring-1 ring-[#800000]/20",
    slate: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone] || styles.slate}`}>
      {label}
    </span>
  );
}

function getSortState(sortBy, column) {
  const map = {
    student: { asc: "name_asc", desc: "name_desc" },
    contact: { asc: "contact_asc", desc: "contact_desc" },
    course: { asc: "course_asc", desc: "course_desc" },
    status: { asc: "status_asc", desc: "status_desc" },
  };

  const config = map[column];
  if (!config) return { active: false, direction: null };
  if (sortBy === config.asc || (column === "status" && sortBy === "status")) {
    return { active: true, direction: "asc" };
  }
  if (sortBy === config.desc) {
    return { active: true, direction: "desc" };
  }
  return { active: false, direction: null };
}

function SortableHeader({ label, column, sortBy, onToggleSort, className }) {
  const state = getSortState(sortBy, column);

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onToggleSort?.(column)}
        className="inline-flex items-center gap-1 font-semibold text-white/95 hover:text-white"
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        {state.active ? (
          state.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ArrowUpDown size={13} className="opacity-80" />
        )}
      </button>
    </th>
  );
}

export default function StudentTable({
  students,
  isLoading,
  isError,
  error,
  pagination,
  onView,
  onEdit,
  onUpdateStatus,
  onViewSchedule, // BAGONG PROP GALING SA PARENT (StudentsPage.jsx)
  onDelete,
  canDelete,
  onClickPendingBadge,
  selectedStudentIds,
  allVisibleSelected,
  onToggleSelectStudent,
  onToggleSelectAllVisible,
  onPreviousPage,
  onNextPage,
  sortBy,
  onToggleSort,
}) {
  const renderMobileActions = (student) => (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        type="button"
        onClick={() => onView(student)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        <Eye size={14} className="text-[#800000]" />
        View
      </button>
      <button
        type="button"
        onClick={() => onEdit(student)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        <Pencil size={14} className="text-[#8d6f12]" />
        Edit
      </button>
      <button
        type="button"
        onClick={() => onUpdateStatus(student)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        <Clock size={14} className="text-[#800000]" />
        Update
      </button>
      {/* ✅ ADDED: SCHEDULE BUTTON SA MOBILE VIEW */}
      <button
        type="button"
        onClick={() => onViewSchedule?.(student)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
      >
        <Calendar size={14} className="text-[#800000]" />
        Schedule
      </button>
      {canDelete ? (
        <button
          type="button"
          onClick={() => onDelete(student)}
          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
        >
          <Trash2 size={14} className="text-rose-600" />
          Delete
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="md:hidden space-y-3 px-3 py-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading students...
          </div>
        ) : null}

        {!isLoading && isError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
            {error?.message || "Failed to load students"}
          </div>
        ) : null}

        {!isLoading && !isError && students.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No students found for the selected filters.
          </div>
        ) : null}

        {!isLoading && !isError
          ? students.map((student) => {
              const latestEnrollment = getLatestEnrollment(student);
              const enrollmentStatus = getEnrollmentLifecycleStatus(latestEnrollment, student);
              const paymentSummary = getEnrollmentPaymentSummary(latestEnrollment, student);
              const paymentCategory = getPaymentCategoryLabel(latestEnrollment);
              const latestSchedule = getLatestScheduleForEnrollment(latestEnrollment);
              const course = getCourseCode(student);
              const isPromo = course === "PROMO";
              const fullName = getStudentFullName(student);
              const sourceLabel = getStudentSourceLabel(student);
              const isImportedOnlineTdc = sourceLabel !== "Walk-in";
              const timelineDates = getEnrollmentTimelineDates(latestEnrollment, student);
              const statusLabel = !latestEnrollment && isImportedOnlineTdc
                ? "Imported"
                : getDisplayStatusLabel(course, latestEnrollment?.score, enrollmentStatus, {
                    isImportedTdc: isImportedOnlineTdc && course === "TDC",
                  });
              const statusTone = !latestEnrollment && isImportedOnlineTdc ? "slate" : getStatusTone(statusLabel);

              return (
                <div
                  key={student.id}
                  className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${selectedStudentIds.includes(student.id) ? "ring-2 ring-[#800000]/20" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(student.id)}
                      onChange={() => onToggleSelectStudent(student.id)}
                      aria-label={`Select student ${fullName || student.id}`}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]/30"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {fullName || "N/A"}
                          </p>
                          <p className="text-xs text-slate-500">ID #{student.id}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {isPromo ? <Badge label="Promo" tone="maroon" /> : null}
                          {isImportedOnlineTdc ? <Badge label="Online TDC" tone="slate" /> : null}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                        <div>
                          <p className="font-semibold text-slate-500">Contact</p>
                          <p className="mt-0.5 break-words">{student.email || "N/A"}</p>
                          <p className="mt-0.5 break-words text-slate-500">{student.phone || "No phone"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge label={course} tone={isImportedOnlineTdc ? "slate" : "maroon"} />
                          <Badge label={statusLabel} tone={statusTone} />
                          <Badge
                            label={paymentSummary.paymentStatus === "completed_payment" ? "Completed" : paymentSummary.paymentStatus === "partial_payment" ? "Partial" : paymentSummary.paymentStatus === "with_balance" ? "With Balance" : "Not Set"}
                            tone={getPaymentTone(paymentSummary.paymentStatus)}
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Promo Offer</p>
                          <p className="mt-0.5 break-words">{paymentCategory.promoOfferName}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Payment Terms</p>
                          <p className="mt-0.5 break-words">{paymentCategory.paymentTerms}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Balance</p>
                          <p className="mt-0.5 font-semibold text-slate-900">PHP {paymentSummary.remainingBalance.toFixed(2)}</p>
                          <p className="mt-0.5 text-slate-500">Paid: PHP {paymentSummary.totalPaid.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Remarks</p>
                          <p className="mt-0.5 break-words">{latestSchedule?.instructor_remarks || "-"}</p>
                          <p className="mt-0.5 break-words text-slate-500">{getStudentScheduleRemarks(latestSchedule) || "-"}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="font-semibold text-slate-500">Starting</p>
                            <p className="mt-0.5">{timelineDates.startedAt || "N/A"}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-500">Completed</p>
                            <p className="mt-0.5">{timelineDates.completedAt || "N/A"}</p>
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-500">Address</p>
                          <p className="mt-0.5 break-words">{buildAddress(student.StudentProfile)}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        {enrollmentStatus === "pending" && !isImportedOnlineTdc ? (
                          <button
                            type="button"
                            onClick={() => onClickPendingBadge?.(student)}
                            className="mb-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
                          >
                            Click to accept pending enrollment
                          </button>
                        ) : null}
                        {renderMobileActions(student)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      <div className="thin-scrollbar hidden overflow-auto max-h-[440px] md:block">
        <table className="min-w-[2400px] table-fixed text-sm">
          <thead className="sticky top-0 z-10 bg-[#800000] text-left text-white">
            <tr>
              <th className="w-12 rounded-tl-xl px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAllVisible}
                  aria-label="Select all visible students"
                  className="h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]/30"
                />
              </th>
              <SortableHeader label="Student" column="student" sortBy={sortBy} onToggleSort={onToggleSort} className="w-[230px] px-4 py-3" />
              <SortableHeader label="Contact" column="contact" sortBy={sortBy} onToggleSort={onToggleSort} className="w-[210px] px-4 py-3" />
              <SortableHeader label="Course" column="course" sortBy={sortBy} onToggleSort={onToggleSort} className="w-[130px] px-4 py-3" />
              <SortableHeader label="Status" column="status" sortBy={sortBy} onToggleSort={onToggleSort} className="w-[200px] px-4 py-3" />
              <th className="w-[180px] px-4 py-3 font-semibold">Promo Offer</th>
              <th className="w-[160px] px-4 py-3 font-semibold">Payment Terms</th>
              <th className="w-[170px] px-4 py-3 font-semibold">Payment Status</th>
              <th className="w-[160px] px-4 py-3 font-semibold">Balance</th>
              <th className="w-[220px] px-4 py-3 font-semibold">Instructor Remarks</th>
              <th className="w-[220px] px-4 py-3 font-semibold">Student Remarks</th>
              <th className="w-[170px] px-4 py-3 font-semibold">Starting / Registration Date</th>
              <th className="w-[170px] px-4 py-3 font-semibold">End / Completion Date</th>
              <th className="w-[220px] px-4 py-3 font-semibold">Address</th>
              <th className="w-[300px] rounded-tr-xl px-4 py-3 font-semibold">Actions</th> {/* Lumaki nang konti para kumasya yung 5 buttons */}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
                  Loading students...
                </td>
              </tr>
            ) : null}

            {!isLoading && isError ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-rose-700">
                  {error?.message || "Failed to load students"}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && students.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-slate-500">
                  No students found for the selected filters.
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError
              ? students.map((student, index) => {
                  const latestEnrollment = getLatestEnrollment(student);
                  const enrollmentStatus = getEnrollmentLifecycleStatus(latestEnrollment, student);
                  const paymentSummary = getEnrollmentPaymentSummary(latestEnrollment, student);
                  const paymentCategory = getPaymentCategoryLabel(latestEnrollment);
                  const latestSchedule = getLatestScheduleForEnrollment(latestEnrollment);
                  const course = getCourseCode(student);
                  const isPromo = course === "PROMO";
                  const fullName = getStudentFullName(student);
                  const sourceLabel = getStudentSourceLabel(student);
                  const isImportedOnlineTdc = sourceLabel !== "Walk-in";
                  const timelineDates = getEnrollmentTimelineDates(latestEnrollment, student);
                  const statusLabel = !latestEnrollment && isImportedOnlineTdc
                    ? "Imported"
                    : getDisplayStatusLabel(course, latestEnrollment?.score, enrollmentStatus, {
                        isImportedTdc: isImportedOnlineTdc && course === "TDC",
                      });
                  const statusTone = !latestEnrollment && isImportedOnlineTdc ? "slate" : getStatusTone(statusLabel);

                  return (
                    <tr
                      key={student.id}
                      className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50"} transition-colors hover:bg-[#D4AF37]/10`}
                    >
                      <td className="px-4 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => onToggleSelectStudent(student.id)}
                          aria-label={`Select student ${fullName || student.id}`}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#800000] focus:ring-[#800000]/30"
                        />
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
                          {fullName || "N/A"}
                          {isPromo ? <span className="ml-2 rounded-full bg-[#D4AF37]/20 px-2 py-0.5 text-[10px] font-bold text-[#800000]">Promo</span> : null}
                          {isImportedOnlineTdc ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">Online TDC</span> : null}
                        </p>
                        <p className="text-xs text-slate-500">ID #{student.id}</p>
                        {isImportedOnlineTdc ? <p className="mt-0.5 text-[11px] text-slate-400">{sourceLabel}</p> : null}
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <p className="truncate" title={student.email || "N/A"}>{student.email || "N/A"}</p>
                        <p className="truncate text-xs text-slate-500" title={student.phone || "No phone"}>{student.phone || "No phone"}</p>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <Badge label={course} tone={isImportedOnlineTdc ? "slate" : "maroon"} />
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        {enrollmentStatus === "pending" && !isImportedOnlineTdc ? (
                          <button
                            type="button"
                            onClick={() => onClickPendingBadge?.(student)}
                            className="cursor-pointer"
                            title="Click to accept pending enrollment"
                          >
                            <Badge
                              label={statusLabel}
                              tone={statusTone}
                            />
                          </button>
                        ) : (
                          <Badge
                            label={statusLabel}
                            tone={statusTone}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <ClampedText value={paymentCategory.promoOfferName} />
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <ClampedText value={paymentCategory.paymentTerms} />
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <Badge
                          label={paymentSummary.paymentStatus === "completed_payment" ? "Completed" : paymentSummary.paymentStatus === "partial_payment" ? "Partial" : paymentSummary.paymentStatus === "with_balance" ? "With Balance" : "Not Set"}
                          tone={getPaymentTone(paymentSummary.paymentStatus)}
                        />
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <p className="font-semibold text-slate-900">PHP {paymentSummary.remainingBalance.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">Paid: PHP {paymentSummary.totalPaid.toFixed(2)}</p>
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <ClampedText value={latestSchedule?.instructor_remarks} />
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <ClampedText value={getStudentScheduleRemarks(latestSchedule)} />
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <p className="font-medium text-slate-900">{timelineDates.startedAt || "N/A"}</p>
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <p className="font-medium text-slate-900">{timelineDates.completedAt || "N/A"}</p>
                      </td>
                      <td className="px-4 py-2.5 align-top text-slate-700">
                        <ClampedText value={buildAddress(student.StudentProfile)} />
                      </td>
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-slate-700">
                          <button
                            type="button"
                            onClick={() => onView(student)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="View"
                          >
                            <Eye size={16} className="text-[#800000]" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit(student)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="Edit"
                          >
                            <Pencil size={16} className="text-[#8d6f12]" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(student)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="Update Status"
                          >
                            <Clock size={16} className="text-[#800000]" />
                            Update
                          </button>
                          {/* ✅ ADDED: SCHEDULE BUTTON SA DESKTOP VIEW */}
                          <button
                            type="button"
                            onClick={() => onViewSchedule?.(student)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            title="View Schedule"
                          >
                            <Calendar size={16} className="text-[#800000]" />
                            Schedule
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => onDelete(student)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              title="Delete"
                            >
                              <Trash2 size={16} className="text-rose-600" />
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center">
        <p>
          Showing {pagination.fromEntry} to {pagination.toEntry} of {pagination.totalEntries} entries
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPreviousPage}
            disabled={pagination.currentPage <= 1}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
            {pagination.currentPage} / {pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={onNextPage}
            disabled={pagination.currentPage >= pagination.totalPages}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}