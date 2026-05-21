const repository = require("./reports.repository");
const { listSchedulesByDate, listSchedulesByRange } = require("../schedules/schedules.service");
const { ReportSchedule } = require("../../../models");

function buildNextRunAt(frequency) {
  const now = new Date();
  const next = new Date(now);

  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients)) {
    return [];
  }

  return Array.from(
    new Set(
      recipients
        .map((recipient) => String(recipient || "").trim())
        .filter(Boolean)
    )
  );
}

function classifyCourseType(row) {
  const code = String(row?.DLCode?.code || "").toLowerCase();
  const pdcType = String(row?.pdc_type || "").toLowerCase();

  if (code.includes("tdc") && code.includes("pdc")) {
    return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
  }
  if (code.includes("tdc")) return "tdc";
  if (code.includes("pdc")) {
    return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
  }
  return "pdc_experience";
}

function isPromoEnrollment(row) {
  const code = String(row?.DLCode?.code || "").toLowerCase();
  return code.includes("promo") || (code.includes("tdc") && code.includes("pdc"));
}

function getCourseMembership(row) {
  const courseType = classifyCourseType(row);
  const membership = new Set();

  if (isPromoEnrollment(row)) {
    membership.add("tdc");
    membership.add(courseType);
    return membership;
  }

  if (courseType === "tdc") {
    membership.add("tdc");
    return membership;
  }

  membership.add(courseType);
  return membership;
}

function courseDisplayLabel(row) {
  if (isPromoEnrollment(row)) return "TDC + PDC Promo";

  const type = classifyCourseType(row);
  if (type === "tdc") return "TDC";
  if (type === "pdc_beginner" || type === "pdc_experience") return "PDC";
  return "Course";
}

function studentName(student) {
  if (!student) return "Unknown Student";
  return [student.first_name, student.last_name].filter(Boolean).join(" ") || `Student #${student.id}`;
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.valueOf())) return "--:--";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDisplayTime(timeValue) {
  const [hour = "00", minute = "00"] = String(timeValue || "00:00:00").split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function latestScheduledSession(row) {
  const sessions = Array.isArray(row?.scheduledSessions) ? row.scheduledSessions : [];
  if (sessions.length === 0) return null;

  return sessions.reduce((latest, current) => {
    if (!latest) return current;
    const latestDate = new Date(`${latest.schedule_date || "1970-01-01"}T${latest.start_time || "00:00:00"}`);
    const currentDate = new Date(`${current.schedule_date || "1970-01-01"}T${current.start_time || "00:00:00"}`);
    return currentDate > latestDate ? current : latest;
  }, null);
}

function mapEnrollmentReport(row) {
  const code = row?.DLCode?.code || courseDisplayLabel(row);
  const name = studentName(row.Student);
  const courseType = classifyCourseType(row);
  const courseLabel = courseDisplayLabel(row);
  const session = latestScheduledSession(row);
  const vehicleType =
    session?.Vehicle?.vehicle_name ||
    session?.Vehicle?.plate_number ||
    session?.Vehicle?.vehicle_type ||
    [row?.target_vehicle, row?.transmission_type].filter(Boolean).join(" - ") ||
    "-";
  const transmissionType =
    session?.Vehicle?.transmission_type ||
    row?.transmission_type ||
    "-";
  const slotLabel =
    session?.start_time && session?.end_time
      ? `${toDisplayTime(session.start_time)} - ${toDisplayTime(session.end_time)}`
      : "-";

  return {
    id: `enrollment-${row.id}`,
    time: formatTime(row.created_at),
    studentName: name,
    transactionType: `${courseLabel} Enrollment`,
    course: courseLabel,
    vehicleType,
    transmissionType,
    slotLabel,
    instructor: session?.Instructor?.name || "-",
    careOf: session?.careOfInstructor?.name || "-",
    instructorRemarks: "",
    studentRemarks: "",
    remarks: `${name} enrolled in ${code}`,
    courseType,
    description: `${name} enrolled in ${code}`,
    createdAt: row.created_at,
  };
}

function mapScheduleReport(row, index) {
  const isExplicitScheduleRow = String(row?.remarks || "").toLowerCase().includes("schedule row");
  const courseType = isExplicitScheduleRow ? "schedule" : classifyCourseType(row);

  return {
    id: row.id || `schedule-${index}`,
    time: row.slotLabel || "Scheduled",
    reportDate: row.scheduleDate,
    studentName: row.studentName || "Open Slot",
    transactionType: "Schedule",
    course: row.course || "Course",
    vehicleType: row.vehicleName || row.vehicleType || "-",
    transmissionType: row.transmissionType || "-",
    instructor: row.instructor || "-",
    remarks: row.studentRemarks || row.remarks || row.slotLabel || "Scheduled session",
    studentRemarks: row.studentRemarks || row.remarks || "",
    instructorRemarks: row.instructorRemarks || "",
    courseType,
    description: `${row.course || "Course"} with ${row.instructor || "Instructor"}`,
    createdAt: `${row.scheduleDate}T00:00:00.000Z`,
  };
}

function classifyDailyItemCourseType(item) {
  const normalizedType = String(item?.courseType || "").toLowerCase();
  if (normalizedType === "tdc" || normalizedType === "pdc_beginner" || normalizedType === "pdc_experience") {
    return normalizedType;
  }

  const normalizedCourse = String(item?.course || "").toLowerCase();
  if (normalizedCourse.includes("pdc") && normalizedCourse.includes("beginner")) {
    return "pdc_beginner";
  }
  if (normalizedCourse.includes("pdc") && normalizedCourse.includes("experience")) {
    return "pdc_experience";
  }
  if (normalizedCourse.includes("tdc")) {
    return "tdc";
  }
  if (normalizedCourse.includes("pdc")) {
    return "pdc_experience";
  }

  if (normalizedCourse.includes("tdc") && normalizedCourse.includes("promo")) {
    return "promo";
  }
  if (normalizedCourse.includes("tdc") && normalizedCourse.includes("pdc")) {
    return "promo";
  }

  return "unknown";
}

function includeDailyItemByCourse(item, courseFilter) {
  const normalizedFilter = String(courseFilter || "overall").toLowerCase();
  if (normalizedFilter === "overall") return true;

  const normalizedType = classifyDailyItemCourseType(item);
  if (normalizedType === "promo") {
    return normalizedFilter === "tdc" || normalizedFilter === "pdc";
  }

  if (normalizedFilter === "pdc") {
    return normalizedType === "pdc_beginner" || normalizedType === "pdc_experience";
  }

  return normalizedType === normalizedFilter;
}

function mapEnrollmentReportWithDate(row) {
  return {
    ...mapEnrollmentReport(row),
    reportDate: String(row.created_at || row.createdAt || "").slice(0, 10),
  };
}

function mapActivityLog(row) {
  const timestamp = row.timestamp || row.createdAt;
  return {
    id: row.id,
    userName: row?.User?.name || "System",
    action: row.action,
    timestamp,
    time: formatTime(timestamp),
  };
}

function buildMonthlySeries(rows) {
  const buckets = Array.from({ length: 12 }, (_, month) => ({
    month,
    tdc: 0,
    pdcBeginner: 0,
    pdcExperience: 0,
  }));

  const meaningfulRows = (rows || []).filter((r) => Boolean(r?.Student && (r.Student.first_name || r.Student.last_name)));

  meaningfulRows.forEach((row) => {
    const date = new Date(row.created_at || row.createdAt || 0);
    if (Number.isNaN(date.valueOf())) return;

    const month = date.getMonth();
    const membership = getCourseMembership(row);
    if (membership.has("tdc")) buckets[month].tdc += 1;
    if (membership.has("pdc_beginner")) buckets[month].pdcBeginner += 1;
    if (membership.has("pdc_experience")) buckets[month].pdcExperience += 1;
  });

  return buckets;
}

function toNumber(value) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return 0;
  return numeric;
}

async function getDailyReports({ date, startDate, endDate, courseFilter = "overall", courseType, instructorId, vehicleId }) {
  const effectiveStartDate = date || startDate;
  const effectiveEndDate = date || endDate;
  const start = new Date(`${effectiveStartDate}T00:00:00.000Z`);
  const end = new Date(`${effectiveEndDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const [enrollments, schedules] = await Promise.all([
    repository.findEnrollmentsByDateRange(start, end),
    date
      ? listSchedulesByDate(date, courseType, { instructorId, vehicleId })
      : listSchedulesByRange(effectiveStartDate, effectiveEndDate),
  ]);

  // Exclude enrollments without a student name (test data)
  const meaningfulEnrollments = enrollments.filter((row) => Boolean(row?.Student && (row.Student.first_name || row.Student.last_name)));
  
  const items = [
    ...(date ? schedules?.items || [] : schedules || []).map(mapScheduleReport),
    ...meaningfulEnrollments.map(mapEnrollmentReportWithDate),
  ]
    .filter((item) => includeDailyItemByCourse(item, courseFilter))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    date: date || null,
    startDate: effectiveStartDate,
    endDate: effectiveEndDate,
    isRange: !date,
    total: items.length,
    availability: date ? schedules?.slots || [] : [],
    dayRestriction: date ? schedules?.dayRestriction || null : null,
    beginnerSecondDay: date ? schedules?.beginnerSecondDay || null : null,
    wholeDayLock: date && courseType === "pdc_experience" ? Boolean(schedules?.dayFull) : false,
    dayFull: date ? schedules?.dayFull || false : false,
    items,
  };
}

async function getOverviewReports({ startDate, endDate, courseFilter = "overall" }) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  const [enrollments, importedStudents, activityLogs, maintenanceLogs, fuelLogs, , paymentsFromQuery, instructorCount] = await Promise.all([
    repository.findEnrollmentsByDateRange(start, end),
    repository.findStudentsByDateRange(start, end),
    repository.findActivityLogsByDateRange(start, end, 30),
    repository.findMaintenanceLogsByDateRange(start, end),
    repository.findFuelLogsByDateRange(start, end),
    repository.findCompletedEnrollmentsWithVehicleByDateRange(start, end),
    repository.findPaymentsByDateRange(start, end),
    repository.countActiveInstructors(),
  ]);

  // Ensure we also include payments that are linked to enrollments created in the range
  const PaymentModel = require("../../../models").Payment;
  const { Op } = require("sequelize");
  const enrollmentIds = (Array.isArray(enrollments) ? enrollments.map((e) => e.id).filter(Boolean) : []);

  let payments = Array.isArray(paymentsFromQuery) ? paymentsFromQuery.slice() : [];
  console.info("reports.service: enrollmentIds.count=", enrollmentIds.length, "paymentsFromQuery.count=", payments.length);
  if (enrollmentIds.length > 0) {
    console.info("reports.service: fetching extra payments for enrollment ids...");
    const extra = await PaymentModel.findAll({
      where: {
        enrollment_id: {
          [Op.in]: enrollmentIds,
        },
        payment_status: "paid",
      },
      attributes: ["id", "enrollment_id", "amount", "payment_method", "payment_status", "reference_number", "account_number", "created_at"],
    });
    console.info("reports.service: extraPayments.count=", (Array.isArray(extra) ? extra.length : 0));

    const byId = new Map((payments || []).map((p) => [p.id, p]));
    for (const p of extra) byId.set(p.id, p);
    payments = Array.from(byId.values());
  }

  const normalizedFilter = String(courseFilter || "overall").toLowerCase();
  const includeByCourse = (row) => {
    const membership = getCourseMembership(row);

    if (normalizedFilter === "overall") return true;
    if (normalizedFilter === "pdc") return membership.has("pdc_beginner") || membership.has("pdc_experience");
    return membership.has(normalizedFilter);
  };

  const filteredEnrollments = enrollments.filter((row) => includeByCourse(row));
  // Exclude enrollments without a student name (test data)
  const meaningfulEnrollments = filteredEnrollments.filter((row) => Boolean(row?.Student && (row.Student.first_name || row.Student.last_name)));
  const importedSourceStudents = (Array.isArray(importedStudents) ? importedStudents : []).filter((student) => {
    const source = String(
      student?.source_channel || student?.external_source || (student?.StudentProfile && student.StudentProfile.tdc_source) || ""
    ).toLowerCase();
    return source === "saferoads" || source === "otdc" || source === "odep";
  });

  const importedStudentMembership = importedSourceStudents.filter(() => {
    if (normalizedFilter === "overall") return true;
    return normalizedFilter === "tdc";
  });

  const enrolledStudentIds = new Set(meaningfulEnrollments.map((row) => row.student_id).filter(Boolean));
  const importedStudentIds = new Set(importedStudentMembership.map((student) => student.id).filter((id) => !enrolledStudentIds.has(id)));

  const transactions = [
    ...meaningfulEnrollments.map(mapEnrollmentReport),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const activities = activityLogs
    .map(mapActivityLog)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 30);

  const currentlyEnrolled = meaningfulEnrollments.filter(
    (item) => item.status === "pending" || item.status === "confirmed"
  ).length;
  const completed = meaningfulEnrollments.filter((item) => item.status === "completed").length + importedStudentIds.size;
  const pdcBeginner = meaningfulEnrollments.filter((item) => classifyCourseType(item) === "pdc_beginner").length;
  const pdcExperience = meaningfulEnrollments.filter((item) => classifyCourseType(item) === "pdc_experience").length;

  const totalStudentsForFilter = new Set([
    ...meaningfulEnrollments.map((row) => row.student_id).filter(Boolean),
    ...importedStudentIds,
  ]).size;
  const todayIso = new Date().toISOString().slice(0, 10);

  const maintenanceSummary = {
    totalRecords: maintenanceLogs.length,
    totalCost: Number(
      maintenanceLogs.reduce((sum, log) => sum + toNumber(log.maintenance_cost), 0).toFixed(2)
    ),
    overdueCount: maintenanceLogs.filter((log) => {
      const nextDate = String(log.next_schedule_date || "");
      return Boolean(nextDate) && nextDate < todayIso;
    }).length,
  };

  const fuelSummary = {
    totalEntries: fuelLogs.length,
    totalLiters: Number(fuelLogs.reduce((sum, log) => sum + toNumber(log.liters), 0).toFixed(2)),
    totalExpense: Number(fuelLogs.reduce((sum, log) => sum + toNumber(log.amount_spent), 0).toFixed(2)),
  };

  const revenueSummary = {
    totalPayments: Array.isArray(payments) ? payments.length : 0,
    totalRevenue: Number(
      (Array.isArray(payments) ? payments.reduce((sum, p) => sum + Number(p.amount || 0), 0) : 0).toFixed(2)
    ),
  };

  // Compute total enrollments expected revenue (include additional promos and subtract discounts)
  const totalEnrollmentAmount = meaningfulEnrollments.reduce((sum, r) => {
    const fee = Number(r.fee_amount || 0);
    const additional = Number(r.additional_promos_amount || 0);
    const discount = Number(r.discount_amount || 0);
    return sum + fee + additional - discount;
  }, 0);

  const pendingCollections = Number(Math.max(0, totalEnrollmentAmount - (revenueSummary.totalRevenue || 0)).toFixed(2));

  // Attach pending collections and net profit/loss to revenue summary (net = revenue - operating expense)
  revenueSummary.pendingCollections = pendingCollections;
  // operating expense will be computed by callers (maintenance + fuel); leave netProfitLoss computed later by consumers

  // Build vehicle usage aggregates from vehicle usages and fuel logs
  const vehicleUsageRows = await repository.findVehicleUsagesByDateRange(start, end);

  const usageBucket = new Map();
  vehicleUsageRows.forEach((u) => {
    const vid = u.vehicle?.id || u.vehicle_id;
    if (!vid) return;
    const key = String(vid);
    if (!usageBucket.has(key)) {
      usageBucket.set(key, {
        vehicleId: vid,
        vehicleName: u.vehicle?.vehicle_name || `Vehicle #${vid}`,
        vehicleType: u.vehicle?.vehicle_type || "Vehicle",
        plateNumber: u.vehicle?.plate_number || "",
        totalDistance: 0,
        totalLiters: 0,
        totalFuelCost: 0,
        completedUsages: 0,
      });
    }

    const current = usageBucket.get(key);
    const startOdo = toNumber(u.start_odometer);
    const endOdo = toNumber(u.end_odometer);
    const distance = endOdo > startOdo ? Number((endOdo - startOdo).toFixed(2)) : 0;
    if (distance > 0) {
      current.totalDistance += distance;
      current.completedUsages += 1;
    }
  });

  // attach fuel info per vehicle
  fuelLogs.forEach((f) => {
    const vid = f.vehicle?.id || f.vehicle_id;
    if (!vid) return;
    const key = String(vid);
    if (!usageBucket.has(key)) {
      usageBucket.set(key, {
        vehicleId: vid,
        vehicleName: f.vehicle?.vehicle_name || `Vehicle #${vid}`,
        vehicleType: f.vehicle?.vehicle_type || "Vehicle",
        plateNumber: f.vehicle?.plate_number || "",
        totalDistance: 0,
        totalLiters: 0,
        totalFuelCost: 0,
        completedUsages: 0,
      });
    }
    const current = usageBucket.get(key);
    current.totalLiters += toNumber(f.liters);
    current.totalFuelCost += toNumber(f.amount_spent);
  });

  const usageByVehicle = Array.from(usageBucket.values()).map((item) => {
    const avgLitersPer100km = item.totalDistance > 0 ? Number(((item.totalLiters / item.totalDistance) * 100).toFixed(2)) : null;
    return {
      ...item,
      totalDistance: Number((item.totalDistance || 0).toFixed(2)),
      totalLiters: Number((item.totalLiters || 0).toFixed(2)),
      totalFuelCost: Number((item.totalFuelCost || 0).toFixed(2)),
      avgLitersPer100km,
    };
  }).sort((a,b)=>b.totalDistance - a.totalDistance);

  return {
    reportRange: {
      startDate,
      endDate,
    },
    stats: {
      totalStudents: totalStudentsForFilter,
      currentlyEnrolled,
      completed,
      thisMonth: meaningfulEnrollments.length,
      pdcBeginner,
      pdcExperience,
    },
    monthlyEnrollment: (() => {
      const series = buildMonthlySeries(meaningfulEnrollments);

      importedStudentMembership.forEach((student) => {
        if (enrolledStudentIds.has(student.id)) {
          return;
        }

        const profile = student.StudentProfile || {};
        const dateCandidates = [
          profile.year_completed_tdc,
          profile.otdc_registration_date,
          profile.payment_date,
          student.createdAt,
          student.created_at,
        ];

        let chosen = null;
        for (const c of dateCandidates) {
          if (!c) continue;
          const d = new Date(c);
          if (!Number.isNaN(d.valueOf())) {
            chosen = d;
            break;
          }
        }

        if (!chosen) return;
        const month = chosen.getMonth();
        series[month].tdc += 1;
      });

      return series;
    })(),
    activityDates: meaningfulEnrollments
      .map((item) => item.created_at || item.createdAt)
      .filter(Boolean),
    dailyTransactions: transactions,
    recentActivities: activities,
    maintenanceSummary,
    fuelSummary,
    usageByVehicle,
    revenueSummary,
    instructorsActive: Number(instructorCount || 0),
  };
}

async function scheduleEmailReports({ recipients, frequency, fileFormat, course = "overall", requestedByUserId = null }) {
  const normalizedRecipients = normalizeRecipients(recipients);
  if (normalizedRecipients.length === 0) {
    const error = new Error("At least one valid recipient is required");
    error.status = 400;
    throw error;
  }

  const schedule = await ReportSchedule.create({
    recipients: normalizedRecipients,
    frequency,
    file_format: fileFormat,
    course,
    created_by_user_id: requestedByUserId,
    next_run_at: buildNextRunAt(frequency),
    status: "scheduled",
    is_active: true,
  });

  return {
    message: "Email report schedule saved",
    schedule: {
      id: schedule.id,
      recipients: schedule.recipients,
      frequency: schedule.frequency,
      fileFormat: schedule.file_format,
      course: schedule.course,
      requestedByUserId: schedule.created_by_user_id,
      nextRunAt: schedule.next_run_at,
      lastSentAt: schedule.last_sent_at,
      isActive: schedule.is_active,
      status: schedule.status,
      createdAt: schedule.created_at,
    },
  };
}

async function sendTestEmailReport({ recipients, frequency, fileFormat, course = "overall", requestedByUserId = null }) {
  const normalizedRecipients = normalizeRecipients(recipients);
  if (normalizedRecipients.length === 0) {
    const error = new Error("At least one valid recipient is required");
    error.status = 400;
    throw error;
  }

  const { sendReportEmailNow } = require("./reportEmail.service");
  return sendReportEmailNow({
    recipients: normalizedRecipients,
    frequency,
    fileFormat,
    course,
    requestedByUserId,
    isTest: true,
  });
}

async function sendEmailReport({ recipients, frequency, fileFormat, course = "overall", requestedByUserId = null }) {
  const normalizedRecipients = normalizeRecipients(recipients);
  if (normalizedRecipients.length === 0) {
    const error = new Error("At least one valid recipient is required");
    error.status = 400;
    throw error;
  }

  const { sendReportEmailNow } = require("./reportEmail.service");
  return sendReportEmailNow({
    recipients: normalizedRecipients,
    frequency,
    fileFormat,
    course,
    requestedByUserId,
    isTest: false,
  });
}

module.exports = {
  getDailyReports,
  getOverviewReports,
  scheduleEmailReports,
  sendTestEmailReport,
  sendEmailReport,
};

