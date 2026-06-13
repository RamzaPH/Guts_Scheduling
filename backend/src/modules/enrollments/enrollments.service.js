const { Op } = require("sequelize");
const { sequelize } = require("../../../models");
const repository = require("./enrollments.repository");
const schedulesService = require("../schedules/schedules.service");

const {
  getRegions, getProvincesByRegion, getCitiesAndMunsByProvince, getBarangaysByCityOrMun,
} = require("latest-ph-address-thanks-to-anehan");

function looksLikeCode(v) { return typeof v === "string" && /^\d+$/.test(v.trim()); }
function getProvinceLabelGlobal(provinceCode) {
  if (!provinceCode) return provinceCode || "";
  const regions = getRegions();
  for (const r of regions) {
    const provinces = getProvincesByRegion(r.psgc);
    if (!Array.isArray(provinces)) continue;
    const match = provinces.find((item) => item.psgc === provinceCode);
    if (match) return match.name;
  }
  return provinceCode;
}
function getCityLabelGlobal(provinceCode, cityCode) {
  if (!cityCode) return cityCode || "";
  if (provinceCode) {
    try {
      const cities = getCitiesAndMunsByProvince(provinceCode);
      if (Array.isArray(cities)) { const match = cities.find((item) => item.psgc === cityCode); if (match) return match.name; }
    } catch (e) { /* ignore */ }
  }
  const regions = getRegions();
  for (const r of regions) {
    const provinces = getProvincesByRegion(r.psgc);
    if (!Array.isArray(provinces)) continue;
    for (const p of provinces) {
      try {
        const cities = getCitiesAndMunsByProvince(p.psgc);
        if (!Array.isArray(cities)) continue;
        const match = cities.find((item) => item.psgc === cityCode);
        if (match) return match.name;
      } catch (e) { /* ignore */ }
    }
  }
  return cityCode;
}
function getBarangayLabelGlobal(cityCode, barangayCode) {
  if (!barangayCode) return barangayCode || "";
  if (cityCode) {
    try {
      const barangays = getBarangaysByCityOrMun(cityCode);
      if (Array.isArray(barangays)) { const match = barangays.find((item) => item.psgc === barangayCode); if (match) return match.name; }
    } catch (e) { /* ignore */ }
  }
  const regions = getRegions();
  for (const r of regions) {
    const provinces = getProvincesByRegion(r.psgc);
    if (!Array.isArray(provinces)) continue;
    for (const p of provinces) {
      try {
        const cities = getCitiesAndMunsByProvince(p.psgc);
        if (!Array.isArray(cities)) continue;
        for (const c of cities) {
          try {
            const barangays = getBarangaysByCityOrMun(c.psgc);
            if (!Array.isArray(barangays)) continue;
            const match = barangays.find((item) => item.psgc === barangayCode);
            if (match) return match.name;
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }
  }
  return barangayCode;
}

const ENROLLMENT_TYPE_MAP = { TDC: { code: "TDC", description: "Theoretical Driving Course" }, PDC: { code: "PDC", description: "Practical Driving Course" }, PROMO: { code: "TDC + PDC PROMO", description: "Combined TDC and PDC promo enrollment" } };

function normalizeText(value) { if (typeof value !== "string") return value ?? null; const trimmed = value.trim(); return trimmed ? trimmed : null; }
function normalizeUpperText(value) { if (typeof value !== "string") return value ?? null; const trimmed = value.trim(); return trimmed ? trimmed.toUpperCase() : null; }
function normalizeAmount(value) { if (value === null || value === undefined || value === "") return null; const numeric = Number(value); return Number.isFinite(numeric) ? numeric : null; }
function toCurrencyNumber(value) { const numeric = normalizeAmount(value); return numeric === null ? 0 : numeric; }

function resolvePromoPrice(offer) {
  const fixed = normalizeAmount(offer?.fixed_price); if (fixed !== null && fixed > 0) return fixed;
  const discounted = normalizeAmount(offer?.discounted_price); if (discounted !== null && discounted > 0) return discounted;
  return 0;
}

async function validateAndComputeAdditionalPromos({ primaryPromoOfferId, additionalPromoIds, transaction }) {
  const ids = Array.isArray(additionalPromoIds) ? [...new Set(additionalPromoIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))] : [];
  if (ids.length === 0) return { normalizedIds: [], additionalPromosAmount: 0 };
  const primaryId = Number(primaryPromoOfferId);
  if (Number.isInteger(primaryId) && primaryId > 0 && ids.includes(primaryId)) { const error = new Error("additional promo list must not include the selected primary promo"); error.status = 400; throw error; }
  const { PromoOffer } = require("../../../models");
  const offers = await PromoOffer.findAll({ where: { id: ids, status: "active" }, transaction });
  if (offers.length !== ids.length) { const error = new Error(`Invalid or inactive additional promos`); error.status = 400; throw error; }
  const additionalPromosAmount = offers.reduce((sum, offer) => sum + resolvePromoPrice(offer), 0);
  return { normalizedIds: ids, additionalPromosAmount: Number(additionalPromosAmount.toFixed(2)) };
}

function attachPaymentSummary(enrollment) {
  if (!enrollment) return enrollment;
  const plain = enrollment.toJSON ? enrollment.toJSON() : enrollment;
  const payments = Array.isArray(plain.payments) ? plain.payments : [];
  const discountAmount = toCurrencyNumber(plain.discount_amount);
  const grossFee = toCurrencyNumber(plain.fee_amount);
  let totalDue = Math.max(grossFee - discountAmount, 0);
  let totalPaid = payments.reduce((sum, payment) => sum + toCurrencyNumber(payment.amount), 0);
  let remainingBalance = Math.max(totalDue - totalPaid, 0);
  return { ...plain, payment_summary: { total_due: Number(totalDue.toFixed(2)), total_paid: Number(totalPaid.toFixed(2)), remaining_balance: Number(remainingBalance.toFixed(2)), is_paid: remainingBalance <= 0 } };
}

function inferPdcTypeFromEnrollingFor(enrollingFor) {
  const normalized = normalizeText(enrollingFor)?.toLowerCase() || "";
  if (!normalized) return null;
  if (normalized.includes("beginner")) return "beginner";
  if (normalized.includes("experience") || normalized.includes("experienced") || normalized.includes("driving lesson")) return "experience";
  return null;
}

function normalizePdcType(rawType, rawCategory, enrollingFor = null) {
  const normalizedType = normalizeText(rawType); if (normalizedType) return normalizedType.toLowerCase();
  const normalizedCategory = normalizeText(rawCategory); if (!normalizedCategory) return inferPdcTypeFromEnrollingFor(enrollingFor);
  if (normalizedCategory.toLowerCase() === "experience") return "experience";
  if (normalizedCategory.toLowerCase() === "beginner") return "beginner";
  return inferPdcTypeFromEnrollingFor(enrollingFor);
}

function normalizePdcCategoryLabel(rawType, rawCategory, enrollingFor = null) {
  const inferredType = normalizePdcType(rawType, rawCategory, enrollingFor);
  if (inferredType === "experience") return "Experience";
  if (inferredType === "beginner") return "Beginner";
  return null;
}

function enrollmentTypeFromDlCodeCode(dlCodeRaw) {
  const code = String(dlCodeRaw || "").toUpperCase();
  if (code.includes("PROMO")) return "PROMO";
  if (code === "PDC") return "PDC";
  return "TDC";
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

function normalizeStudentPayload(student = {}) {
  return { first_name: normalizeUpperText(student.first_name), middle_name: normalizeUpperText(student.middle_name), last_name: normalizeUpperText(student.last_name), email: normalizeText(student.email), phone: normalizeText(student.phone) };
}

function normalizeProfilePayload(studentId, profile = {}, extras = {}, enrollment = {}) {
  const isDriver = Boolean(enrollment.is_already_driver);
  return {
    student_id: studentId, birthdate: normalizeText(profile.birthdate), birthplace: normalizeText(profile.birthplace), age: profile.age ?? null, gender: normalizeText(profile.gender), civil_status: normalizeText(profile.civil_status), nationality: normalizeText(profile.nationality), fb_link: normalizeText(profile.fb_link), gmail_account: normalizeText(profile.gmail_account), house_number: normalizeUpperText(profile.house_number), street: normalizeUpperText(profile.street), barangay: normalizeUpperText(profile.barangay), city: normalizeUpperText(profile.city), province: normalizeUpperText(profile.province), zip_code: normalizeText(profile.zip_code), region: normalizeText(extras.region), educational_attainment: normalizeText(extras.educational_attainment), emergency_contact_person: normalizeText(extras.emergency_contact_person), emergency_contact_number: normalizeText(extras.emergency_contact_number), lto_portal_account: normalizeText(extras.lto_portal_account), driving_school_tdc: normalizeText(extras.driving_school_tdc), year_completed_tdc: normalizeText(extras.year_completed_tdc), client_type: normalizeText(profile.client_type || enrollment.client_type || extras.client_type), promo_offer_id: profile.promo_offer_id ? Number(profile.promo_offer_id) : (enrollment.promo_offer_id ? Number(enrollment.promo_offer_id) : (extras.promo_offer_id ? Number(extras.promo_offer_id) : null)), enrolling_for: normalizeText(profile.enrolling_for || enrollment.enrolling_for || extras.enrolling_for), pdc_category: normalizeText(profile.pdc_category || enrollment.pdc_category || extras.pdc_category) || normalizePdcCategoryLabel(enrollment.pdc_type, enrollment.pdc_category, enrollment.enrolling_for || extras.enrolling_for || profile.enrolling_for), tdc_source: normalizeText(profile.tdc_source || enrollment.tdc_source || extras.tdc_source), training_method: normalizeText(profile.training_method || enrollment.training_method || extras.training_method), is_already_driver: Boolean(profile.is_already_driver ?? enrollment.is_already_driver ?? extras.is_already_driver), target_vehicle: isDriver ? normalizeText(profile.target_vehicle || enrollment.target_vehicle || extras.target_vehicle) : null, transmission_type: isDriver ? normalizeText(profile.transmission_type || enrollment.transmission_type || extras.transmission_type) : null, motorcycle_type: isDriver ? normalizeText(profile.motorcycle_type || enrollment.motorcycle_type || extras.motorcycle_type) : null,
  };
}

function normalizeEnrollmentPayload(enrollment = {}, extras = {}, studentId, dlCodeId, qrCodeId = null) {
  const normalizedPdcType = normalizePdcType(enrollment.pdc_type, enrollment.pdc_category, enrollment.enrolling_for || extras.enrolling_for);
  const channel = normalizeText(enrollment.enrollment_channel) || "walk_in";
  const startMode = normalizeText(enrollment.pdc_start_mode) || "later";
  const tdcSource = normalizeText(enrollment.tdc_source);
  const isDriver = Boolean(enrollment.is_already_driver);

  return {
    student_id: studentId, schedule_id: enrollment.schedule_id ?? null, package_id: enrollment.package_id ?? null, promo_offer_id: enrollment.promo_offer_id ?? null, dl_code_id: dlCodeId, qrCodeId, client_type: normalizeText(enrollment.client_type), is_already_driver: isDriver, target_vehicle: isDriver ? normalizeText(enrollment.target_vehicle) : null, transmission_type: isDriver ? normalizeText(enrollment.transmission_type) : null, motorcycle_type: isDriver ? normalizeText(enrollment.motorcycle_type) : null, training_method: normalizeText(enrollment.training_method), pdc_type: normalizedPdcType, fee_amount: normalizeAmount(enrollment.fee_amount), discount_amount: normalizeAmount(enrollment.discount_amount), payment_terms: normalizeText(enrollment.payment_terms), payment_reference_number: normalizeText(enrollment.payment_reference_number), payment_notes: normalizeText(enrollment.payment_notes), tdc_source: normalizedPdcType ? (tdcSource || "guts") : null, enrolling_for: normalizeText(extras.enrolling_for), score: normalizeText(extras.score), enrollment_channel: channel, external_application_ref: normalizeText(enrollment.external_application_ref), pdc_start_mode: startMode, pdc_desired_date: normalizeText(enrollment.pdc_desired_date), pdc_desired_time_slot: normalizeText(enrollment.pdc_desired_time_slot), additional_promo_offer_ids: Array.isArray(enrollment.additional_promo_offer_ids) ? enrollment.additional_promo_offer_ids.map((v) => (v === null || v === undefined ? null : Number(v))) : null, enrollment_state: "active", status: enrollment.status || "pending", created_at: enrollment.created_at || new Date(),
  };
}

function addDays(dateInput, days) { const base = new Date(dateInput || Date.now()); base.setDate(base.getDate() + days); return base; }
function toDateOnly(dateInput) { const date = new Date(dateInput || Date.now()); const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }

async function initializePromoLifecycle({ payload, enrollment, student, transaction }) {
  const now = new Date();
  const pdcType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category, payload.enrollment?.enrolling_for || payload.extras?.enrolling_for) === "experience" ? "experience" : "beginner";

  const desiredTdcDate = payload.promo_schedule_tdc?.schedule_date || payload.promo_schedule?.tdc?.schedule_date || payload.schedule?.schedule_date;
  const tdcDeadline = desiredTdcDate ? String(desiredTdcDate).split('T')[0] : toDateOnly(addDays(now, 30));
  const pdcValidUntil = toDateOnly(addDays(now, 365));
  const pdcStartMode = "later";

  const promoPackage = await repository.createPromoPackage({ student_id: student.id, enrollment_id: enrollment.id, status: "active", purchase_date: toDateOnly(now), tdc_deadline: tdcDeadline, pdc_valid_until: pdcValidUntil, allow_extension: false, extension_count: 0, notes: null }, transaction);
  await repository.createPromoEntitlement({ promo_package_id: promoPackage.id, module_type: "tdc", status: "not_started", required_sessions: 2, completed_sessions: 0, started_at: null, completed_at: null, expires_at: null }, transaction);
  await repository.createPromoEntitlement({ promo_package_id: promoPackage.id, module_type: "pdc", status: "not_started", required_sessions: pdcType === "experience" ? 1 : 2, completed_sessions: 0, started_at: null, completed_at: null, expires_at: pdcValidUntil }, transaction);
  await repository.updateEnrollment(enrollment, { promo_package_id: promoPackage.id, tdc_completion_deadline: tdcDeadline, pdc_eligibility_date: null, pdc_valid_until: pdcValidUntil, pdc_start_mode: pdcStartMode, enrollment_state: pdcStartMode === "later" ? "pdc_pending_schedule" : "active" }, transaction);
}

function toPositiveIntegerOrNull(value) { const numeric = Number(value); if (!Number.isInteger(numeric) || numeric <= 0) return null; return numeric; }

function scheduleCourseTypeFromEnrollmentPayload(payload) {
  if (payload.enrollment_type === "TDC") return "tdc";
  const pdcType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category, payload.enrollment?.enrolling_for || payload.extras?.enrolling_for);
  return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
}

function normalizeSchedulePayload(schedule = {}, payload = {}, enrollment = null, forcedCourseType = null) {
  const courseType = forcedCourseType || scheduleCourseTypeFromEnrollmentPayload(payload);
  const fallbackSchedule = payload?.schedule || {};
  const instructorId = toPositiveIntegerOrNull(schedule.instructor_id) || toPositiveIntegerOrNull(fallbackSchedule.instructor_id);
  const careOfInstructorId = toPositiveIntegerOrNull(schedule.care_of_instructor_id) || toPositiveIntegerOrNull(fallbackSchedule.care_of_instructor_id);
  const vehicleId = courseType === "tdc" ? null : toPositiveIntegerOrNull(schedule.vehicle_id) || toPositiveIntegerOrNull(fallbackSchedule.vehicle_id);
  const scheduleDate = normalizeText(schedule.schedule_date) || normalizeText(fallbackSchedule.schedule_date);
  const slot = normalizeText(schedule.slot) || normalizeText(fallbackSchedule.slot);

  return { enrollment_id: enrollment?.id || null, course_type: courseType, instructor_id: instructorId, care_of_instructor_id: careOfInstructorId, vehicle_id: vehicleId, schedule_date: scheduleDate, slot, target_vehicle: normalizeText(payload?.enrollment?.target_vehicle), transmission_type: normalizeText(payload?.enrollment?.transmission_type), motorcycle_type: normalizeText(payload?.enrollment?.motorcycle_type), is_already_driver: Boolean(payload?.enrollment?.is_already_driver), remarks: null };
}

async function resolveStudent(studentPayload, transaction) {
  if (studentPayload.id) {
    const existingStudent = await repository.findStudentById(studentPayload.id, transaction);
    if (!existingStudent) { const error = new Error("Student not found"); error.status = 404; throw error; }
    return repository.updateStudent(existingStudent, normalizeStudentPayload(studentPayload), transaction);
  }
  const normalizedStudent = normalizeStudentPayload(studentPayload);
  const matchedByEmail = await repository.findStudentByEmail(normalizedStudent.email, transaction);
  if (matchedByEmail) return repository.updateStudent(matchedByEmail, normalizedStudent, transaction);
  return repository.createStudent(normalizedStudent, transaction);
}

async function upsertStudentProfile(studentId, profilePayload, extrasPayload, enrollmentPayload, transaction) {
  const normalizedProfile = normalizeProfilePayload(studentId, profilePayload, extrasPayload, enrollmentPayload);
  const existingProfile = await repository.findStudentProfileByStudentId(studentId, transaction);

  const converted = { ...normalizedProfile };
  try {
    const origProvince = normalizedProfile.province; const origCity = normalizedProfile.city;
    if (looksLikeCode(origProvince)) converted.province = getProvinceLabelGlobal(origProvince) || origProvince;
    if (looksLikeCode(origCity)) converted.city = getCityLabelGlobal(origProvince, origCity) || origCity;
    if (looksLikeCode(normalizedProfile.barangay)) converted.barangay = getBarangayLabelGlobal(origCity, normalizedProfile.barangay) || normalizedProfile.barangay;
  } catch (e) { /* ignore error */ }

  if (existingProfile) return repository.updateStudentProfile(existingProfile, converted, transaction);
  return repository.createStudentProfile(converted, transaction);
}

async function resolveDlCode(enrollmentType, transaction) {
  const mapped = ENROLLMENT_TYPE_MAP[enrollmentType];
  if (!mapped) { const error = new Error("Invalid enrollment type"); error.status = 400; throw error; }
  const existing = await repository.findDlCodeByCode(mapped.code, transaction);
  if (existing) return existing;
  return repository.createDlCode(mapped, transaction);
}

async function listEnrollments() { const rows = await repository.findAllEnrollments(); return rows.map((row) => attachPaymentSummary(row)); }

async function getEnrollment(id) {
  const enrollment = await repository.findEnrollmentById(id);
  if (!enrollment) { const error = new Error("Enrollment not found"); error.status = 404; throw error; }
  return attachPaymentSummary(enrollment);
}

// ✅ FIX: Ginamit natin ang "skipResourceValidation: true" para sa Public Form submissions (walang checking kaya hindi mag-crash)
async function addEnrollment(payload) {
  const transaction = await sequelize.transaction();

  try {
    const pdcType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category, payload.enrollment?.enrolling_for || payload.extras?.enrolling_for);
    const hasPdcSelection = Boolean(payload.enrollment?.pdc_category || payload.enrollment?.pdc_type || pdcType);

    if (payload.enrollment_type === "PDC" && !hasPdcSelection) { const error = new Error("PDC classification could not be inferred from ENROLLING FOR"); error.status = 400; throw error; }

    const promoPdcEnabled = Boolean(payload.promo_schedule?.pdc?.enabled);
    if (payload.enrollment_type === "PROMO" && promoPdcEnabled && !hasPdcSelection) { const error = new Error("PDC classification could not be inferred from ENROLLING FOR"); error.status = 400; throw error; }

    const student = await resolveStudent(payload.student, transaction);
    await upsertStudentProfile(student.id, payload.profile, payload.extras, payload.enrollment, transaction);
    const dlCode = await resolveDlCode(payload.enrollment_type, transaction);
    
    const additionalPromoComputation = await validateAndComputeAdditionalPromos({ enrollmentType: payload.enrollment_type, primaryPromoOfferId: payload.enrollment?.promo_offer_id, additionalPromoIds: payload.enrollment?.additional_promo_offer_ids, transaction });

    const normalizedEnrollment = normalizeEnrollmentPayload(payload.enrollment, payload.extras, student.id, dlCode.id, payload.qrCodeId ?? payload.qr_code_id ?? null);
    
    if (payload.enrollment_type === "TDC" && payload.schedule?.schedule_date) normalizedEnrollment.tdc_completion_deadline = normalizeText(payload.schedule.schedule_date);
    if (payload.enrollment_type === "PDC" && payload.schedule?.schedule_date) { normalizedEnrollment.pdc_desired_date = normalizeText(payload.schedule.schedule_date); normalizedEnrollment.pdc_desired_time_slot = normalizeText(payload.schedule.slot); }
    
    normalizedEnrollment.additional_promo_offer_ids = additionalPromoComputation.normalizedIds;
    if (!normalizedEnrollment.fee_amount) normalizedEnrollment.fee_amount = 0;
    normalizedEnrollment.additional_promos_amount = additionalPromoComputation.additionalPromosAmount;
    normalizedEnrollment.fee_amount = Number((Number(normalizedEnrollment.fee_amount || 0) + additionalPromoComputation.additionalPromosAmount).toFixed(2));

    const enrollment = await repository.createEnrollment(normalizedEnrollment, transaction);

    if (payload.enrollment_type === "PROMO") { await initializePromoLifecycle({ payload, enrollment, student, transaction }); }

    let schedule = null;
    let promoSchedule = null;

    const promoTdcPayload = payload.promo_schedule_tdc || payload.promo_schedule?.tdc;
    const promoPdcPayload = payload.promo_schedule_pdc || payload.promo_schedule?.pdc;
    const isPromoScheduleEnabled = Boolean(payload.promo_schedule?.enabled) || Boolean(promoTdcPayload?.schedule_date) || Boolean(promoPdcPayload?.schedule_date);

    if (payload.enrollment_type === "PROMO" && isPromoScheduleEnabled) {
      enrollment.Student = student; enrollment.DLCode = dlCode;
      
      let promoTdc = null;
      if (promoTdcPayload?.schedule_date) {
          promoTdc = await schedulesService.addSchedule(
            normalizeSchedulePayload(promoTdcPayload, payload, enrollment, "tdc"),
            { transaction, selectedEnrollment: enrollment, allowPendingEnrollment: true, skipResourceValidation: true }
          );
      }

      let promoPdc = null;
      let promoPdcCourseType = null;
      if (promoPdcPayload?.schedule_date) {
        promoPdcCourseType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category, payload.enrollment?.enrolling_for || payload.extras?.enrolling_for) === "experience" ? "pdc_experience" : "pdc_beginner";
        promoPdc = await schedulesService.addSchedule(
          normalizeSchedulePayload(promoPdcPayload, payload, enrollment, promoPdcCourseType),
          { transaction, selectedEnrollment: enrollment, allowPendingEnrollment: true, skipResourceValidation: true }
        );
      }

      promoSchedule = {
        tdc: promoTdc ? { item: promoTdc.item, createdItems: promoTdc.createdItems, reservedDates: promoTdc.reservedDates, slot: promoTdc.slot, courseType: promoTdc.courseType } : null,
        pdc: promoPdc ? { item: promoPdc.item, createdItems: promoPdc.createdItems, reservedDates: promoPdc.reservedDates, slot: promoPdc.slot, courseType: promoPdc.courseType } : { item: null, createdItems: [], reservedDates: [], slot: null, courseType: promoPdcCourseType || null },
      };

      const enrollmentDateUpdates = {};
      if (promoTdc?.item?.schedule_date) enrollmentDateUpdates.tdc_completion_deadline = promoTdc.item.schedule_date;
      if (promoPdc?.item?.schedule_date) enrollmentDateUpdates.pdc_eligibility_date = promoPdc.item.schedule_date;
      if (Object.keys(enrollmentDateUpdates).length > 0) await repository.updateEnrollment(enrollment, enrollmentDateUpdates, transaction);
      schedule = promoPdc || promoTdc;
    } else if (payload.schedule?.enabled || payload.schedule?.schedule_date) {
      enrollment.Student = student; enrollment.DLCode = dlCode;
      schedule = await schedulesService.addSchedule(
        normalizeSchedulePayload(payload.schedule, payload, enrollment),
        { transaction, selectedEnrollment: enrollment, allowPendingEnrollment: true, skipResourceValidation: true }
      );
    }

    await transaction.commit();
    const savedEnrollment = await repository.findEnrollmentById(enrollment.id);
    if (!schedule && !promoSchedule) return savedEnrollment;

    return {
      ...(savedEnrollment?.toJSON ? savedEnrollment.toJSON() : savedEnrollment),
      schedule: schedule ? { item: schedule.item, createdItems: schedule.createdItems, reservedDates: schedule.reservedDates, slot: schedule.slot, courseType: schedule.courseType } : null,
      promo_schedule: promoSchedule,
    };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

// ✅ FIX: Inayos na kapag nag-e-edit sa Review Modal, hindi buburahin ang schedule ng kabilang course.
async function editEnrollment(id, payload) {
  const enrollment = await repository.findEnrollmentById(id);
  if (!enrollment) { const error = new Error("Enrollment not found"); error.status = 404; throw error; }

  const { student: studentPayload, profile: profilePayload, enrollment: nestedEnrollmentPayload, promo_schedule_tdc, promo_schedule_pdc, schedule, enrollment_channel, ...topLevelEnrollmentPayload } = payload;
  const enrollmentPayload = { ...(nestedEnrollmentPayload || {}), ...topLevelEnrollmentPayload };

  if (enrollment_channel) {
    enrollmentPayload.enrollment_channel = "walk_in"; 
  }

  const sanitizeDate = (d) => (d ? String(d).split('T')[0] : null);
  if (enrollmentPayload.tdc_completion_deadline) enrollmentPayload.tdc_completion_deadline = sanitizeDate(enrollmentPayload.tdc_completion_deadline);
  if (enrollmentPayload.pdc_desired_date) enrollmentPayload.pdc_desired_date = sanitizeDate(enrollmentPayload.pdc_desired_date);
  if (enrollmentPayload.pdc_eligibility_date) enrollmentPayload.pdc_eligibility_date = sanitizeDate(enrollmentPayload.pdc_eligibility_date);

  const transaction = await sequelize.transaction();

  try {
    if (studentPayload && enrollment.student_id) {
      const student = await repository.findStudentById(enrollment.student_id, transaction);
      if (student) {
        const sUpdates = {};
        if (studentPayload.first_name) sUpdates.first_name = normalizeUpperText(studentPayload.first_name);
        if (studentPayload.last_name) sUpdates.last_name = normalizeUpperText(studentPayload.last_name);
        if (studentPayload.phone !== undefined) sUpdates.phone = normalizeText(studentPayload.phone);
        if (Object.keys(sUpdates).length > 0) await repository.updateStudent(student, sUpdates, transaction);
      }
    }

    if (profilePayload && enrollment.student_id) {
      const profile = await repository.findStudentProfileByStudentId(enrollment.student_id, transaction);
      if (profile) {
        const profileUpdates = {};
        const updateFields = ['gmail_account', 'house_number', 'street', 'barangay', 'city', 'province', 'zip_code', 'birthdate', 'birthplace', 'age', 'gender', 'civil_status', 'nationality', 'fb_link', 'region', 'educational_attainment', 'emergency_contact_person', 'emergency_contact_number', 'lto_portal_account', 'driving_school_tdc', 'year_completed_tdc', 'client_type', 'enrolling_for', 'pdc_category', 'tdc_source', 'training_method', 'is_already_driver', 'target_vehicle', 'transmission_type', 'motorcycle_type', 'promo_offer_id'];
        
        updateFields.forEach(field => {
          if (field in profilePayload) {
            let value = profilePayload[field];
            if (field === 'city' && looksLikeCode(String(value))) value = getCityLabelGlobal(profilePayload.province || profile.province || '', String(value));
            if (field === 'province' && looksLikeCode(String(value))) value = getProvinceLabelGlobal(String(value));
            if (field === 'barangay' && looksLikeCode(String(value))) value = getBarangayLabelGlobal(profilePayload.city || profile.city || '', String(value));
            if (['house_number', 'street', 'barangay', 'city', 'province', 'first_name', 'last_name', 'middle_name'].includes(field)) { profileUpdates[field] = normalizeUpperText(value); } else { profileUpdates[field] = value; }
          }
        });
        
        if (Object.keys(profileUpdates).length > 0) await repository.updateStudentProfile(profile, profileUpdates, transaction);
      }
    }

    const { Schedule } = require('../../../models');
    // ✅ ADMIN OVERRIDE OPTIONS (No Strict Booking Limits)
    const scheduleOpts = { transaction, allowPendingEnrollment: true, skipSlotConflictChecks: true, skipResourceValidation: true };

    if (schedule && (schedule.schedule_date || schedule.instructor_id)) {
      const cType = inferCourseTypeFromEnrollment(enrollment) || 'tdc';
      if (schedule.schedule_date) {
        if (cType === 'tdc') enrollmentPayload.tdc_completion_deadline = sanitizeDate(schedule.schedule_date);
        else enrollmentPayload.pdc_eligibility_date = sanitizeDate(schedule.schedule_date);
      }
      
      let allSchedules = await Schedule.findAll({ where: { enrollment_id: id }, transaction });
      let targetCourseType = cType.includes('pdc') ? 'pdc' : 'tdc';
      let targetSchedules = allSchedules.filter(s => String(s.course_type).includes(targetCourseType));

      if (targetSchedules.length > 0) {
        await Schedule.destroy({ where: { id: { [Op.in]: targetSchedules.map(s => s.id) } }, transaction });
      }

      await schedulesService.addSchedule({
        enrollment_id: id, course_type: cType,
        schedule_date: sanitizeDate(schedule.schedule_date) || null,
        instructor_id: schedule.instructor_id ? Number(schedule.instructor_id) : null,
        care_of_instructor_id: schedule.care_of_instructor_id ? Number(schedule.care_of_instructor_id) : null,
        slot: schedule.slot || 'morning'
      }, scheduleOpts);
    }

    if (promo_schedule_tdc && (promo_schedule_tdc.schedule_date || promo_schedule_tdc.instructor_id)) {
      if (promo_schedule_tdc.schedule_date) enrollmentPayload.tdc_completion_deadline = sanitizeDate(promo_schedule_tdc.schedule_date);
      
      let allSchedules = await Schedule.findAll({ where: { enrollment_id: id }, transaction });
      let tdcSchedules = allSchedules.filter(s => String(s.course_type).includes('tdc'));

      if (tdcSchedules.length > 0) {
        await Schedule.destroy({ where: { id: { [Op.in]: tdcSchedules.map(s => s.id) } }, transaction });
      }

      await schedulesService.addSchedule({
        enrollment_id: id, course_type: 'tdc',
        schedule_date: sanitizeDate(promo_schedule_tdc.schedule_date) || null,
        instructor_id: promo_schedule_tdc.instructor_id ? Number(promo_schedule_tdc.instructor_id) : null,
        care_of_instructor_id: promo_schedule_tdc.care_of_instructor_id ? Number(promo_schedule_tdc.care_of_instructor_id) : null,
        slot: 'morning' 
      }, scheduleOpts);
    }

    if (promo_schedule_pdc && (promo_schedule_pdc.schedule_date || promo_schedule_pdc.instructor_id)) {
      if (promo_schedule_pdc.schedule_date) enrollmentPayload.pdc_eligibility_date = sanitizeDate(promo_schedule_pdc.schedule_date);

      let allSchedules = await Schedule.findAll({ where: { enrollment_id: id }, transaction });
      let pdcSchedules = allSchedules.filter(s => String(s.course_type).includes('pdc'));
      
      if (pdcSchedules.length > 0) {
        await Schedule.destroy({ where: { id: { [Op.in]: pdcSchedules.map(s => s.id) } }, transaction });
      }
      
      const category = profilePayload?.pdc_category || enrollmentPayload.pdc_category || enrollment.pdc_category || 'Beginner';
      const exactPdcType = String(category).toLowerCase() === 'experience' ? 'pdc_experience' : 'pdc_beginner';

      await schedulesService.addSchedule({
        enrollment_id: id, course_type: exactPdcType,
        schedule_date: sanitizeDate(promo_schedule_pdc.schedule_date) || null,
        instructor_id: promo_schedule_pdc.instructor_id ? Number(promo_schedule_pdc.instructor_id) : null,
        care_of_instructor_id: promo_schedule_pdc.care_of_instructor_id ? Number(promo_schedule_pdc.care_of_instructor_id) : null,
        slot: promo_schedule_pdc.slot || 'morning' 
      }, scheduleOpts);
    }

    const isRejected = String(enrollmentPayload.status || "").toLowerCase() === "rejected";
    if (isRejected) {
      const { Schedule } = require("../../../models");
      const rejectedSchedules = await Schedule.findAll({ where: { enrollment_id: id }, attributes: ["id"], transaction });
      if (rejectedSchedules.length > 0) await Schedule.destroy({ where: { id: { [Op.in]: rejectedSchedules.map((item) => item.id) } }, transaction });
      enrollmentPayload.schedule_id = null; enrollmentPayload.tdc_completion_deadline = null; enrollmentPayload.pdc_eligibility_date = null; enrollmentPayload.pdc_desired_date = null; enrollmentPayload.pdc_desired_time_slot = null;
    }

    const hasAdditionalPromoIds = Object.prototype.hasOwnProperty.call(enrollmentPayload, "additional_promo_offer_ids");
    const hasAdditionalPromoAmount = Object.prototype.hasOwnProperty.call(enrollmentPayload, "additional_promos_amount");

    if (hasAdditionalPromoIds || hasAdditionalPromoAmount) {
      let normalizedIds = Array.isArray(enrollment.additional_promo_offer_ids) ? enrollment.additional_promo_offer_ids : [];
      let nextAdditionalAmount = toCurrencyNumber(hasAdditionalPromoAmount ? enrollmentPayload.additional_promos_amount : enrollment.additional_promos_amount);

      if (hasAdditionalPromoIds) {
        const additionalPromoComputation = await validateAndComputeAdditionalPromos({
          enrollmentType: enrollmentTypeFromDlCodeCode(enrollment?.DLCode?.code),
          primaryPromoOfferId: enrollmentPayload.promo_offer_id ?? enrollment.promo_offer_id,
          additionalPromoIds: enrollmentPayload.additional_promo_offer_ids, transaction,
        });
        normalizedIds = additionalPromoComputation.normalizedIds; nextAdditionalAmount = additionalPromoComputation.additionalPromosAmount;
      }

      const currentFeeAmount = toCurrencyNumber(Object.prototype.hasOwnProperty.call(enrollmentPayload, "fee_amount") ? enrollmentPayload.fee_amount : enrollment.fee_amount);
      const previousAdditionalAmount = toCurrencyNumber(enrollment.additional_promos_amount);
      const baseFeeAmount = Math.max(currentFeeAmount - previousAdditionalAmount, 0);

      enrollmentPayload.additional_promo_offer_ids = normalizedIds;
      enrollmentPayload.additional_promos_amount = nextAdditionalAmount;
      enrollmentPayload.fee_amount = Number((baseFeeAmount + nextAdditionalAmount).toFixed(2));
    }

    if (enrollmentPayload.fee_amount && enrollmentPayload.status === 'confirmed') {
      const feeAmount = toCurrencyNumber(enrollmentPayload.fee_amount);
      const discountAmount = toCurrencyNumber(enrollmentPayload.discount_amount ?? enrollment.discount_amount ?? 0);
      const totalDue = Math.max(feeAmount - discountAmount, 0);

      const Payment = require('../../../models').Payment;
      const existingPayments = await Payment.findAll({ where: { enrollment_id: id }, transaction });
      const totalPaidBefore = existingPayments.reduce((sum, p) => sum + toCurrencyNumber(p.amount), 0);
      
      const newAmountToPay = Math.max(totalDue - totalPaidBefore, 0);
      if (newAmountToPay > 0) {
        await Payment.create({
          enrollment_id: id, amount: newAmountToPay, payment_method: normalizeText(enrollmentPayload.payment_method) || 'cash',
          payment_status: 'paid', reference_number: enrollmentPayload.payment_reference_number || null, account_number: null,
        }, { transaction });
      }

      const totalPaidAfter = totalPaidBefore + newAmountToPay;
      const newBalance = Math.max(totalDue - totalPaidAfter, 0);
      enrollmentPayload.balance = newBalance;
      if (enrollmentPayload.payment_terms) enrollmentPayload.payment_status = newBalance <= 0 ? 'paid' : 'partial';
    }

    const updated = await repository.updateEnrollment(enrollment, enrollmentPayload, transaction);
    await transaction.commit();
    return updated;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function removeEnrollment(id) { const enrollment = await getEnrollment(id); await repository.deleteEnrollment(enrollment); }
function countCompletedSessions(attendanceRows, moduleType) { return attendanceRows.filter((item) => String(item.module_type || "").toLowerCase() === moduleType && ["present", "rescheduled"].includes(String(item.attendance_status || "").toLowerCase())).length; }
function isDatePassed(dateOnly) { if (!dateOnly) return false; const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const target = new Date(`${dateOnly}T00:00:00`); return target < today; }

async function recomputeEnrollmentLifecycleState(enrollmentId, options = {}) {
  const transaction = options.transaction;
  const enrollment = await repository.findEnrollmentById(enrollmentId);
  if (!enrollment) { const error = new Error("Enrollment not found"); error.status = 404; throw error; }

  const attendanceRows = await repository.findSessionAttendanceByEnrollmentId(enrollment.id, transaction);
  const tdcCompletedSessions = countCompletedSessions(attendanceRows, "tdc");
  const pdcCompletedSessions = countCompletedSessions(attendanceRows, "pdc");
  const hasAnyTdcAttendance = tdcCompletedSessions > 0;
  const hasAnyPdcAttendance = pdcCompletedSessions > 0;

  let enrollmentState = "active";
  const updates = {};

  const promoPackage = enrollment.promoPackage || null;
  if (promoPackage) {
    const entitlements = Array.isArray(promoPackage.entitlements) && promoPackage.entitlements.length ? promoPackage.entitlements : await repository.findPromoEntitlementsByPackageId(promoPackage.id, transaction);
    const tdcEntitlement = entitlements.find((item) => String(item.module_type || "").toLowerCase() === "tdc");
    const pdcEntitlement = entitlements.find((item) => String(item.module_type || "").toLowerCase() === "pdc");

    if (tdcEntitlement) {
      const required = Number(tdcEntitlement.required_sessions || 0); const done = tdcCompletedSessions;
      const tdcStatus = done <= 0 ? "not_started" : done >= required ? "completed" : "in_progress";
      await repository.updatePromoEntitlement(tdcEntitlement, { completed_sessions: done, status: tdcStatus, started_at: done > 0 ? (tdcEntitlement.started_at || new Date()) : null, completed_at: tdcStatus === "completed" ? (tdcEntitlement.completed_at || new Date()) : null }, transaction);
    }

    if (pdcEntitlement) {
      const required = Number(pdcEntitlement.required_sessions || 0); const done = pdcCompletedSessions;
      const pdcStatus = done <= 0 ? "not_started" : done >= required ? "completed" : "in_progress";
      await repository.updatePromoEntitlement(pdcEntitlement, { completed_sessions: done, status: pdcStatus, started_at: done > 0 ? (pdcEntitlement.started_at || new Date()) : null, completed_at: pdcStatus === "completed" ? (pdcEntitlement.completed_at || new Date()) : null }, transaction);
    }

    const tdcRequired = Number(tdcEntitlement?.required_sessions || 2); const pdcRequired = Number(pdcEntitlement?.required_sessions || 1);
    const tdcCompleted = tdcCompletedSessions >= tdcRequired; const pdcCompleted = pdcCompletedSessions >= pdcRequired;
    const expired = isDatePassed(enrollment.pdc_valid_until || promoPackage.pdc_valid_until);

    if (tdcCompleted && !enrollment.pdc_eligibility_date) updates.pdc_eligibility_date = toDateOnly(new Date());
    if (expired && !pdcCompleted) { enrollmentState = "expired"; await repository.updatePromoPackage(promoPackage, { status: "expired" }, transaction); }
    else if (tdcCompleted && pdcCompleted) { enrollmentState = "completed"; await repository.updatePromoPackage(promoPackage, { status: "completed" }, transaction); }
    else if (tdcCompleted) { enrollmentState = hasAnyPdcAttendance ? "pdc_in_progress" : "pdc_pending_schedule"; }
    else if (hasAnyTdcAttendance) { enrollmentState = "tdc_in_progress"; }
    else { enrollmentState = "active"; }
  } else {
    if (hasAnyPdcAttendance) enrollmentState = "pdc_in_progress";
    else if (hasAnyTdcAttendance) enrollmentState = "tdc_in_progress";
    else enrollmentState = "active";
  }

  updates.enrollment_state = enrollmentState;
  await repository.updateEnrollment(enrollment, updates, transaction);
  return repository.findEnrollmentById(enrollment.id);
}

module.exports = {
  listEnrollments, getEnrollment, addEnrollment, editEnrollment, removeEnrollment, recomputeEnrollmentLifecycleState,
};