const { sequelize, Course } = require("../../../models");
const repository = require("./schedules.repository");

const SLOT_MAP = {
  morning: { startTime: "08:00:00", endTime: "12:00:00", label: "08:00 AM - 12:00 PM" },
  afternoon: { startTime: "13:00:00", endTime: "17:00:00", label: "01:00 PM - 05:00 PM" },
};

const COURSE_TYPE_TO_NAME = {
  tdc: "TDC", pdc_beginner: "PDC Beginner", pdc_experience: "PDC Experience",
};

const COURSE_TYPE_TO_DESCRIPTION = {
  tdc: "Theoretical Driving Course", pdc_beginner: "Practical Driving Course - Beginner", pdc_experience: "Practical Driving Course - Experience",
};

const TDC_SESSION_CAPACITY = Math.max(1, Number(process.env.TDC_SESSION_CAPACITY || 30));
const BEGINNER_AUTOMATION_TAG_PREFIX = "[AUTO_GROUP:";
const NON_OPERATION_DAY_INDEX = new Set([0]); // Sunday

function addDaysToIsoDate(dateIso, daysToAdd) {
  const match = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.valueOf())) return null;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  const nextYear = date.getUTCFullYear(); const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0"); const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getNextOperationalDay(startDateIso) {
  let currentDate = startDateIso;
  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    const nextDate = addDaysToIsoDate(currentDate, 1);
    if (!nextDate) return null;
    const dateObj = new Date(`${nextDate}T00:00:00`);
    if (dateObj.getDay() !== 0) return nextDate;
    currentDate = nextDate;
    attempts += 1;
  }
  return null;
}

function evaluateOperationalDay(dateIso) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return { operational: false, reason: "Invalid date" };
  if (NON_OPERATION_DAY_INDEX.has(date.getDay())) return { operational: false, reason: "No operations on Sundays" };
  return { operational: true, reason: "Operational day" };
}

function isCourseAllowedOnWeekday(dateIso, courseType) {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return { allowed: false, reason: "Invalid date" };
  const day = date.getDay();
  const normalizedType = normalizeCourseType(courseType);
  if (normalizedType === "tdc") return day === 0 ? { allowed: false, reason: "TDC is only allowed Monday to Saturday" } : { allowed: true, reason: "Allowed" };
  if (normalizedType === "pdc_beginner" || normalizedType === "pdc_experience") return (day < 1 || day > 6) ? { allowed: false, reason: "PDC is allowed Monday to Saturday only" } : { allowed: true, reason: "Allowed" };
  return { allowed: true, reason: "Allowed" };
}

function validateCourseOperationalDay(dateIso, courseType) {
  const weekdayRule = isCourseAllowedOnWeekday(dateIso, courseType);
  if (!weekdayRule.allowed) return { operational: false, reason: weekdayRule.reason, message: weekdayRule.reason };
  const status = evaluateOperationalDay(dateIso);
  return { operational: status.operational, reason: status.reason, message: status.operational ? "Operational day" : status.reason };
}

function validateBeginnerSecondDay(startDateIso) {
  const secondDateIso = addDaysToIsoDate(startDateIso, 1);
  if (!secondDateIso) return { secondDateIso: null, operational: false, reason: "Invalid start date", message: "Invalid starting date" };
  const status = validateCourseOperationalDay(secondDateIso, "pdc_beginner");
  return { secondDateIso, operational: status.operational, reason: status.reason, message: status.operational ? "Second session date is operational" : `Second session (${secondDateIso}) falls on a non-operational day (${status.reason}). Pick another starting date.` };
}

function isMotorcycleTarget(targetVehicle) {
  const normalized = String(targetVehicle || "").trim().toLowerCase();
  return normalized.includes("motorcycle") || normalized.includes("tricycle") || normalized.includes("dl codes a");
}

function buildSchedulePlan(courseType, startDateIso, preferredSlot, schedulePayload = {}) {
  const normalizedType = normalizeCourseType(courseType);
  if (normalizedType === "pdc_experience") {
    const secondDate = isMotorcycleTarget(schedulePayload.target_vehicle) ? null : addDaysToIsoDate(startDateIso, 1);
    return [
      { date: startDateIso, slot: "morning" }, { date: startDateIso, slot: "afternoon" },
      ...(secondDate ? [{ date: secondDate, slot: "morning" }, { date: secondDate, slot: "afternoon" }] : []),
    ];
  }
  if (normalizedType === "pdc_beginner") return [{ date: startDateIso, slot: preferredSlot }, { date: addDaysToIsoDate(startDateIso, 1), slot: preferredSlot }];
  if (normalizedType === "tdc") {
    const secondDay = getNextOperationalDay(startDateIso);
    if (!secondDay) return [{ date: startDateIso, slot: "morning" }, { date: startDateIso, slot: "afternoon" }];
    return [{ date: startDateIso, slot: "morning" }, { date: startDateIso, slot: "afternoon" }, { date: secondDay, slot: "morning" }, { date: secondDay, slot: "afternoon" }];
  }
  return [{ date: startDateIso, slot: preferredSlot }];
}

function uniqueDates(plan) { return [...new Set(plan.map((item) => item.date).filter(Boolean))]; }
function toPositiveIntegerOrNull(value) { const numeric = Number(value); return (!Number.isInteger(numeric) || numeric <= 0) ? null : numeric; }
function beginnerAutomationTag(groupId) { return `${BEGINNER_AUTOMATION_TAG_PREFIX}${groupId}]`; }
function extractBeginnerAutomationGroup(remarks) { const match = String(remarks || "").match(/\[AUTO_GROUP:([^\]]+)\]/); return match ? match[1] : ""; }
function stripBeginnerAutomationTag(remarks) { return String(remarks || "").replace(/\s*\[AUTO_GROUP:[^\]]+\]/g, "").trim(); }
function appendRemarkTag(remarks, tag) { const note = String(remarks || "").trim(); if (!tag) return note || null; return note ? `${note} ${tag}` : tag; }

function isSameScheduleResource(rowA, rowB) {
  return rowA.course_id === rowB.course_id && rowA.instructor_id === rowB.instructor_id && (rowA.care_of_instructor_id || null) === (rowB.care_of_instructor_id || null) && (rowA.vehicle_id || null) === (rowB.vehicle_id || null) && rowA.start_time === rowB.start_time && rowA.end_time === rowB.end_time;
}

async function resolveBeginnerPairRows(targetRow, transaction) {
  const groupId = extractBeginnerAutomationGroup(targetRow.remarks);
  if (groupId) {
    const rows = await repository.findSchedulesByRemarksToken(beginnerAutomationTag(groupId), transaction);
    const beginnerRows = rows.filter((row) => matchesCourseType(row, "pdc_beginner"));
    if (beginnerRows.length >= 2) return beginnerRows;
  }
  const previousDate = addDaysToIsoDate(targetRow.schedule_date, -1);
  const nextDate = addDaysToIsoDate(targetRow.schedule_date, 1);
  const [previousRows, nextRows] = await Promise.all([
    previousDate ? repository.findSchedulesByDate(previousDate, transaction) : Promise.resolve([]),
    nextDate ? repository.findSchedulesByDate(nextDate, transaction) : Promise.resolve([]),
  ]);
  const candidates = [...previousRows, ...nextRows].filter((row) => row.id !== targetRow.id).filter((row) => matchesCourseType(row, "pdc_beginner")).filter((row) => isSameScheduleResource(row, targetRow));
  return [targetRow, ...candidates].slice(0, 2);
}

function rowMatchesResourceFilter(row, filter = {}) {
  const instructorId = toPositiveIntegerOrNull(filter.instructorId); const vehicleId = toPositiveIntegerOrNull(filter.vehicleId);
  if (!instructorId && !vehicleId) return false;
  return (instructorId ? row.instructor_id === instructorId || row.care_of_instructor_id === instructorId : false) || (vehicleId ? row.vehicle_id === vehicleId : false);
}

function courseRequiresVehicle(courseType) { return normalizeCourseType(courseType) !== "tdc"; }

async function validateSchedulePlanResources({ plan, courseType, instructorId, careOfInstructorId, vehicleId, transaction }) {
  const normalizedType = normalizeCourseType(courseType);
  const requiresVehicle = courseRequiresVehicle(normalizedType);
  const dates = uniqueDates(plan);
  if (dates.length === 0) { const error = new Error("Invalid schedule plan dates"); error.status = 400; throw error; }

  const [existingRowsByDate, maintenanceLogs] = await Promise.all([
    Promise.all(dates.map((date) => repository.findSchedulesByDate(date, transaction))),
    requiresVehicle && vehicleId ? repository.findMaintenanceLogsForVehicleRange(vehicleId, dates[0], dates[dates.length - 1], transaction) : Promise.resolve([]),
  ]);

  if (maintenanceLogs.length > 0) { const error = new Error("Resource unavailable for the selected dates/slots."); error.status = 400; throw error; }

  const rowsMap = new Map(dates.map((date, index) => [date, existingRowsByDate[index] || []]));
  const skipInstructorConflicts = normalizedType === "tdc";

  for (const item of plan) {
    const slotConfig = SLOT_MAP[item.slot];
    const rows = rowsMap.get(item.date) || [];
    const inSameSlot = rows.filter((row) => row.start_time === slotConfig.startTime && row.end_time === slotConfig.endTime);

    if (!skipInstructorConflicts) {
      if (instructorId && rows.some((row) => row.instructor_id === instructorId || row.care_of_instructor_id === instructorId)) { 
        const error = new Error("Selected instructor already has a booking on this date."); error.status = 400; throw error; 
      }
      if (careOfInstructorId && rows.some((row) => row.instructor_id === careOfInstructorId || row.care_of_instructor_id === careOfInstructorId)) { 
        const error = new Error("Care Of instructor is already booked."); error.status = 400; throw error; 
      }
      if (requiresVehicle && vehicleId && rows.some((row) => row.vehicle_id === vehicleId)) { 
        const error = new Error("Vehicle is already booked on this slot."); error.status = 400; throw error; 
      }
    } else {
      if (instructorId) {
        const instructorBookings = inSameSlot.filter(r => r.instructor_id === instructorId || r.care_of_instructor_id === instructorId);
        if (instructorBookings.length >= TDC_SESSION_CAPACITY) {
          const error = new Error(`Fully booked na si Instructor sa araw/slot na ito. (Max ${TDC_SESSION_CAPACITY} students).`);
          error.status = 400; throw error;
        }
      }
    }

    let qualifiedInstructorCount = await repository.countQualifiedInstructors(courseType);
    const totalInstructorCount = await repository.countInstructors();
    if (!qualifiedInstructorCount && totalInstructorCount) qualifiedInstructorCount = totalInstructorCount;
    const vehicleCount = await repository.countVehicles();
    const capacity = capacityByCategory(courseType, qualifiedInstructorCount, vehicleCount);
    const categoryBookingsInSlot = inSameSlot.filter((row) => matchesCourseType(row, courseType));

    if (categoryBookingsInSlot.length >= capacity) {
      const error = new Error("No instructors/slots available for this category and time slot."); error.status = 400; throw error;
    }
  }
}

function normalizeCourseType(rawType) { return String(rawType || "").trim().toLowerCase(); }
function courseTypeFromName(courseName) {
  const normalizedName = String(courseName || "").trim().toLowerCase();
  if (!normalizedName) return "";
  if (normalizedName.includes("tdc")) return "tdc";
  if (normalizedName.includes("pdc") && normalizedName.includes("experience")) return "pdc_experience";
  if (normalizedName.includes("pdc") && normalizedName.includes("beginner")) return "pdc_beginner";
  if (normalizedName.includes("pdc")) return "pdc_beginner";
  return "";
}

function inferCourseTypeFromEnrollment(enrollment) {
  if (!enrollment) return "";
  const dlCode = String(enrollment?.DLCode?.code || "").toUpperCase();
  const pdcType = String(enrollment?.pdc_type || "").trim().toLowerCase();
  if (pdcType === "experience") return "pdc_experience";
  if (pdcType === "beginner") return "pdc_beginner";
  if (dlCode.includes("TDC") && !dlCode.includes("PDC") && !dlCode.includes("PROMO")) return "tdc";
  if (dlCode.includes("PDC") || dlCode.includes("PROMO")) return "pdc_beginner";
  return "";
}

function scheduleCourseType(row) { return courseTypeFromName(row?.Course?.course_name); }
function matchesCourseType(row, courseType) { const normalizedType = normalizeCourseType(courseType); if (!normalizedType || normalizedType === "overall") return true; return scheduleCourseType(row) === normalizedType; }

function capacityByCategory(courseType, instructorCount, vehicleCount) {
  const normalizedType = normalizeCourseType(courseType);
  if (normalizedType === "pdc_experience") return instructorCount > 0 ? 3 : 0;
  if (normalizedType === "pdc_beginner") return instructorCount > 0 ? 2 : 0;
  if (normalizedType === "tdc") return instructorCount > 0 ? TDC_SESSION_CAPACITY : 0;
  return Math.max(0, Math.min(instructorCount, vehicleCount));
}

async function resolveCourseId(payload, transaction) {
  if (Number.isInteger(payload.course_id) && payload.course_id > 0) return payload.course_id;
  const normalizedType = normalizeCourseType(payload.course_type); const courseName = COURSE_TYPE_TO_NAME[normalizedType];
  if (!courseName) { const error = new Error("course_id or valid course_type is required"); error.status = 400; throw error; }
  let course = await Course.findOne({ where: { course_name: courseName }, transaction });
  if (!course) course = await Course.create({ course_name: courseName, description: COURSE_TYPE_TO_DESCRIPTION[normalizedType] }, { transaction });
  return course.id;
}

async function resolveEffectiveCourseType(payload, resolvedCourseId, transaction) {
  const explicitType = normalizeCourseType(payload.course_type); if (explicitType) return explicitType;
  const course = await Course.findByPk(resolvedCourseId, { attributes: ["id", "course_name"], transaction });
  const inferredType = courseTypeFromName(course?.course_name); if (inferredType) return inferredType;
  const error = new Error("Unable to infer schedule course type."); error.status = 400; throw error;
}

function capacityFromResources(instructorCount, vehicleCount) { return Math.max(0, Math.min(instructorCount, vehicleCount)); }
function studentName(student) { if (!student) return null; return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ") || `Student #${student.id}`; }

function mapSchedule(row) {
  const selectedEnrollment = row?.selectedEnrollment || null;
  const firstEnrollment = selectedEnrollment || row?.Enrollments?.[0];
  const linkedStudent = selectedEnrollment?.Student || firstEnrollment?.Student || row?.scheduledStudent;
  const resolvedCourseType = scheduleCourseType(row) || inferCourseTypeFromEnrollment(firstEnrollment);
  const trainerName = row?.Instructor?.name || "-";
  const careOfName = row?.careOfInstructor?.name || trainerName;
  const instructorDisplay = careOfName === trainerName ? trainerName : `${careOfName} (Care Of) / ${trainerName} (Trainer)`;

  return {
    id: row.id, vehicle_id: row.vehicle_id || null, vehicleId: row.vehicle_id || null,
    scheduleDate: row.schedule_date, slot: row.start_time === SLOT_MAP.morning.startTime ? "morning" : "afternoon",
    slotLabel: row.start_time === SLOT_MAP.morning.startTime ? SLOT_MAP.morning.label : SLOT_MAP.afternoon.label,
    course: row?.Course?.course_name || firstEnrollment?.DLCode?.code || "Course", courseType: resolvedCourseType,
    dlCodes: firstEnrollment?.DLCode?.code || "-", vehicleName: row?.Vehicle?.vehicle_name || row?.Vehicle?.plate_number || null,
    vehicleType: row?.Vehicle?.vehicle_type || (resolvedCourseType === "tdc" ? "Lecture / No Vehicle" : "-"),
    transmissionType: row?.Vehicle?.transmission_type || "-", instructor: instructorDisplay, careOfInstructor: careOfName, trainerInstructor: trainerName,
    studentName: studentName(linkedStudent) || "Open Slot", studentEmail: linkedStudent?.email || firstEnrollment?.Student?.email || "",
    studentContact: linkedStudent?.phone || firstEnrollment?.Student?.phone || "",
    ltoPortalAccount: linkedStudent?.StudentProfile?.lto_portal_account || firstEnrollment?.Student?.StudentProfile?.lto_portal_account || selectedEnrollment?.Student?.StudentProfile?.lto_portal_account || "",
    transmissionRule: firstEnrollment?.transmission_type || row?.Vehicle?.transmission_type || "", isAlreadyDriver: firstEnrollment?.is_already_driver ?? null, targetVehicle: firstEnrollment?.target_vehicle || "-",
    enrollmentId: row?.enrollment_id || selectedEnrollment?.id || firstEnrollment?.id || null, studentId: row?.student_id || linkedStudent?.id || null,
    remarks: row.student_remarks || row.remarks || "Available schedule slot", studentRemarks: row.student_remarks || row.remarks || "", instructorRemarks: row.instructor_remarks || "",
  };
}

function linkedEnrollmentForRow(row) { return row?.selectedEnrollment || row?.Enrollment || row?.Enrollments?.[0] || null; }
function hasLinkedStudentForRow(row) { const enrollment = linkedEnrollmentForRow(row); return Boolean(row?.scheduledStudent || enrollment?.Student); }

function includeScheduleRow(row) {
  if (!row) return false;
  const enrollment = linkedEnrollmentForRow(row);
  if (enrollment && enrollment.status === "pending") return false;
  if (!row.student_id && !row.enrollment_id) return true;
  if (!row.student_id) return true;
  return hasLinkedStudentForRow(row);
}

async function getSlotAvailability(date, slot, courseType = "overall", resourceFilter = {}) {
  const slotConfig = SLOT_MAP[slot]; const normalizedType = normalizeCourseType(courseType || "overall");
  const [schedules, daySchedules, totalInstructorCount, qualifiedInstructorCount, vehicleCount] = await Promise.all([
    repository.findSchedulesByDateAndTime(date, slotConfig.startTime, slotConfig.endTime),
    repository.findSchedulesByDate(date),
    repository.countInstructors(),
    normalizedType === "overall" ? Promise.resolve(0) : repository.countQualifiedInstructors(normalizedType),
    repository.countVehicles(),
  ]);

  const filterValidSchedules = (rows) => rows.filter(includeScheduleRow);
  const validSchedules = filterValidSchedules(schedules); const validDaySchedules = filterValidSchedules(daySchedules);

  if (normalizedType === "pdc_experience") {
    const experienceRows = validDaySchedules.filter((row) => matchesCourseType(row, "pdc_experience"));
    const capacity = capacityByCategory("pdc_experience", qualifiedInstructorCount, vehicleCount);
    const booked = experienceRows.length; const resourceBlocked = validDaySchedules.some((row) => rowMatchesResourceFilter(row, resourceFilter));
    const full = capacity <= 0 || booked >= capacity || resourceBlocked;
    return { slot, slotLabel: slotConfig.label, capacity, booked, available: Math.max(0, capacity - booked), full, fullLabel: resourceBlocked ? "Fully Booked (Selected Resource)" : full ? "Resource Full" : "Available", schedules: experienceRows.map(mapSchedule) };
  }

  const scopedSchedules = normalizedType === "overall" ? validSchedules : validSchedules.filter((row) => matchesCourseType(row, normalizedType));
  const capacity = normalizedType === "overall" ? capacityFromResources(totalInstructorCount, vehicleCount) : capacityByCategory(normalizedType, qualifiedInstructorCount, vehicleCount);
  const booked = scopedSchedules.length; const resourceBlocked = validSchedules.some((row) => rowMatchesResourceFilter(row, resourceFilter));
  const full = capacity <= 0 || booked >= capacity || resourceBlocked;

  return { slot, slotLabel: slotConfig.label, capacity, booked, available: Math.max(0, capacity - booked), full, fullLabel: resourceBlocked ? "Fully Booked (Selected Resource)" : full && normalizedType.startsWith("pdc") ? "Resource Full" : full ? "Fully Booked" : "Available", schedules: scopedSchedules.map(mapSchedule) };
}

async function listSchedulesByDate(date, courseType = "overall", resourceFilter = {}) {
  const [morning, afternoon] = await Promise.all([ getSlotAvailability(date, "morning", courseType, resourceFilter), getSlotAvailability(date, "afternoon", courseType, resourceFilter) ]);
  const normalizedType = normalizeCourseType(courseType || "overall"); const dayRows = await repository.findSchedulesByDate(date); const validRows = dayRows.filter(includeScheduleRow);
  const scopedRows = normalizedType === "overall" ? validRows : validRows.filter((row) => matchesCourseType(row, normalizedType));
  const dayRestriction = normalizedType && normalizedType !== "overall" ? validateCourseOperationalDay(date, normalizedType) : null;
  const beginnerSecondDay = normalizedType === "pdc_beginner" ? validateBeginnerSecondDay(date) : null;
  return { date, courseType: normalizedType || "overall", dayRestriction, beginnerSecondDay, slots: [morning, afternoon], dayFull: morning.full && afternoon.full, items: scopedRows.map(mapSchedule) };
}

async function listSchedulesByRange(startDate, endDate) {
  const rows = await repository.findSchedulesByDateRange(startDate, endDate);
  const valid = (rows || []).filter(includeScheduleRow);
  return valid.map(mapSchedule);
}

async function getScheduleById(id, transaction) { return repository.findScheduleById(id, transaction); }

async function listMonthStatus(year, month) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0);
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const [rows, beginnerInstructorCount, experienceInstructorCount] = await Promise.all([ repository.findSchedulesByDateRange(startDate, endDate), repository.countQualifiedInstructors("pdc_beginner"), repository.countQualifiedInstructors("pdc_experience") ]);
  const beginnerCapacity = capacityByCategory("pdc_beginner", beginnerInstructorCount, 0); const experienceCapacity = capacityByCategory("pdc_experience", experienceInstructorCount, 0);
  const grouped = new Map();
  rows.forEach((row) => {
    if (!includeScheduleRow(row)) return;
    const key = row.schedule_date;
    if (!grouped.has(key)) grouped.set(key, { morningBeginner: 0, afternoonBeginner: 0, experienceBooked: 0 });
    const rowCourseType = scheduleCourseType(row);
    if (rowCourseType === "pdc_experience") { grouped.get(key).experienceBooked += 1; return; }
    if (rowCourseType === "pdc_beginner") { const slot = row.start_time === SLOT_MAP.morning.startTime ? "morning" : "afternoon"; if (slot === "morning") { grouped.get(key).morningBeginner += 1; } else { grouped.get(key).afternoonBeginner += 1; } }
  });
  return Array.from(grouped.entries()).map(([date, counts]) => {
    const morningBeginnerFull = beginnerCapacity <= 0 || counts.morningBeginner >= beginnerCapacity;
    const afternoonBeginnerFull = beginnerCapacity <= 0 || counts.afternoonBeginner >= beginnerCapacity;
    const experienceFull = experienceCapacity <= 0 || counts.experienceBooked >= experienceCapacity;
    return { date, morningFull: morningBeginnerFull && experienceFull, afternoonFull: afternoonBeginnerFull && experienceFull, dayFull: morningBeginnerFull && afternoonBeginnerFull && experienceFull };
  });
}

async function addSchedule(payload, options = {}) {
  const ownTransaction = !options.transaction;
  const transaction = options.transaction || await sequelize.transaction();

  try {
    const selectedEnrollment = options.selectedEnrollment || (payload.enrollment_id ? await repository.findEnrollmentByIdForScheduling(payload.enrollment_id, transaction) : null);
    
    const enrollmentCourseType = inferCourseTypeFromEnrollment(selectedEnrollment);
    const explicitCourseType = normalizeCourseType(payload.course_type);
    const preferredCourseType = explicitCourseType || enrollmentCourseType;

    const resolvedInput = { ...payload, course_type: preferredCourseType || payload.course_type };
    const resolvedCourseId = await resolveCourseId(resolvedInput, transaction);
    const effectiveCourseType = preferredCourseType || await resolveEffectiveCourseType(resolvedInput, resolvedCourseId, transaction);

    const [qualifiedInstructorCount, vehicleCount] = await Promise.all([
      repository.countQualifiedInstructors(effectiveCourseType),
      repository.countVehicles(),
    ]);

    const requiresVehicle = courseRequiresVehicle(effectiveCourseType);

    if (payload.schedule_date) {
      const startDayCheck = validateCourseOperationalDay(payload.schedule_date, effectiveCourseType);
      if (!startDayCheck.operational) { const error = new Error(startDayCheck.message); error.status = 400; throw error; }

      if (effectiveCourseType === "pdc_beginner") { const secondDayCheck = validateBeginnerSecondDay(payload.schedule_date); if (!secondDayCheck.operational) { const error = new Error(secondDayCheck.message); error.status = 400; throw error; } }
      if (effectiveCourseType === "pdc_experience" && !isMotorcycleTarget(payload.target_vehicle)) { const secondDayCheck = validateBeginnerSecondDay(payload.schedule_date); if (!secondDayCheck.operational) { const error = new Error(secondDayCheck.message); error.status = 400; throw error; } }
    }

    const capacity = capacityByCategory(effectiveCourseType, qualifiedInstructorCount, vehicleCount) || 1;
    
    const plan = payload.schedule_date ? buildSchedulePlan(effectiveCourseType, payload.schedule_date, payload.slot, payload) : [];

    if (!options.skipResourceValidation && plan.length > 0) {
      await validateSchedulePlanResources({
        plan, courseType: effectiveCourseType, instructorId: payload.instructor_id, careOfInstructorId: payload.care_of_instructor_id || null,
        vehicleId: requiresVehicle ? payload.vehicle_id : null, transaction,
      });
    }

    const beginnerGroupId = effectiveCourseType === "pdc_beginner" && payload.schedule_date ? `${payload.schedule_date}-${payload.slot}-${payload.instructor_id}-${Date.now()}` : "";
    const linkedStudentId = selectedEnrollment?.student_id || selectedEnrollment?.Student?.id || null;
    
    const createPayload = {
      course_id: resolvedCourseId, 
      course_type: effectiveCourseType, 
      instructor_id: payload.instructor_id || null, 
      care_of_instructor_id: payload.care_of_instructor_id || null,
      vehicle_id: requiresVehicle ? payload.vehicle_id : null, 
      enrollment_id: selectedEnrollment?.id || null, 
      student_id: linkedStudentId,
      schedule_date: payload.schedule_date || null, 
      slots: capacity, 
      remarks: appendRemarkTag(payload.remarks, beginnerGroupId ? beginnerAutomationTag(beginnerGroupId) : ""),
    };

    let createdPrimary = null;
    const createdScheduleIds = [];
    
    if (plan.length > 0) {
      for (const planItem of plan) {
        const planSlot = SLOT_MAP[planItem.slot];
        const created = await repository.createSchedule({ ...createPayload, schedule_date: planItem.date, start_time: planSlot.startTime, end_time: planSlot.endTime }, transaction);
        createdScheduleIds.push(created.id);
        if (!createdPrimary) createdPrimary = created;
      }
    } else {
      const created = await repository.createSchedule({ ...createPayload, start_time: null, end_time: null }, transaction);
      createdScheduleIds.push(created.id);
      createdPrimary = created;
    }

    if (selectedEnrollment?.id) await repository.updateEnrollmentSchedule(selectedEnrollment, createdPrimary?.id || null, transaction);
    if (ownTransaction) await transaction.commit();

    const createdRows = await repository.findSchedulesByIds(createdScheduleIds, ownTransaction ? undefined : transaction);
    const createdRow = createdRows.find((item) => item.id === createdPrimary.id);

    return { item: mapSchedule(createdRow), createdItems: createdRows.map(mapSchedule), reservedDates: uniqueDates(plan), slot: payload.slot, courseType: effectiveCourseType };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

function schedulePayloadFromExistingRow(row, requestedScheduleDate, requestedSlot) {
  return { enrollment_id: row?.enrollment_id || row?.selectedEnrollment?.id || row?.Enrollments?.[0]?.id || null, course_type: scheduleCourseType(row), instructor_id: row.instructor_id, care_of_instructor_id: row.care_of_instructor_id || null, vehicle_id: row.vehicle_id || null, schedule_date: requestedScheduleDate, slot: requestedSlot, remarks: stripBeginnerAutomationTag(row.remarks) };
}

async function cancelSchedule(scheduleId, scope = "single", options = {}) {
  const ownTransaction = !options.transaction; const transaction = options.transaction || await sequelize.transaction();
  try {
    const target = await repository.findScheduleById(scheduleId, transaction);
    if (!target) { const error = new Error("Schedule not found"); error.status = 404; throw error; }
    const requestedScope = String(scope || "single").toLowerCase() === "both" ? "both" : "single";
    const targetIsBeginner = matchesCourseType(target, "pdc_beginner");
    let rowsToDelete = [target];
    if (requestedScope === "both" && targetIsBeginner) rowsToDelete = await resolveBeginnerPairRows(target, transaction);
    const uniqueRows = rowsToDelete.filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index);
    const ids = uniqueRows.map((row) => row.id);
    const linkedEnrollmentId = target?.enrollment_id || target?.selectedEnrollment?.id || null;
    await repository.deleteSchedulesByIds(ids, transaction);
    if (linkedEnrollmentId) { const linkedEnrollment = await repository.findEnrollmentByIdForScheduling(linkedEnrollmentId, transaction); await repository.updateEnrollmentSchedule(linkedEnrollment, null, transaction); }
    if (ownTransaction) await transaction.commit();
    return { cancelledIds: ids, cancelledDates: uniqueRows.map((row) => row.schedule_date), cancelledCount: ids.length, scopeApplied: requestedScope === "both" && targetIsBeginner ? "both" : "single", slot: uniqueRows[0]?.start_time === SLOT_MAP.morning.startTime ? "morning" : "afternoon" };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

async function rescheduleSchedule(scheduleId, payload, options = {}) {
  const ownTransaction = !options.transaction; const transaction = options.transaction || await sequelize.transaction();
  try {
    const target = await repository.findScheduleById(scheduleId, transaction);
    if (!target) { const error = new Error("Schedule not found"); error.status = 404; throw error; }
    const requestedScope = matchesCourseType(target, "pdc_beginner") ? "both" : "single";
    const createPayload = schedulePayloadFromExistingRow(target, payload.schedule_date, payload.slot);
    const selectedEnrollment = createPayload.enrollment_id ? await repository.findEnrollmentByIdForScheduling(createPayload.enrollment_id, transaction) : null;
    const cancelled = await cancelSchedule(scheduleId, requestedScope, { transaction });
    const created = await addSchedule(createPayload, { transaction, selectedEnrollment, allowPendingEnrollment: true, skipSlotConflictChecks: true, skipResourceValidation: true });
    if (ownTransaction) await transaction.commit();
    return { ...created, cancelledIds: cancelled.cancelledIds, scopeApplied: cancelled.scopeApplied };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

async function updateScheduleRemarks(scheduleId, remarks, options = {}) {
  const ownTransaction = !options.transaction; const transaction = options.transaction || await sequelize.transaction();
  try {
    const target = await repository.findScheduleById(scheduleId, transaction);
    if (!target) { const error = new Error("Schedule not found"); error.status = 404; throw error; }
    const payload = typeof remarks === "object" && remarks !== null ? remarks : { remarks };
    const hasStudentRemarks = Object.prototype.hasOwnProperty.call(payload, "studentRemarks") || Object.prototype.hasOwnProperty.call(payload, "student_remarks") || Object.prototype.hasOwnProperty.call(payload, "remarks");
    const hasInstructorRemarks = Object.prototype.hasOwnProperty.call(payload, "instructorRemarks") || Object.prototype.hasOwnProperty.call(payload, "instructor_remarks");
    const studentRemarks = hasStudentRemarks ? String(payload.studentRemarks ?? payload.student_remarks ?? payload.remarks ?? "").trim() || null : undefined;
    const instructorRemarks = hasInstructorRemarks ? String(payload.instructorRemarks ?? payload.instructor_remarks ?? "").trim() || null : undefined;
    const updatePayload = {};
    if (hasStudentRemarks && (await repository.hasRemarksColumn())) updatePayload.remarks = studentRemarks;
    if (hasStudentRemarks && (await repository.hasStudentRemarksColumn())) updatePayload.student_remarks = studentRemarks;
    if (hasInstructorRemarks && (await repository.hasInstructorRemarksColumn())) updatePayload.instructor_remarks = instructorRemarks;
    await repository.updateSchedule(target, updatePayload, transaction);
    const updated = await repository.findScheduleById(scheduleId, transaction);
    if (ownTransaction) await transaction.commit();
    return { item: mapSchedule(updated) };
  } catch (error) {
    if (ownTransaction) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  SLOT_MAP, listSchedulesByDate, listSchedulesByRange, listMonthStatus, getScheduleById,
  isBeginnerSchedule: (row) => matchesCourseType(row, "pdc_beginner"),
  addSchedule, rescheduleSchedule, updateScheduleRemarks, cancelSchedule,
};