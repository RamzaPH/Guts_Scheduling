import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import CalendarWidget from "../components/CalendarWidget";
import DashboardGrid from "../components/DashboardGrid";
import DailyReportsCard from "../components/DailyReportsCard";
import MonthlyEnrollmentCard from "../components/MonthlyEnrollmentCard";
import PendingApprovalsCard from "../components/PendingApprovalsCard";
import QuickActionsCard from "../components/QuickActionsCard";
import RecentActivitiesCard from "../components/RecentActivitiesCard";
import StatsGrid from "../components/StatsGrid";
import TopControls from "../components/TopControls";
import {
  useApproveScheduleChangeRequest,
  usePendingScheduleChangeRequests,
  useRejectScheduleChangeRequest,
} from "../hooks/useScheduleChangeRequests";
import { useDashboardSummary } from "../hooks/useDashboardSummary";
import { useDailyReports } from "../hooks/useDailyReports";
import { useReportOverview } from "../hooks/useReportOverview";
import { useScheduleMonthStatus } from "../hooks/useScheduleMonthStatus";
import { formatDateToISO, parseDateValue } from "../../../shared/utils/date";
import ToastStack from "../../../shared/utils/ToastStack";
import { useToast } from "../../../shared/utils/toast";
import { resolvePromoPrice } from "../../../shared/utils/promoPricing";
import { resourceServices } from "../../../services/resources";
import { deleteStudent, updateEnrollmentStatus } from "../../students/services/studentsApi";
import { fetchPendingApprovals } from "../services/dashboardApi";

const CalendarScheduleModal = lazy(() => import("../components/CalendarScheduleModal"));
const PrintReport = lazy(() => import("../components/PrintReport"));
const PaymentDetailsModal = lazy(() => import("../../enrollments/components/PaymentDetailsModal.jsx"));

function getDateRangeFromPreset(preset, customStartDate, customEndDate) {
  const now = new Date();

  if (preset === "today") {
    const today = formatDateToISO(now);
    return {
      startDate: today,
      endDate: today,
    };
  }

  if (preset === "thisWeek") {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return {
      startDate: formatDateToISO(start),
      endDate: formatDateToISO(end),
    };
  }

  if (preset === "custom") {
    const fallback = formatDateToISO(now);
    const safeStart = customStartDate || fallback;
    const safeEnd = customEndDate || safeStart;
    if (safeStart <= safeEnd) {
      return {
        startDate: safeStart,
        endDate: safeEnd,
      };
    }

    return {
      startDate: safeEnd,
      endDate: safeStart,
    };
  }

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: formatDateToISO(firstOfMonth),
    endDate: formatDateToISO(now),
  };
}

function buildReportFilter(preset, customStartDate, customEndDate) {
  const { startDate, endDate } = getDateRangeFromPreset(preset, customStartDate, customEndDate);
  const isSingleDay = startDate === endDate;

  return {
    mode: isSingleDay ? "day" : "range",
    preset,
    date: isSingleDay ? startDate : null,
    startDate,
    endDate,
  };
}

function toReportHeading(filter) {
  const start = new Date(`${filter.startDate}T00:00:00`);
  const end = new Date(`${filter.endDate}T00:00:00`);

  if (filter.mode === "day") {
    return {
      title: `Daily Report: ${start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      subtitle: "Schedules and transactions for the selected day",
      emptyMessage: "No schedules or transactions recorded for this date.",
    };
  }

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const periodLabel = sameMonth
    ? `${start.toLocaleDateString("en-US", { month: "long" })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`
    : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return {
    title: `Report Period: ${periodLabel}`,
    subtitle: "Schedules and transactions for the selected range",
    emptyMessage: "No schedules or transactions recorded for this period.",
  };
}

function filterDailyReports(rows, activeFilter, search) {
  return rows.filter((row) => {
    const navbarFilter = String(activeFilter || "overall").toLowerCase();
    const courseType = String(row.courseType || "").toLowerCase();
    const courseLabel = String(row.course || "").toLowerCase();

    const scheduleMatchesFilter =
      courseType === "schedule"
        ? navbarFilter === "overall"
          ? true
          : navbarFilter === "tdc"
            ? courseLabel.includes("tdc")
            : navbarFilter === "pdc"
              ? courseLabel.includes("pdc")
              : navbarFilter === "pdc_beginner"
                ? courseLabel.includes("pdc") && courseLabel.includes("beginner")
                : navbarFilter === "pdc_experience"
                  ? courseLabel.includes("pdc") && courseLabel.includes("experience")
                  : true
        : false;

    // Check navbar filter (activeFilter)
    const matchesNavbarFilter =
      navbarFilter === "overall"
        ? true
        : navbarFilter === "tdc"
          ? courseType === "tdc" || scheduleMatchesFilter
          : navbarFilter === "pdc"
            ? courseType === "pdc_beginner" || courseType === "pdc_experience" || scheduleMatchesFilter
            : navbarFilter === "pdc_beginner"
              ? courseType === "pdc_beginner" || scheduleMatchesFilter
              : navbarFilter === "pdc_experience"
                ? courseType === "pdc_experience" || scheduleMatchesFilter
                : true;

    if (!matchesNavbarFilter) return false;

    const text = search.trim().toLowerCase();
    if (text) {
      return [row.studentName, row.course, row.vehicleType, row.instructor, row.remarks, row.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    }
    return true;
  });
}

function filterRecentActivities(rows, search) {
  const text = search.trim().toLowerCase();
  if (!text) return rows;

  return rows.filter((row) =>
    [row.userName, row.action]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text))
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [activeFilter, setActiveFilter] = useState("overall");
  const [search, setSearch] = useState("");
  const [toasts, addToast, removeToast] = useToast();
  const [printedAt, setPrintedAt] = useState(new Date());
  const initialFilter = useMemo(() => buildReportFilter("thisMonth", "", ""), []);
  const [reportFilter, setReportFilter] = useState(initialFilter);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedEnrollmentForPayment, setSelectedEnrollmentForPayment] = useState(null);
  const [calendarView, setCalendarView] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  const dailyReportHeading = useMemo(() => toReportHeading(reportFilter), [reportFilter]);
  const selectedDate = useMemo(
    () => parseDateValue(reportFilter.mode === "day" ? reportFilter.date : reportFilter.endDate),
    [reportFilter]
  );

  const {
    data: dashboardSummaryPayload,
    isLoading: summaryLoading,
    isError: summaryError,
    isFetching: summaryFetching,
    failureCount: summaryFailureCount,
  } = useDashboardSummary(activeFilter);
  const { data: reportOverview, isError: overviewError } = useReportOverview({
    startDate: reportFilter.startDate,
    endDate: reportFilter.endDate,
    course: activeFilter,
  });
  const { data: dailyReportData, isLoading: dailyLoading, isError: dailyError } = useDailyReports({
    ...reportFilter,
    course: activeFilter,
  });
  const calendarCourseType = ["overall", "tdc", "pdc", "pdc_beginner", "pdc_experience"].includes(activeFilter)
    ? activeFilter
    : "overall";
  const { data: monthStatusData } = useScheduleMonthStatus({ ...calendarView, course: calendarCourseType });
  const approveScheduleChangeMutation = useApproveScheduleChangeRequest();
  const rejectScheduleChangeMutation = useRejectScheduleChangeRequest();
  const { data: pendingRequestsData, isLoading: pendingRequestsLoading } = usePendingScheduleChangeRequests(auth?.user?.role === "admin");
  const { data: promoOffersData = [] } = useQuery({
    queryKey: ["promo-offers", "dashboard-payment"],
    queryFn: () => resourceServices.promoOffers.list(),
    enabled: auth?.user?.role === "admin" || auth?.user?.role === "sub_admin",
  });
  const { data: pendingApprovalsData = { items: [] }, isLoading: pendingEnrollmentsLoading } = useQuery({
    queryKey: ["dashboard", "pending-approvals"],
    queryFn: () => fetchPendingApprovals(100),
    enabled: auth?.user?.role === "admin",
  });

  const promoOfferOptions = useMemo(() => {
    const rows = Array.isArray(promoOffersData) ? promoOffersData : promoOffersData?.items || promoOffersData?.data || [];
    return rows.map((offer) => ({
      value: offer.id,
      label: `${offer.name} - ₱${resolvePromoPrice(offer).toFixed(2)}`,
      discounted_price: offer.discounted_price,
      fixed_price: offer.fixed_price,
      name: offer.name,
    }));
  }, [promoOffersData]);

  const pendingEnrollments = useMemo(() => pendingApprovalsData?.items || [], [pendingApprovalsData]);

  const approveEnrollmentWithPaymentMutation = useMutation({
    mutationFn: async ({ row, paymentData }) => {
      return resourceServices.enrollments.update(row.enrollment.id, {
        ...paymentData,
        status: "confirmed",
      });
    },
    onSuccess: async (_data, variables) => {
      addToast(`Enrollment accepted for ${variables?.row?.studentName || "student"}.`, "success");
      setSelectedEnrollmentForPayment(null);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["students", "pending-approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to save payment details.", "error");
    },
  });

  const approveEnrollmentMutation = useMutation({
    mutationFn: async (row) => updateEnrollmentStatus(row.id, { enrollmentStatus: "confirmed" }),
    onSuccess: async (_data, row) => {
      addToast(`Enrollment accepted for ${row?.studentName || "student"}.`, "success");
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["students", "pending-approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to approve pending enrollment.", "error");
    },
  });

  const rejectEnrollmentMutation = useMutation({
    mutationFn: async (row) => deleteStudent(row.id),
    onSuccess: async (_data, row) => {
      addToast(`Pending enrollment rejected for ${row?.studentName || "student"}.`, "success");
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      await queryClient.invalidateQueries({ queryKey: ["students", "pending-approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
    onError: (mutationError) => {
      addToast(mutationError?.message || "Failed to reject pending enrollment.", "error");
    },
  });



  const unfilteredDailyReports = dailyReportData?.items || [];
  const unfilteredRecentActivities = reportOverview?.recentActivities || [];

  const dailyReports = filterDailyReports(unfilteredDailyReports, activeFilter, search);
  const recentActivities = filterRecentActivities(unfilteredRecentActivities, search).slice(0, 30);

  const handlePrintReports = () => {
    setPrintedAt(new Date());
    setTimeout(() => {
      window.print();
    }, 50);
  };

  // Use monthStatusData items for activity dates since they're already filtered by course from the backend
  // When in calendar view, only show activity dots for the selected scheduleCourseType
  const calendarActivityDates = (monthStatusData?.items || []).map((item) => item.date);
  
  // For reports and other views, include all activity dates from report overview
  const reportActivityDates = reportOverview?.activityDates || [];
  
  // Combine activity dates: use calendar-filtered ones + report dates (for non-calendar context)
  const allActivityDates = [
    ...calendarActivityDates,
    ...reportActivityDates,
  ].map((dateValue) => parseDateValue(dateValue));

  const summary = dashboardSummaryPayload?.stats || {
    totalStudents: 0,
    currentlyEnrolled: 0,
    completed: 0,
    thisMonth: 0,
    tdc: 0,
    pdcBeginner: 0,
    pdcExperience: 0,
  };

  const generatedBy = `${auth?.user?.name || "System Admin"}${auth?.user?.id ? ` (Admin ID: ${auth.user.id})` : ""}`;

  function applySingleDayFilter(date) {
    const dateIso = formatDateToISO(date);
    setReportFilter({
      mode: "day",
      preset: "today",
      date: dateIso,
      startDate: dateIso,
      endDate: dateIso,
    });
  }

  return (
    <>
      <section className="space-y-4 print:hidden">
        <TopControls
          activeFilter={activeFilter}
          onChangeFilter={setActiveFilter}
          search={search}
          onSearchChange={setSearch}
          onEnroll={() => navigate("/enrollments")}
        />

        {summaryError && !summaryFetching && summaryFailureCount >= 4 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load dashboard summary.
          </div>
        ) : null}

        {summaryFetching && summaryFailureCount > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Reconnecting dashboard summary... (attempt {Math.min(summaryFailureCount + 1, 4)} of 4)
          </div>
        ) : null}

        <StatsGrid loading={summaryLoading} stats={{...summary, activeFilter}} />

        <DashboardGrid
          left={(
            <>
              <CalendarWidget
                view={calendarView}
                courseFilter={calendarCourseType}
                reportFilter={reportFilter}
                onSelectDate={applySingleDayFilter}
                onOpenSchedule={(date) => {
                  applySingleDayFilter(date);
                  setScheduleModalOpen(true);
                }}
                activityDates={allActivityDates}
                monthStatus={monthStatusData?.items || []}
                onPrevMonth={() =>
                  setCalendarView((prev) =>
                    prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 }
                  )
                }
                onNextMonth={() =>
                  setCalendarView((prev) =>
                    prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 }
                  )
                }
              />

              <DailyReportsCard
                rows={dailyReports}
                total={dailyReports.length}
                loading={dailyLoading}
                error={dailyError}
                title={dailyReportHeading.title}
                subtitle={dailyReportHeading.subtitle}
                emptyMessage={dailyReportHeading.emptyMessage}
              />

              <RecentActivitiesCard
                rows={recentActivities}
                loading={summaryLoading}
                error={overviewError}
              />
            </>
          )}
          right={(
            <>
              <MonthlyEnrollmentCard rows={reportOverview?.monthlyEnrollment || []} activeFilter={activeFilter} />
              <QuickActionsCard
                reportFilter={reportFilter}
                onPeriodPresetChange={(preset) => {
                  setReportFilter((current) => buildReportFilter(preset, current.startDate, current.endDate));
                }}
                onStartDateChange={(value) => {
                  setReportFilter((current) => buildReportFilter("custom", value, current.endDate));
                }}
                onEndDateChange={(value) => {
                  setReportFilter((current) => buildReportFilter("custom", current.startDate, value));
                }}
                onPrintReports={handlePrintReports}
                onNewEnrollment={() => navigate("/enrollments")}
                onViewReports={() => navigate("/reports")}
              />
              {auth?.user?.role === "admin" ? (
                <PendingApprovalsCard
                  scheduleRows={pendingRequestsData?.items || []}
                  enrollmentRows={pendingEnrollments}
                  loading={pendingRequestsLoading || pendingEnrollmentsLoading}
                  approveMutation={approveScheduleChangeMutation}
                  rejectMutation={rejectScheduleChangeMutation}
                  approveEnrollmentMutation={approveEnrollmentMutation}
                  rejectEnrollmentMutation={rejectEnrollmentMutation}
                  onOpenEnrollment={(row) => navigate(`/students?focusStudentId=${encodeURIComponent(row.id)}`)}
                  onRequestEnrollmentPayment={(row) => setSelectedEnrollmentForPayment(row)}
                  onApproved={(row) => addToast(`Approved schedule change for ${row.currentSchedule?.studentName || "student"}.`, "success")}
                  onRejected={(row) => addToast(`Rejected schedule change for ${row.currentSchedule?.studentName || "student"}.`, "success")}
                  onBulkCompleted={({ action, successCount, failedCount }) => {
                    const actionLabel = action === "accept" ? "accepted/approved" : "rejected";
                    if (failedCount > 0) {
                      addToast(`Bulk ${actionLabel}: ${successCount} success, ${failedCount} failed.`, "error");
                      return;
                    }
                    addToast(`Bulk ${actionLabel}: ${successCount} request${successCount === 1 ? "" : "s"} processed.`, "success");
                  }}
                />
              ) : null}
            </>
          )}
        />
      </section>

      <Suspense fallback={null}>
        <PrintReport
          className={scheduleModalOpen ? "hidden" : "hidden print:block"}
          reportRange={{ startDate: reportFilter.startDate, endDate: reportFilter.endDate }}
          stats={summary}
          monthlyEnrollment={reportOverview?.monthlyEnrollment || []}
          dailyTransactions={unfilteredDailyReports}
          recentActivities={unfilteredRecentActivities}
          maintenanceSummary={reportOverview?.maintenanceSummary}
          fuelSummary={reportOverview?.fuelSummary}
          generatedBy={generatedBy}
          printedAt={printedAt}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CalendarScheduleModal
          isOpen={scheduleModalOpen}
          selectedDate={selectedDate}
          onClose={() => setScheduleModalOpen(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        {selectedEnrollmentForPayment ? (
          <PaymentDetailsModal
            enrollment={selectedEnrollmentForPayment.enrollment}
            student={selectedEnrollmentForPayment.student}
            studentProfile={selectedEnrollmentForPayment.student?.StudentProfile}
            studentName={selectedEnrollmentForPayment.studentName}
            studentEmail={selectedEnrollmentForPayment.student?.email}
            studentPhone={selectedEnrollmentForPayment.student?.phone}
            enrollmentLabel={`Enrollment #${selectedEnrollmentForPayment.enrollmentId}`}
            courseLabel={selectedEnrollmentForPayment.courseLabel}
            promoOfferLabel={selectedEnrollmentForPayment.enrollment?.promoOffer?.name || selectedEnrollmentForPayment.enrollment?.promo_offer_name || "None"}
            promoOfferOptions={promoOfferOptions}
            onSubmit={(paymentData) => approveEnrollmentWithPaymentMutation.mutate({ row: selectedEnrollmentForPayment, paymentData })}
            onCancel={() => setSelectedEnrollmentForPayment(null)}
            isPending={approveEnrollmentWithPaymentMutation.isPending}
            userRole={auth?.user?.role}
          />
        ) : null}
      </Suspense>

      <ToastStack
        toasts={toasts}
        onDismiss={removeToast}
      />
    </>
  );
}
