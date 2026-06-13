const repository = require("./dashboard.repository");

function getCreatedDate(row) {
  return new Date(row.created_at || row.createdAt || 0);
}

function classifyCourseType(row) {
  const code = String(row?.DLCode?.code || "").toLowerCase();
  const pdcType = String(row?.pdc_type || "").toLowerCase();

  if (code.includes("promo") || (code.includes("tdc") && code.includes("pdc"))) {
    return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
  }
  if (code.includes("tdc")) return "tdc";
  if (code.includes("pdc")) return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
  return "pdc_experience";
}

function getCourseMembership(row) {
  const code = String(row?.DLCode?.code || "").toLowerCase();
  const courseType = classifyCourseType(row);
  const membership = new Set();

  if (code.includes("promo") || (code.includes("tdc") && code.includes("pdc"))) {
    membership.add("tdc");
    membership.add(courseType);
    return membership;
  }

  membership.add(courseType);
  return membership;
}

function mapLog(row) {
  const date = getCreatedDate(row);
  // Find the latest scheduled session (if any)
  let session = null;
  if (Array.isArray(row.scheduledSessions) && row.scheduledSessions.length > 0) {
    session = row.scheduledSessions.reduce((latest, curr) => {
      if (!latest) return curr;
      const latestDate = new Date(latest.schedule_date || latest.createdAt || 0);
      const currDate = new Date(curr.schedule_date || curr.createdAt || 0);
      return currDate > latestDate ? curr : latest;
    }, null);
  }
  // Build slot label
  let slotLabel = null;
  if (session && session.start_time && session.end_time) {
    // Format as '08:00 AM - 12:00 PM'
    const formatTime = (t) => {
      const [h, m] = t.split(":");
      const d = new Date();
      d.setHours(Number(h), Number(m), 0, 0);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    };
    slotLabel = `${formatTime(session.start_time)} - ${formatTime(session.end_time)}`;
  }
  return {
    id: row.id,
    student_id: row.student_id,
    schedule_id: session ? session.id : row.schedule_id,
    package_id: row.package_id,
    dl_code_id: row.dl_code_id,
    status: row.status,
    created_at: row.created_at || row.createdAt,
    course_type: classifyCourseType(row),
    course_code: row?.DLCode?.code || null,
    date_label: Number.isNaN(date.valueOf()) ? null : date.toISOString(),
    slot: session ? session.slot : null,
    slotLabel,
    schedule_date: session ? session.schedule_date : null,
    start_time: session ? session.start_time : null,
    end_time: session ? session.end_time : null,
    studentName: row?.Student ? `${row.Student.first_name} ${row.Student.last_name}` : undefined,
  };
}

function buildMonthlySeries(rows) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const buckets = Array.from({ length: 12 }, (_, month) => ({
    month,
    tdc: 0,
    pdcBeginner: 0,
    pdcExperience: 0,
  }));

  // Exclude rows that do not have a Student name (likely placeholder/test data)
  const meaningfulRows = (rows || []).filter((r) => {
    const hasStudent = Boolean(r?.Student && (r.Student.first_name || r.Student.last_name));
    return hasStudent;
  });

  meaningfulRows.forEach((row) => {
    // Only count paid enrollments (confirmed or completed)
    if (row.status !== "confirmed" && row.status !== "completed") return;

    const date = getCreatedDate(row);
    if (Number.isNaN(date.valueOf())) return;

    if (date.getFullYear() !== currentYear) return;

    const month = date.getMonth();
    if (month > currentMonth) return;

    const membership = getCourseMembership(row);
    if (membership.has("tdc")) buckets[month].tdc += 1;
    if (membership.has("pdc_beginner")) buckets[month].pdcBeginner += 1;
    if (membership.has("pdc_experience")) buckets[month].pdcExperience += 1;
  });

  return buckets;
}

async function getSummary(courseFilter = "overall") {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  const enrollments = await repository.findAllEnrollmentsWithCode(yearStart, yearEnd);

  const normalizedFilter = String(courseFilter || "overall").toLowerCase();
  const filteredEnrollments =
    normalizedFilter === "overall"
      ? enrollments
      : enrollments.filter((item) => {
          const membership = getCourseMembership(item);
          if (normalizedFilter === "pdc") {
            return membership.has("pdc_beginner") || membership.has("pdc_experience");
          }
          return membership.has(normalizedFilter);
        });

  // Also ignore enrollments that do not have an associated student name (test or incomplete data)
  const meaningfulEnrollments = filteredEnrollments.filter((e) => Boolean(e?.Student && (e.Student.first_name || e.Student.last_name)));

  // Only count "confirmed" and "completed" as currently enrolled (exclude unpaid "pending" with qrCodeId)
  const currentlyEnrolled = meaningfulEnrollments.filter(
    (item) => item.status === "confirmed" || item.status === "completed"
  ).length;
  const completed = meaningfulEnrollments.filter((item) => item.status === "completed").length;

  const thisMonth = meaningfulEnrollments.filter((item) => {
    const date = getCreatedDate(item);
    // Only count "confirmed" and "completed" for monthly stats
    const isPaidEnrollment = item.status === "confirmed" || item.status === "completed";
    return isPaidEnrollment && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  const pdcBeginner = meaningfulEnrollments.filter((item) => classifyCourseType(item) === "pdc_beginner" && (item.status === "confirmed" || item.status === "completed")).length;
  const pdcExperience = meaningfulEnrollments.filter((item) => classifyCourseType(item) === "pdc_experience" && (item.status === "confirmed" || item.status === "completed")).length;
  const tdc = meaningfulEnrollments.filter((item) => classifyCourseType(item) === "tdc" && (item.status === "confirmed" || item.status === "completed")).length;

  // Only count students with paid (confirmed/completed) enrollments
  const totalStudentsForFilter = new Set(
    meaningfulEnrollments
      .filter((item) => item.status === "confirmed" || item.status === "completed")
      .map((item) => item.student_id)
      .filter(Boolean)
  ).size;

  return {
    stats: {
      totalStudents: totalStudentsForFilter,
      currentlyEnrolled,
      completed,
      thisMonth,
      tdc,
      pdcBeginner,
      pdcExperience,
    },
    monthlyEnrollment: buildMonthlySeries(meaningfulEnrollments),
    activityDates: meaningfulEnrollments
      .map((item) => item.created_at || item.createdAt)
      .filter(Boolean),
  };
}

async function getLogsByDate(isoDate) {
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  const end = new Date(`${isoDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const rows = await repository.findEnrollmentsByDateRange(start, end);
  const logs = rows.map(mapLog).filter((l) => Boolean(l.studentName && String(l.studentName).trim()));

  return {
    date: isoDate,
    total: logs.length,
    dailyReports: logs,
    recentActivities: logs.slice(0, 10),
  };
}

function formatStudentName(student) {
  if (!student) return "-";
  return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ") || `Student #${student.id}`;
}

function toIsoDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 10);
}

function isDateWithin(dateOnly, startDateOnly, endDateOnly) {
  if (!dateOnly || !startDateOnly || !endDateOnly) return false;
  return dateOnly >= startDateOnly && dateOnly <= endDateOnly;
}

function mapOperationalEnrollment(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    student_name: formatStudentName(row.Student),
    student_email: row?.Student?.email || null,
    student_phone: row?.Student?.phone || null,
    dl_code: row?.DLCode?.code || null,
    enrollment_state: row.enrollment_state || "active",
    pdc_start_mode: row.pdc_start_mode || null,
    tdc_completion_deadline: row.tdc_completion_deadline || null,
    pdc_valid_until: row.pdc_valid_until || null,
    pdc_eligibility_date: row.pdc_eligibility_date || null,
    promo_package_id: row.promo_package_id || row?.promoPackage?.id || null,
    promo_package_status: row?.promoPackage?.status || null,
    created_at: row.created_at || row.createdAt || null,
  };
}

async function getOperationsSnapshot({ daysAhead = 7, limit = 50 } = {}) {
  const maxItems = Math.min(200, Math.max(1, Number(limit || 50)));
  const lookahead = Math.min(60, Math.max(1, Number(daysAhead || 7)));

  const now = new Date();
  const todayDateOnly = toIsoDateOnly(now);
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + lookahead);
  const endDateOnly = toIsoDateOnly(endDate);

  const [rows, forReview, errorQueue, receivedQueue] = await Promise.all([
    repository.findOperationalEnrollments(1000),
    repository.findOnlineIntakeByStatus("for_review", maxItems),
    repository.findOnlineIntakeByStatus("error", maxItems),
    repository.findOnlineIntakeByStatus("received", maxItems),
  ]);

  const mapped = rows.map(mapOperationalEnrollment);

  const tdcIncomplete = mapped
    .filter((item) => item.enrollment_state === "tdc_in_progress")
    .slice(0, maxItems);

  const promoPdcUnscheduled = mapped
    .filter((item) => item.promo_package_id && item.pdc_start_mode === "later")
    .filter((item) => item.enrollment_state === "pdc_pending_schedule" || item.enrollment_state === "active")
    .slice(0, maxItems);

  const promoExpiringSoon = mapped
    .filter((item) => item.promo_package_id)
    .filter((item) => ["active", "pdc_pending_schedule", "pdc_in_progress", "tdc_in_progress"].includes(item.enrollment_state))
    .filter((item) => isDateWithin(item.pdc_valid_until, todayDateOnly, endDateOnly))
    .slice(0, maxItems);

  const tdcDeadlinesSoon = mapped
    .filter((item) => ["tdc_in_progress", "active"].includes(item.enrollment_state))
    .filter((item) => isDateWithin(item.tdc_completion_deadline, todayDateOnly, endDateOnly))
    .slice(0, maxItems);

  return {
    generated_at: new Date().toISOString(),
    lookahead_days: lookahead,
    metrics: {
      tdcIncompleteCount: tdcIncomplete.length,
      promoPdcUnscheduledCount: promoPdcUnscheduled.length,
      promoExpiringSoonCount: promoExpiringSoon.length,
      tdcDeadlinesSoonCount: tdcDeadlinesSoon.length,
      onlineIntakeForReviewCount: forReview.length,
      onlineIntakeErrorCount: errorQueue.length,
      onlineIntakeReceivedCount: receivedQueue.length,
    },
    queues: {
      tdc_incomplete: tdcIncomplete,
      promo_pdc_unscheduled: promoPdcUnscheduled,
      promo_expiring_soon: promoExpiringSoon,
      tdc_deadlines_soon: tdcDeadlinesSoon,
      online_intake_for_review: forReview,
      online_intake_errors: errorQueue,
      online_intake_received: receivedQueue,
    },
  };
}

async function getPendingApprovals(limit = 100) {
  // Kunin lahat ng naka-pending
  const rows = await repository.findPendingEnrollmentApprovals(limit);

  // ✅ FIX: I-filter out ang mga may enrollment_channel na "qr_public"
  // Dahil dapat ay sa "Pending QR Enrollments" lang sila lalabas.
  const filteredRows = rows.filter((row) => {
    return row.enrollment_channel !== "qr_public";
  });

  const items = filteredRows.map((row) => {
    const student = row.Student ? (row.Student.toJSON ? row.Student.toJSON() : row.Student) : null;
    const enrollment = row.toJSON ? row.toJSON() : row;
    const studentName = student
      ? [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ") || `Student #${student.id}`
      : `Enrollment #${row.id}`;

    return {
      id: student?.id || row.student_id || row.id,
      enrollmentId: row.id,
      student,
      enrollment,
      studentName,
      courseLabel: row?.DLCode?.code || row?.enrolling_for || "Enrollment",
    };
  });

  return {
    total: items.length,
    items,
  };
}

module.exports = {
  getSummary,
  getLogsByDate,
  getOperationsSnapshot,
  getPendingApprovals,
};
