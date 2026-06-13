import { lazy, Suspense, useState } from "react";
import { Download, Search } from "lucide-react";
import StudentTable from "../components/StudentTable";
import SummaryCards from "../components/SummaryCards";
import ToastStack from "../../../shared/utils/ToastStack";
import { useStudentsPageLogic } from "../hooks/useStudentsPageLogic";
import { useAuth } from "../../auth/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { exportStudents } from "../services/studentsApi";

const StudentDetailsModal = lazy(() => import("../components/StudentDetailsModal"));
const EditStudentModal = lazy(() => import("../components/EditStudentModal"));
const DeleteConfirmationDialog = lazy(() => import("../components/DeleteConfirmationDialog"));
const StatusUpdateModal = lazy(() => import("../components/StatusUpdateModal"));
const BulkStatusUpdateModal = lazy(() => import("../components/BulkStatusUpdateModal"));
const OnlineTdcImportModal = lazy(() => import("../components/OnlineTdcImportModal"));
// BAGONG IMPORT PARA SA SCHEDULE MODAL
const StudentScheduleModal = lazy(() => import("../components/StudentScheduleModal"));

function StudentsPage() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const focusedStudentId = searchParams.get("focusStudentId");
  const view = searchParams.get("view") || "overall";
  const [isExporting, setIsExporting] = useState(false);

  // BAGONG STATE PARA I-TRACK KUNG KANINONG SCHEDULE ANG BUBUKSAN
  const [scheduleModalStudent, setScheduleModalStudent] = useState(null);

  const {
    search,
    courseFilter,
    paymentFilter,
    sortBy,
    selectedStudent,
    editingStudent,
    editForm,
    deletingStudent,
    updatingStatusStudent,
    statusForm,
    selectedStudentIds,
    isBulkStatusModalOpen,
    bulkStatusForm,
    bulkSelectionMeta,
    allVisibleSelected,
    toasts,
    students,
    summary,
    pagination,
    isLoading,
    isError,
    error,
    isUpdatingStudent,
    isDeletingStudent,
    isUpdatingStatus,
    isBulkUpdatingStatus,
    setEditForm,
    setStatusForm,
    setBulkStatusForm,
    setSelectedStudent,
    setDeletingStudent,
    addToast,
    removeToast,
    setSearch,
    setCourseFilter,
    setPaymentFilter,
    toggleSelectStudent,
    toggleSelectAllVisible,
    openBulkStatusModal,
    closeBulkStatusModal,
    submitBulkStatusUpdate,
    goToPreviousPage,
    goToNextPage,
    openEditModal,
    closeEditModal,
    submitEdit,
    openStatusUpdateModal,
    closeStatusUpdateModal,
    submitStatusUpdate,
    quickApprovePendingStudent,
    confirmDelete,
    toggleTableSort,
    refetchStudents,
  } = useStudentsPageLogic({ focusedStudentId, view });

  const [exportFormat, setExportFormat] = useState("csv");
  const [exportRange, setExportRange] = useState("overall");
  const [isOnlineTdcUploadOpen, setIsOnlineTdcUploadOpen] = useState(false);
  const [onlineTdcFile, setOnlineTdcFile] = useState(null);
  const [onlineTdcSource, setOnlineTdcSource] = useState("saferoads");

  async function handleExport() {
    try {
      setIsExporting(true);
      const rangeParam = exportRange === "overall" ? undefined : exportRange;
      const blob = await exportStudents(exportFormat, rangeParam);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const extension = exportFormat === "excel" || exportFormat === "xls" || exportFormat === "xlsx" ? "xls" : "csv";
      anchor.download = `students-${new Date().toISOString().slice(0, 10)}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      addToast(`Student list exported successfully (${extension.toUpperCase()}).`, "success");
    } catch (exportError) {
      addToast(exportError?.message || "Failed to export student data.", "error");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4">
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <div className="rounded-2xl border border-slate-300 bg-gradient-to-r from-white to-slate-100 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Database</h1>
            <p className="text-sm text-slate-600">Admin and Staff view of enrolled students</p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <label className="relative w-full sm:w-auto">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#D4AF37]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search student..."
                className="h-10 w-full sm:w-64 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none ring-[#800000]/20 placeholder:text-slate-400 focus:border-[#800000] focus:ring-2"
              />
            </label>
            <div className="flex flex-wrap gap-2 md:ml-2">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  courseFilter === "all" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setCourseFilter("all")}
              >
                Overall
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  courseFilter === "TDC" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setCourseFilter("TDC")}
              >
                TDC
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  courseFilter === "PDC" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setCourseFilter("PDC")}
              >
                PDC
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  courseFilter === "passed" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setCourseFilter("passed")}
              >
                Completed / Passed
              </button>
            </div>
            <div className="flex flex-wrap gap-2 md:ml-2">
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  paymentFilter === "all" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setPaymentFilter("all")}
              >
                All Payments
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  paymentFilter === "with_balance" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setPaymentFilter("with_balance")}
              >
                With Balance
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  paymentFilter === "completed_payment" ? "bg-[#800000] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                onClick={() => setPaymentFilter("completed_payment")}
              >
                Completed Payments
              </button>
            </div>
            <button
              type="button"
              onClick={openBulkStatusModal}
              disabled={selectedStudentIds.length === 0}
              className="h-10 rounded-lg bg-[#800000] px-3 text-xs font-semibold text-white transition hover:bg-[#690000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bulk Update Status ({selectedStudentIds.length})
            </button>
            <button
              type="button"
              onClick={() => setIsOnlineTdcUploadOpen(true)}
              className="h-10 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-700"
            >
              Upload Students
            </button>
            <div className="flex items-center gap-2">
              <select
                value={exportRange}
                onChange={(e) => setExportRange(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none"
              >
                <option value="overall">Overall</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none"
              >
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="h-10 rounded-lg border border-[#800000]/30 bg-white px-3 text-xs font-semibold text-[#800000] transition hover:bg-[#800000]/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Download size={14} />
                  {isExporting ? "Exporting..." : "Export"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SummaryCards summary={summary} courseFilter={courseFilter} />

      <StudentTable
        students={students}
        isLoading={isLoading}
        isError={isError}
        error={error}
        pagination={pagination}
        onView={setSelectedStudent}
        onEdit={openEditModal}
        onUpdateStatus={openStatusUpdateModal}
        // BAGONG PROP PASSED TO TABLE
        onViewSchedule={setScheduleModalStudent}
        onDelete={setDeletingStudent}
        canDelete={role === "admin"}
        onClickPendingBadge={quickApprovePendingStudent}
        selectedStudentIds={selectedStudentIds}
        allVisibleSelected={allVisibleSelected}
        onToggleSelectStudent={toggleSelectStudent}
        onToggleSelectAllVisible={toggleSelectAllVisible}
        onPreviousPage={goToPreviousPage}
        onNextPage={goToNextPage}
        sortBy={sortBy}
        onToggleSort={toggleTableSort}
      />

      <Suspense fallback={null}>
        <StudentDetailsModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />

        <EditStudentModal
          student={editingStudent}
          form={editForm}
          onChange={setEditForm}
          onClose={closeEditModal}
          onSubmit={submitEdit}
          isPending={isUpdatingStudent}
        />

        <DeleteConfirmationDialog
          student={deletingStudent}
          onCancel={() => setDeletingStudent(null)}
          onConfirm={confirmDelete}
          isPending={isDeletingStudent}
        />

        <StatusUpdateModal
          student={updatingStatusStudent}
          form={statusForm}
          onChange={setStatusForm}
          onClose={closeStatusUpdateModal}
          onSubmit={submitStatusUpdate}
          isPending={isUpdatingStatus}
        />

        <BulkStatusUpdateModal
          isOpen={isBulkStatusModalOpen}
          selectedCount={selectedStudentIds.length}
          selectionMeta={bulkSelectionMeta}
          form={bulkStatusForm}
          onChange={setBulkStatusForm}
          onClose={closeBulkStatusModal}
          onSubmit={submitBulkStatusUpdate}
          isPending={isBulkUpdatingStatus}
        />
        <OnlineTdcImportModal
          isOpen={isOnlineTdcUploadOpen}
          onClose={() => {
            setIsOnlineTdcUploadOpen(false);
            setOnlineTdcFile(null);
            setOnlineTdcSource("saferoads");
          }}
          file={onlineTdcFile}
          onFileChange={setOnlineTdcFile}
          source={onlineTdcSource}
          onSourceChange={setOnlineTdcSource}
          onImportSuccess={() => {
            setIsOnlineTdcUploadOpen(false);
            setOnlineTdcFile(null);
            setOnlineTdcSource("saferoads");
            refetchStudents();
          }}
        />

        {/* BAGONG MODAL KUNG MAY NAPILING STUDENT PARA SA SCHEDULE */}
        {scheduleModalStudent && (
          <StudentScheduleModal
            student={scheduleModalStudent}
            onClose={() => setScheduleModalStudent(null)}
          />
        )}
      </Suspense>
    </section>
  );
}

export default StudentsPage;