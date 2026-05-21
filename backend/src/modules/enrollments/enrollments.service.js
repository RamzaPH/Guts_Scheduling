const { sequelize } = require("../../../models");
const repository = require("./enrollments.repository");
const schedulesService = require("../schedules/schedules.service");
// Address helpers for converting PSGC codes to readable labels
const {
  getRegions,
  getProvincesByRegion,
  getCitiesAndMunsByProvince,
  getBarangaysByCityOrMun,
} = require("latest-ph-address-thanks-to-anehan");

function looksLikeCode(v) {
  return typeof v === "string" && /^\d+$/.test(v.trim());
}

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
      if (Array.isArray(cities)) {
        const match = cities.find((item) => item.psgc === cityCode);
        if (match) return match.name;
      }
    } catch (e) {
      // eslint-disable-next-line no-empty
    }
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
      } catch (e) {
        // eslint-disable-next-line no-empty
      }
    }
  }
  return cityCode;
}

function getBarangayLabelGlobal(cityCode, barangayCode) {
  if (!barangayCode) return barangayCode || "";
  if (cityCode) {
    try {
      const barangays = getBarangaysByCityOrMun(cityCode);
      if (Array.isArray(barangays)) {
        const match = barangays.find((item) => item.psgc === barangayCode);
        if (match) return match.name;
      }
    } catch (e) {
      // eslint-disable-next-line no-empty
    }
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
          } catch (e) {
            // eslint-disable-next-line no-empty
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-empty
      }
    }
  }
  return barangayCode;
}

const ENROLLMENT_TYPE_MAP = {
  TDC: {
    code: "TDC",
    description: "Theoretical Driving Course",
  },
  PDC: {
    code: "PDC",
    description: "Practical Driving Course",
  },
  PROMO: {
    code: "TDC + PDC PROMO",
    description: "Combined TDC and PDC promo enrollment",
  },
};

function normalizeText(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUpperText(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toCurrencyNumber(value) {
  const numeric = normalizeAmount(value);
  return numeric === null ? 0 : numeric;
}

function resolvePromoPrice(offer) {
  const discounted = normalizeAmount(offer?.discounted_price);
  if (discounted !== null && discounted > 0) {
    return discounted;
  }

  const fixed = normalizeAmount(offer?.fixed_price);
  if (fixed !== null && fixed > 0) {
    return fixed;
  }

  return 0;
}

async function validateAndComputeAdditionalPromos({ primaryPromoOfferId, additionalPromoIds, transaction }) {
  const ids = Array.isArray(additionalPromoIds)
    ? [...new Set(additionalPromoIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))]
    : [];

  if (ids.length === 0) {
    return {
      normalizedIds: [],
      additionalPromosAmount: 0,
    };
  }

  const primaryId = Number(primaryPromoOfferId);
  if (Number.isInteger(primaryId) && primaryId > 0 && ids.includes(primaryId)) {
    const error = new Error("additional promo list must not include the selected primary promo");
    error.status = 400;
    throw error;
  }

  const { PromoOffer } = require("../../../models");
  const offers = await PromoOffer.findAll({
    where: { id: ids, status: "active" },
    transaction,
  });

  if (offers.length !== ids.length) {
    const foundIds = new Set(offers.map((item) => Number(item.id)));
    const missing = ids.filter((id) => !foundIds.has(id));
    const error = new Error(`Invalid or inactive additional promos: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const additionalPromosAmount = offers.reduce((sum, offer) => sum + resolvePromoPrice(offer), 0);

  return {
    normalizedIds: ids,
    additionalPromosAmount: Number(additionalPromosAmount.toFixed(2)),
  };
}

function attachPaymentSummary(enrollment) {
  if (!enrollment) {
    return enrollment;
  }

  const plain = enrollment.toJSON ? enrollment.toJSON() : enrollment;
  const payments = Array.isArray(plain.payments) ? plain.payments : [];
  const discountAmount = toCurrencyNumber(plain.discount_amount);
  const grossFee = toCurrencyNumber(plain.fee_amount);
  let totalDue = Math.max(grossFee - discountAmount, 0);
  let totalPaid = payments.reduce((sum, payment) => sum + toCurrencyNumber(payment.amount), 0);
  let remainingBalance = Math.max(totalDue - totalPaid, 0);

  return {
    ...plain,
    payment_summary: {
      total_due: Number(totalDue.toFixed(2)),
      total_paid: Number(totalPaid.toFixed(2)),
      remaining_balance: Number(remainingBalance.toFixed(2)),
      is_paid: remainingBalance <= 0,
    },
  };
}

function normalizePdcType(rawType, rawCategory) {
  const normalizedType = normalizeText(rawType);
  if (normalizedType) {
    return normalizedType.toLowerCase();
  }

  const normalizedCategory = normalizeText(rawCategory);
  if (!normalizedCategory) {
    return null;
  }

  return normalizedCategory.toLowerCase() === "experience" ? "experience" : "beginner";
}

function enrollmentTypeFromDlCodeCode(dlCodeRaw) {
  const code = String(dlCodeRaw || "").toUpperCase();
  if (code.includes("PROMO")) return "PROMO";
  if (code === "PDC") return "PDC";
  return "TDC";
}

function normalizeStudentPayload(student = {}) {
  return {
    // Store names in uppercase for encoder/staff consistency
    first_name: normalizeUpperText(student.first_name),
    middle_name: normalizeUpperText(student.middle_name),
    last_name: normalizeUpperText(student.last_name),
    email: normalizeText(student.email),
    phone: normalizeText(student.phone),
  };
}

function normalizeProfilePayload(studentId, profile = {}, extras = {}, enrollment = {}) {
  return {
    student_id: studentId,
    // Personal Information
    birthdate: normalizeText(profile.birthdate),
    birthplace: normalizeText(profile.birthplace),
    age: profile.age ?? null,
    gender: normalizeText(profile.gender),
    civil_status: normalizeText(profile.civil_status),
    nationality: normalizeText(profile.nationality),
    fb_link: normalizeText(profile.fb_link),
    gmail_account: normalizeText(profile.gmail_account),
    // Address Information
    // Store address parts uppercase for consistency
    house_number: normalizeUpperText(profile.house_number),
    street: normalizeUpperText(profile.street),
    // Some QR submissions save PSGC numeric codes in barangay/city/province — convert to readable labels when possible
    barangay: normalizeUpperText(profile.barangay),
    city: normalizeUpperText(profile.city),
    province: normalizeUpperText(profile.province),
    zip_code: normalizeText(profile.zip_code),
    region: normalizeText(extras.region),
    // Emergency and Education
    educational_attainment: normalizeText(extras.educational_attainment),
    emergency_contact_person: normalizeText(extras.emergency_contact_person),
    emergency_contact_number: normalizeText(extras.emergency_contact_number),
    // LTO and Training
    lto_portal_account: normalizeText(extras.lto_portal_account),
    driving_school_tdc: normalizeText(extras.driving_school_tdc),
    year_completed_tdc: normalizeText(extras.year_completed_tdc),
    // Enrollment-specific fields (persist to StudentProfile)
    client_type: normalizeText(profile.client_type || enrollment.client_type || extras.client_type),
    promo_offer_id: profile.promo_offer_id ? Number(profile.promo_offer_id) : (enrollment.promo_offer_id ? Number(enrollment.promo_offer_id) : (extras.promo_offer_id ? Number(extras.promo_offer_id) : null)),
    enrolling_for: normalizeText(profile.enrolling_for || enrollment.enrolling_for || extras.enrolling_for),
    pdc_category: normalizeText(profile.pdc_category || enrollment.pdc_category || extras.pdc_category),
    tdc_source: normalizeText(profile.tdc_source || enrollment.tdc_source || extras.tdc_source),
    training_method: normalizeText(profile.training_method || enrollment.training_method || extras.training_method),
    is_already_driver: Boolean(profile.is_already_driver ?? enrollment.is_already_driver ?? extras.is_already_driver),
    target_vehicle: normalizeText(profile.target_vehicle || enrollment.target_vehicle || extras.target_vehicle),
    transmission_type: normalizeText(profile.transmission_type || enrollment.transmission_type || extras.transmission_type),
    motorcycle_type: normalizeText(profile.motorcycle_type || enrollment.motorcycle_type || extras.motorcycle_type),
  };
}

function normalizeEnrollmentPayload(enrollment = {}, extras = {}, studentId, dlCodeId, qrCodeId = null) {
  const normalizedPdcType = normalizePdcType(enrollment.pdc_type, enrollment.pdc_category);
  const channel = normalizeText(enrollment.enrollment_channel) || "walk_in";
  const startMode = normalizeText(enrollment.pdc_start_mode) || "later";
  const tdcSource = normalizeText(enrollment.tdc_source);

  return {
    student_id: studentId,
    schedule_id: enrollment.schedule_id ?? null,
    package_id: enrollment.package_id ?? null,
    promo_offer_id: enrollment.promo_offer_id ?? null,
    dl_code_id: dlCodeId,
    qrCodeId,
    client_type: normalizeText(enrollment.client_type),
    is_already_driver: Boolean(enrollment.is_already_driver),
    target_vehicle: normalizeText(enrollment.target_vehicle),
    transmission_type: normalizeText(enrollment.transmission_type),
    motorcycle_type: normalizeText(enrollment.motorcycle_type),
    training_method: normalizeText(enrollment.training_method),
    pdc_type: normalizedPdcType,
    fee_amount: normalizeAmount(enrollment.fee_amount),
    discount_amount: normalizeAmount(enrollment.discount_amount),
    payment_terms: normalizeText(enrollment.payment_terms),
    payment_reference_number: normalizeText(enrollment.payment_reference_number),
    payment_notes: normalizeText(enrollment.payment_notes),
    tdc_source: normalizedPdcType ? (tdcSource || "guts") : null,
    enrolling_for: normalizeText(extras.enrolling_for),
    score: normalizeText(extras.score),
    enrollment_channel: channel,
    external_application_ref: normalizeText(enrollment.external_application_ref),
    pdc_start_mode: startMode,
    // allow multiple additional promo offer ids (from public enroll modal)
    additional_promo_offer_ids: Array.isArray(enrollment.additional_promo_offer_ids)
      ? enrollment.additional_promo_offer_ids.map((v) => (v === null || v === undefined ? null : Number(v)))
      : null,
    enrollment_state: "active",
    status: enrollment.status || "pending",
    created_at: enrollment.created_at || new Date(),
  };
}

function addDays(dateInput, days) {
  const base = new Date(dateInput || Date.now());
  base.setDate(base.getDate() + days);
  return base;
}

function toDateOnly(dateInput) {
  const date = new Date(dateInput || Date.now());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function initializePromoLifecycle({ payload, enrollment, student, transaction }) {
  const now = new Date();
  const pdcType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category) === "experience"
    ? "experience"
    : "beginner";

  const tdcDeadline = toDateOnly(addDays(now, 30));
  const pdcValidUntil = toDateOnly(addDays(now, 365));
  const schedulePdcNow = Boolean(payload.promo_schedule?.pdc?.enabled);
  const pdcStartMode = schedulePdcNow ? "now" : "later";

  const promoPackage = await repository.createPromoPackage(
    {
      student_id: student.id,
      enrollment_id: enrollment.id,
      status: "active",
      purchase_date: toDateOnly(now),
      tdc_deadline: tdcDeadline,
      pdc_valid_until: pdcValidUntil,
      allow_extension: false,
      extension_count: 0,
      notes: null,
    },
    transaction
  );

  await repository.createPromoEntitlement(
    {
      promo_package_id: promoPackage.id,
      module_type: "tdc",
      status: "not_started",
      required_sessions: 2,
      completed_sessions: 0,
      started_at: null,
      completed_at: null,
      expires_at: null,
    },
    transaction
  );

  await repository.createPromoEntitlement(
    {
      promo_package_id: promoPackage.id,
      module_type: "pdc",
      status: "not_started",
      required_sessions: pdcType === "experience" ? 1 : 2,
      completed_sessions: 0,
      started_at: null,
      completed_at: null,
      expires_at: pdcValidUntil,
    },
    transaction
  );

  await repository.updateEnrollment(
    enrollment,
    {
      promo_package_id: promoPackage.id,
      tdc_completion_deadline: tdcDeadline,
      pdc_eligibility_date: null,
      pdc_valid_until: pdcValidUntil,
      pdc_start_mode: pdcStartMode,
      enrollment_state: pdcStartMode === "later" ? "pdc_pending_schedule" : "active",
    },
    transaction
  );
}

function toPositiveIntegerOrNull(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function scheduleCourseTypeFromEnrollmentPayload(payload) {
  if (payload.enrollment_type === "TDC") {
    return "tdc";
  }

  const pdcType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category);
  return pdcType === "experience" ? "pdc_experience" : "pdc_beginner";
}

function normalizeSchedulePayload(schedule = {}, payload = {}, enrollment = null, forcedCourseType = null) {
  const courseType = forcedCourseType || scheduleCourseTypeFromEnrollmentPayload(payload);
  const fallbackSchedule = payload?.schedule || {};

  const instructorId = toPositiveIntegerOrNull(schedule.instructor_id)
    || toPositiveIntegerOrNull(fallbackSchedule.instructor_id);
  const careOfInstructorId = toPositiveIntegerOrNull(schedule.care_of_instructor_id)
    || toPositiveIntegerOrNull(fallbackSchedule.care_of_instructor_id);
  const vehicleId = courseType === "tdc"
    ? null
    : toPositiveIntegerOrNull(schedule.vehicle_id)
      || toPositiveIntegerOrNull(fallbackSchedule.vehicle_id);
  const scheduleDate = normalizeText(schedule.schedule_date) || normalizeText(fallbackSchedule.schedule_date);
  const slot = normalizeText(schedule.slot) || normalizeText(fallbackSchedule.slot);

  return {
    enrollment_id: enrollment?.id || null,
    course_type: courseType,
    instructor_id: instructorId,
    care_of_instructor_id: careOfInstructorId,
    vehicle_id: vehicleId,
    schedule_date: scheduleDate,
    slot,
    remarks: null,
  };
}

async function resolveStudent(studentPayload, transaction) {
  if (studentPayload.id) {
    const existingStudent = await repository.findStudentById(studentPayload.id, transaction);
    if (!existingStudent) {
      const error = new Error("Student not found");
      error.status = 404;
      throw error;
    }

    return repository.updateStudent(existingStudent, normalizeStudentPayload(studentPayload), transaction);
  }

  const normalizedStudent = normalizeStudentPayload(studentPayload);
  const matchedByEmail = await repository.findStudentByEmail(normalizedStudent.email, transaction);
  if (matchedByEmail) {
    return repository.updateStudent(matchedByEmail, normalizedStudent, transaction);
  }

  return repository.createStudent(normalizedStudent, transaction);
}

async function upsertStudentProfile(studentId, profilePayload, extrasPayload, enrollmentPayload, transaction) {
  const normalizedProfile = normalizeProfilePayload(studentId, profilePayload, extrasPayload, enrollmentPayload);
  const existingProfile = await repository.findStudentProfileByStudentId(studentId, transaction);

  // Helper: detect numeric PSGC-like codes
  function looksLikeCode(v) {
    return typeof v === "string" && /^\d+$/.test(v.trim());
  }

  // Convert PSGC codes to readable labels when possible using latest-ph-address-thanks-to-anehan
  function getProvinceLabel(regionCode, provinceCode) {
    if (!provinceCode) return provinceCode || "";
    // Try direct lookup by iterating regions if regionCode not provided or lookup fails
    const regions = getRegions();
    for (const r of regions) {
      const provinces = getProvincesByRegion(r.psgc);
      if (!Array.isArray(provinces)) continue;
      const match = provinces.find((item) => item.psgc === provinceCode);
      if (match) return match.name;
    }
    return provinceCode;
  }

  function getCityLabel(regionCode, provinceCode, cityCode) {
    if (!cityCode) return cityCode || "";
    // Try province-scoped lookup first if provinceCode provided
    if (provinceCode) {
      try {
        const cities = getCitiesAndMunsByProvince(provinceCode);
        if (Array.isArray(cities)) {
          const match = cities.find((item) => item.psgc === cityCode);
          if (match) return match.name;
        }
      } catch (e) {
        // eslint-disable-next-line no-empty
      }
    }

    // Fallback: iterate all regions/provinces to find the city code
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
        } catch (e) {
          // eslint-disable-next-line no-empty
        }
      }
    }

    return cityCode;
  }

  function getBarangayLabel(cityCode, barangayCode) {
    if (!barangayCode) return barangayCode || "";
    // If cityCode provided, try direct lookup
    if (cityCode) {
      try {
        const barangays = getBarangaysByCityOrMun(cityCode);
        if (Array.isArray(barangays)) {
          const match = barangays.find((item) => item.psgc === barangayCode);
          if (match) return match.name;
        }
      } catch (e) {
        // eslint-disable-next-line no-empty
      }
    }

    // Fallback: search across all cities
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
            } catch (e) {
              // eslint-disable-next-line no-empty
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-empty
        }
      }
    }

    return barangayCode;
  }

  const converted = { ...normalizedProfile };
  try {
    if (looksLikeCode(normalizedProfile.city)) {
      converted.city = getCityLabel(normalizedProfile.region, normalizedProfile.province, normalizedProfile.city) || normalizedProfile.city;
    }
    if (looksLikeCode(normalizedProfile.province)) {
      converted.province = getProvinceLabel(normalizedProfile.region, normalizedProfile.province) || normalizedProfile.province;
    }
    if (looksLikeCode(normalizedProfile.barangay)) {
      converted.barangay = getBarangayLabel(normalizedProfile.city || converted.city, normalizedProfile.barangay) || normalizedProfile.barangay;
    }
  } catch (e) {
    // If conversion fails, fall back to original values
  }

  if (existingProfile) {
    return repository.updateStudentProfile(existingProfile, converted, transaction);
  }

  return repository.createStudentProfile(converted, transaction);
}

async function resolveDlCode(enrollmentType, transaction) {
  const mapped = ENROLLMENT_TYPE_MAP[enrollmentType];
  if (!mapped) {
    const error = new Error("Invalid enrollment type");
    error.status = 400;
    throw error;
  }

  const existing = await repository.findDlCodeByCode(mapped.code, transaction);
  if (existing) {
    return existing;
  }

  return repository.createDlCode(mapped, transaction);
}

async function listEnrollments() {
  const rows = await repository.findAllEnrollments();
  return rows.map((row) => attachPaymentSummary(row));
}

async function getEnrollment(id) {
  const enrollment = await repository.findEnrollmentById(id);
  if (!enrollment) {
    const error = new Error("Enrollment not found");
    error.status = 404;
    throw error;
  }
  return attachPaymentSummary(enrollment);
}

async function addEnrollment(payload) {
  const transaction = await sequelize.transaction();

  try {
    const hasPdcSelection = Boolean(payload.enrollment?.pdc_category || payload.enrollment?.pdc_type);
    const isPublicQrEnrollment = payload.enrollment?.enrollment_channel === "qr_public";

    if (payload.enrollment_type === "PDC" && !hasPdcSelection) {
      const error = new Error("pdc_category is required for PDC enrollments");
      error.status = 400;
      throw error;
    }

    const promoPdcEnabled = Boolean(payload.promo_schedule?.pdc?.enabled);
    if (payload.enrollment_type === "PROMO" && promoPdcEnabled && !hasPdcSelection) {
      const error = new Error("pdc_category is required for PROMO enrollments");
      error.status = 400;
      throw error;
    }

    const student = await resolveStudent(payload.student, transaction);
    await upsertStudentProfile(student.id, payload.profile, payload.extras, payload.enrollment, transaction);
    const dlCode = await resolveDlCode(payload.enrollment_type, transaction);
      const additionalPromoComputation = await validateAndComputeAdditionalPromos({
        enrollmentType: payload.enrollment_type,
        primaryPromoOfferId: payload.enrollment?.promo_offer_id,
        additionalPromoIds: payload.enrollment?.additional_promo_offer_ids,
        transaction,
      });

      // Attach computed additional promos amount into enrollment payload so it's persisted
      const normalizedEnrollment = normalizeEnrollmentPayload(payload.enrollment, payload.extras, student.id, dlCode.id, payload.qrCodeId ?? payload.qr_code_id ?? null);
      normalizedEnrollment.additional_promo_offer_ids = additionalPromoComputation.normalizedIds;
      if (!normalizedEnrollment.fee_amount) normalizedEnrollment.fee_amount = 0;
      normalizedEnrollment.additional_promos_amount = additionalPromoComputation.additionalPromosAmount;
      normalizedEnrollment.fee_amount = Number((Number(normalizedEnrollment.fee_amount || 0) + additionalPromoComputation.additionalPromosAmount).toFixed(2));

      const enrollment = await repository.createEnrollment(
        normalizedEnrollment,
        transaction
      );

    if (payload.enrollment_type === "PROMO") {
      await initializePromoLifecycle({ payload, enrollment, student, transaction });
    }

    let schedule = null;
    let promoSchedule = null;

    if (payload.enrollment_type === "PROMO" && payload.promo_schedule?.enabled) {
      enrollment.Student = student;
      enrollment.DLCode = dlCode;

      const shouldSchedulePromoPdc = Boolean(payload.promo_schedule?.pdc?.enabled);

      const promoTdc = await schedulesService.addSchedule(
        normalizeSchedulePayload(payload.promo_schedule?.tdc, payload, enrollment, "tdc"),
        {
          transaction,
          selectedEnrollment: enrollment,
          allowPendingEnrollment: true,
          allowPendingAssignment: isPublicQrEnrollment,
        }
      );

      let promoPdc = null;
      let promoPdcCourseType = null;
      if (shouldSchedulePromoPdc) {
        promoPdcCourseType = normalizePdcType(payload.enrollment?.pdc_type, payload.enrollment?.pdc_category) === "experience"
          ? "pdc_experience"
          : "pdc_beginner";

        promoPdc = await schedulesService.addSchedule(
          normalizeSchedulePayload(payload.promo_schedule?.pdc, payload, enrollment, promoPdcCourseType),
          {
            transaction,
            selectedEnrollment: enrollment,
            allowPendingEnrollment: true,
            allowPendingAssignment: isPublicQrEnrollment,
          }
        );
      }

      promoSchedule = {
        tdc: {
          item: promoTdc.item,
          createdItems: promoTdc.createdItems,
          reservedDates: promoTdc.reservedDates,
          slot: promoTdc.slot,
          courseType: promoTdc.courseType,
        },
        pdc: promoPdc
          ? {
              item: promoPdc.item,
              createdItems: promoPdc.createdItems,
              reservedDates: promoPdc.reservedDates,
              slot: promoPdc.slot,
              courseType: promoPdc.courseType,
            }
          : {
              item: null,
              createdItems: [],
              reservedDates: [],
              slot: null,
              courseType: promoPdcCourseType || null,
            },
      };

      // Persist promo schedule dates onto the enrollment so the admin UI can show the
      // desired date immediately without having to join schedules in the pending list.
      const enrollmentDateUpdates = {};
      if (promoTdc && promoTdc.item && promoTdc.item.schedule_date) {
        enrollmentDateUpdates.tdc_completion_deadline = promoTdc.item.schedule_date;
      }
      if (promoPdc && promoPdc.item && promoPdc.item.schedule_date) {
        enrollmentDateUpdates.pdc_eligibility_date = promoPdc.item.schedule_date;
      }

      if (Object.keys(enrollmentDateUpdates).length > 0) {
        await repository.updateEnrollment(enrollment, enrollmentDateUpdates, transaction);
      }

      schedule = promoPdc || promoTdc;
    } else if (payload.schedule?.enabled) {
      enrollment.Student = student;
      enrollment.DLCode = dlCode;

      schedule = await schedulesService.addSchedule(
        normalizeSchedulePayload(payload.schedule, payload, enrollment),
        {
          transaction,
          selectedEnrollment: enrollment,
          allowPendingEnrollment: true,
        }
      );
    }

    await transaction.commit();
    const savedEnrollment = await repository.findEnrollmentById(enrollment.id);
    if (!schedule && !promoSchedule) {
      return savedEnrollment;
    }

    return {
      ...(savedEnrollment?.toJSON ? savedEnrollment.toJSON() : savedEnrollment),
      schedule: schedule
        ? {
            item: schedule.item,
            createdItems: schedule.createdItems,
            reservedDates: schedule.reservedDates,
            slot: schedule.slot,
            courseType: schedule.courseType,
          }
        : null,
      promo_schedule: promoSchedule,
    };
  } catch (error) {
    try {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
    } catch (rbErr) {
      // ignore rollback errors when transaction already finished
    }
    throw error;
  }
}

async function editEnrollment(id, payload) {
  const enrollment = await repository.findEnrollmentById(id);
  if (!enrollment) {
    const error = new Error("Enrollment not found");
    error.status = 404;
    throw error;
  }

  // Extract nested fields that require separate model updates
  const {
    student: studentPayload,
    profile: profilePayload,
    enrollment: nestedEnrollmentPayload,
    promo_schedule_tdc,
    promo_schedule_pdc,
    ...topLevelEnrollmentPayload
  } = payload;

  // Accept both legacy flat payload and nested enrollment payload from QR edit modal.
  const enrollmentPayload = {
    ...(nestedEnrollmentPayload && typeof nestedEnrollmentPayload === "object" ? nestedEnrollmentPayload : {}),
    ...topLevelEnrollmentPayload,
  };

  const transaction = await sequelize.transaction();

  try {
    // Update student if provided
    if (studentPayload && enrollment.student_id) {
      const student = await repository.findStudentById(enrollment.student_id);
      if (student && (studentPayload.first_name || studentPayload.last_name || studentPayload.phone)) {
        const studentUpdates = {};
        if (studentPayload.first_name) studentUpdates.first_name = studentPayload.first_name;
        if (studentPayload.last_name) studentUpdates.last_name = studentPayload.last_name;
        if (studentPayload.phone !== undefined) studentUpdates.phone = studentPayload.phone;
        
        if (Object.keys(studentUpdates).length > 0) {
          await repository.updateStudent(student, studentUpdates);
        }
      }
    }

    // Update student profile if provided
    if (profilePayload && enrollment.student_id) {
      const profile = await repository.findStudentProfileByStudentId(enrollment.student_id);
      if (profile) {
        const profileUpdates = {};
        
        // Update all provided profile fields
        const updateFields = [
          'gmail_account', 'house_number', 'street', 'barangay', 'city', 'province',
          'zip_code', 'birthdate', 'birthplace', 'age', 'gender', 'civil_status',
          'nationality', 'fb_link', 'region', 'educational_attainment',
          'emergency_contact_person', 'emergency_contact_number', 'lto_portal_account',
          'driving_school_tdc', 'year_completed_tdc', 'client_type', 'enrolling_for',
          'pdc_category', 'tdc_source', 'training_method', 'is_already_driver',
          'target_vehicle', 'transmission_type', 'motorcycle_type', 'promo_offer_id'
        ];
        
        updateFields.forEach(field => {
          if (field in profilePayload) {
            let value = profilePayload[field];

            // Convert numeric PSGC codes to labels for certain address fields
            if (field === 'city' && looksLikeCode(String(value))) {
              value = getCityLabelGlobal(profilePayload.province || profile.province || '', String(value));
            }
            if (field === 'province' && looksLikeCode(String(value))) {
              value = getProvinceLabelGlobal(String(value));
            }
            if (field === 'barangay' && looksLikeCode(String(value))) {
              // use provided city code if available, else fallback to profile.city
              const cityCode = profilePayload.city || profile.city || '';
              value = getBarangayLabelGlobal(cityCode, String(value));
            }

            // Apply uppercase normalization for address fields and names
            if (['house_number', 'street', 'barangay', 'city', 'province', 'first_name', 'last_name', 'middle_name'].includes(field)) {
              profileUpdates[field] = normalizeUpperText(value);
            } else {
              profileUpdates[field] = value;
            }
          }
        });
        
        if (Object.keys(profileUpdates).length > 0) {
          await repository.updateStudentProfile(profile, profileUpdates);
        }
      }
    }

    // Handle TDC schedule (create or update)
    if (promo_schedule_tdc) {
      if (promo_schedule_tdc.schedule_date) {
        enrollmentPayload.tdc_completion_deadline = promo_schedule_tdc.schedule_date;
      }

      // Find or create Schedule record for TDC with course_type indicator
      const Schedule = require('../../../models').Schedule;
      let tdcSchedules = await Schedule.findAll({
        where: { enrollment_id: id },
        limit: 10,
        transaction,
      });

      // Try to find an existing TDC schedule (assuming first schedule is TDC if no distinct marking exists)
      // If multiple, take the first one
      let tdcSchedule = tdcSchedules.length > 0 ? tdcSchedules[0] : null;

      // Require Instructor model for validation checks
      const Instructor = require('../../../models').Instructor;

      if (tdcSchedule) {
          // Normalize possible instructor object payloads and coerce to integer
          const normalizedTdcInstructorId = promo_schedule_tdc.instructor_id || (promo_schedule_tdc.instructor && promo_schedule_tdc.instructor.id) || null;
          const normalizedTdcCareOfInstructorId = promo_schedule_tdc.care_of_instructor_id || (promo_schedule_tdc.care_of_instructor && promo_schedule_tdc.care_of_instructor.id) || null;
          const tdcInstructorId = normalizedTdcInstructorId ? Number(normalizedTdcInstructorId) : null;
          const tdcCareOfInstructorId = normalizedTdcCareOfInstructorId ? Number(normalizedTdcCareOfInstructorId) : null;
          if (tdcInstructorId) {
            const inst = await Instructor.findByPk(tdcInstructorId, { transaction });
          if (!inst) {
            const error = new Error('Instructor not found');
            error.status = 400;
            throw error;
          }
        }
          if (tdcCareOfInstructorId) {
            const careInst = await Instructor.findByPk(tdcCareOfInstructorId, { transaction });
          if (!careInst) {
            const error = new Error('Care-of instructor not found');
            error.status = 400;
            throw error;
          }
        }

        // Update existing schedule
        await tdcSchedule.update({
          schedule_date: promo_schedule_tdc.schedule_date || tdcSchedule.schedule_date,
          instructor_id: tdcInstructorId || null,
          care_of_instructor_id: tdcCareOfInstructorId || null,
        }, { transaction });
      } else if (promo_schedule_tdc.schedule_date || promo_schedule_tdc.instructor_id || promo_schedule_tdc.care_of_instructor_id) {
        // Normalize and validate instructor ids before create
        const normalizedCreateTdcInstructorId = promo_schedule_tdc.instructor_id || (promo_schedule_tdc.instructor && promo_schedule_tdc.instructor.id) || null;
        const normalizedCreateTdcCareOfInstructorId = promo_schedule_tdc.care_of_instructor_id || (promo_schedule_tdc.care_of_instructor && promo_schedule_tdc.care_of_instructor.id) || null;
        const createTdcInstructorId = normalizedCreateTdcInstructorId ? Number(normalizedCreateTdcInstructorId) : null;
        const createTdcCareOfInstructorId = normalizedCreateTdcCareOfInstructorId ? Number(normalizedCreateTdcCareOfInstructorId) : null;
        if (createTdcInstructorId) {
          const inst = await Instructor.findByPk(createTdcInstructorId, { transaction });
          if (!inst) {
            const error = new Error('Instructor not found');
            error.status = 400;
            throw error;
          }
        }
        if (createTdcCareOfInstructorId) {
          const careInst = await Instructor.findByPk(createTdcCareOfInstructorId, { transaction });
          if (!careInst) {
            const error = new Error('Care-of instructor not found');
            error.status = 400;
            throw error;
          }
        }
        // Create new schedule only if there's at least one value to save
        await Schedule.create({
          enrollment_id: id,
          student_id: enrollment.student_id,
          schedule_date: promo_schedule_tdc.schedule_date || null,
          instructor_id: createTdcInstructorId || null,
          care_of_instructor_id: createTdcCareOfInstructorId || null,
          course_id: null,
          vehicle_id: null,
        }, { transaction });
      }
    }

    // Handle PDC schedule (create or update)
    if (promo_schedule_pdc) {
      if (promo_schedule_pdc.schedule_date) {
        enrollmentPayload.pdc_eligibility_date = promo_schedule_pdc.schedule_date;
      }

      // Find or create Schedule record for PDC
      // For now, if there are multiple schedules, use the second one for PDC, or create a new one
      const Schedule = require('../../../models').Schedule;
      let allSchedules = await Schedule.findAll({
        where: { enrollment_id: id },
        limit: 10,
        transaction,
      });

      // Try to find a PDC schedule (if there are 2+, take the second; otherwise create new)
      let pdcSchedule = allSchedules.length > 1 ? allSchedules[1] : null;

      if (pdcSchedule) {
        // Validate instructor ids if provided
        const Instructor = require('../../../models').Instructor;
        if (promo_schedule_pdc.instructor_id) {
          const inst = await Instructor.findByPk(promo_schedule_pdc.instructor_id, { transaction });
          if (!inst) {
            const error = new Error('Instructor not found');
            error.status = 400;
            throw error;
          }
        }
        if (promo_schedule_pdc.care_of_instructor_id) {
          const careInst = await Instructor.findByPk(promo_schedule_pdc.care_of_instructor_id, { transaction });
          if (!careInst) {
            const error = new Error('Care-of instructor not found');
            error.status = 400;
            throw error;
          }
        }

        // Update existing schedule
        await pdcSchedule.update({
          schedule_date: promo_schedule_pdc.schedule_date || pdcSchedule.schedule_date,
          instructor_id: promo_schedule_pdc.instructor_id || null,
          care_of_instructor_id: promo_schedule_pdc.care_of_instructor_id || null,
        }, { transaction });
      } else if (promo_schedule_pdc.schedule_date || promo_schedule_pdc.instructor_id || promo_schedule_pdc.care_of_instructor_id) {
        // Validate instructor ids before create
        const Instructor = require('../../../models').Instructor;
        if (promo_schedule_pdc.instructor_id) {
          const inst = await Instructor.findByPk(promo_schedule_pdc.instructor_id, { transaction });
          if (!inst) {
            const error = new Error('Instructor not found');
            error.status = 400;
            throw error;
          }
        }
        if (promo_schedule_pdc.care_of_instructor_id) {
          const careInst = await Instructor.findByPk(promo_schedule_pdc.care_of_instructor_id, { transaction });
          if (!careInst) {
            const error = new Error('Care-of instructor not found');
            error.status = 400;
            throw error;
          }
        }
        // Create new schedule only if there's at least one value to save
        await Schedule.create({
          enrollment_id: id,
          student_id: enrollment.student_id,
          schedule_date: promo_schedule_pdc.schedule_date || null,
          instructor_id: promo_schedule_pdc.instructor_id || null,
          care_of_instructor_id: promo_schedule_pdc.care_of_instructor_id || null,
          course_id: null,
          vehicle_id: null,
        }, { transaction });
      }
    }

    const hasAdditionalPromoIds = Object.prototype.hasOwnProperty.call(enrollmentPayload, "additional_promo_offer_ids");
    const hasAdditionalPromoAmount = Object.prototype.hasOwnProperty.call(enrollmentPayload, "additional_promos_amount");

    if (hasAdditionalPromoIds || hasAdditionalPromoAmount) {
      let normalizedIds = Array.isArray(enrollment.additional_promo_offer_ids) ? enrollment.additional_promo_offer_ids : [];
      let nextAdditionalAmount = toCurrencyNumber(
        hasAdditionalPromoAmount ? enrollmentPayload.additional_promos_amount : enrollment.additional_promos_amount
      );

      if (hasAdditionalPromoIds) {
        const additionalPromoComputation = await validateAndComputeAdditionalPromos({
          enrollmentType: enrollmentTypeFromDlCodeCode(enrollment?.DLCode?.code),
          primaryPromoOfferId: enrollmentPayload.promo_offer_id ?? enrollment.promo_offer_id,
          additionalPromoIds: enrollmentPayload.additional_promo_offer_ids,
          transaction,
        });

        normalizedIds = additionalPromoComputation.normalizedIds;
        nextAdditionalAmount = additionalPromoComputation.additionalPromosAmount;
      }

      const currentFeeAmount = toCurrencyNumber(
        Object.prototype.hasOwnProperty.call(enrollmentPayload, "fee_amount")
          ? enrollmentPayload.fee_amount
          : enrollment.fee_amount
      );
      const previousAdditionalAmount = toCurrencyNumber(enrollment.additional_promos_amount);
      const baseFeeAmount = Math.max(currentFeeAmount - previousAdditionalAmount, 0);

      enrollmentPayload.additional_promo_offer_ids = normalizedIds;
      enrollmentPayload.additional_promos_amount = nextAdditionalAmount;
      enrollmentPayload.fee_amount = Number((baseFeeAmount + nextAdditionalAmount).toFixed(2));
    }

    // If payment data is being submitted with fee_amount, create Payment record and calculate balance
    if (enrollmentPayload.fee_amount && enrollmentPayload.status === 'confirmed') {
      const feeAmount = toCurrencyNumber(enrollmentPayload.fee_amount);
      const discountAmount = toCurrencyNumber(enrollmentPayload.discount_amount ?? enrollment.discount_amount ?? 0);
      const totalDue = Math.max(feeAmount - discountAmount, 0);

      // Fetch existing payments for this enrollment to calculate totals
      const Payment = require('../../../models').Payment;
      const existingPayments = await Payment.findAll({ where: { enrollment_id: id }, transaction });
      const totalPaidBefore = existingPayments.reduce((sum, p) => sum + toCurrencyNumber(p.amount), 0);
      
      // Calculate amount to record in this payment
      // Use the new fee_amount as basis, minus what's already paid
      const newAmountToPay = Math.max(totalDue - totalPaidBefore, 0);
      
      if (newAmountToPay > 0) {
        // Create a Payment record to track this payment in Payment Ledger
        await Payment.create({
          enrollment_id: id,
          amount: newAmountToPay,
          payment_method: normalizeText(enrollmentPayload.payment_method) || 'cash',
          payment_status: 'paid',
          reference_number: enrollmentPayload.payment_reference_number || null,
          account_number: null,
        }, { transaction });
      }

      // Calculate new balance: total due minus all payments
      const totalPaidAfter = totalPaidBefore + newAmountToPay;
      const newBalance = Math.max(totalDue - totalPaidAfter, 0);
      enrollmentPayload.balance = newBalance;
      
      // Update payment status on enrollment
      if (enrollmentPayload.payment_terms) {
        enrollmentPayload.payment_status = newBalance <= 0 ? 'paid' : 'partial';
      }
    }

    // Update enrollment with mapped fields
    const updated = await repository.updateEnrollment(enrollment, enrollmentPayload, transaction);
    await transaction.commit();
    return updated;
  } catch (error) {
    try {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
    } catch (rbErr) {
      // ignore rollback errors when transaction already finished
    }
    throw error;
  }
}

async function removeEnrollment(id) {
  const enrollment = await getEnrollment(id);
  await repository.deleteEnrollment(enrollment);
}

function isDatePassed(dateOnly) {
  if (!dateOnly) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${dateOnly}T00:00:00`);
  return target < today;
}

function countCompletedSessions(attendanceRows, moduleType) {
  return attendanceRows.filter(
    (item) => String(item.module_type || "").toLowerCase() === moduleType
      && ["present", "rescheduled"].includes(String(item.attendance_status || "").toLowerCase())
  ).length;
}

async function recomputeEnrollmentLifecycleState(enrollmentId, options = {}) {
  const transaction = options.transaction;
  const enrollment = await repository.findEnrollmentById(enrollmentId);

  if (!enrollment) {
    const error = new Error("Enrollment not found");
    error.status = 404;
    throw error;
  }

  const attendanceRows = await repository.findSessionAttendanceByEnrollmentId(enrollment.id, transaction);
  const tdcCompletedSessions = countCompletedSessions(attendanceRows, "tdc");
  const pdcCompletedSessions = countCompletedSessions(attendanceRows, "pdc");
  const hasAnyTdcAttendance = tdcCompletedSessions > 0;
  const hasAnyPdcAttendance = pdcCompletedSessions > 0;

  let enrollmentState = "active";
  const updates = {};

  const promoPackage = enrollment.promoPackage || null;
  if (promoPackage) {
    const entitlements = Array.isArray(promoPackage.entitlements) && promoPackage.entitlements.length
      ? promoPackage.entitlements
      : await repository.findPromoEntitlementsByPackageId(promoPackage.id, transaction);

    const tdcEntitlement = entitlements.find((item) => String(item.module_type || "").toLowerCase() === "tdc");
    const pdcEntitlement = entitlements.find((item) => String(item.module_type || "").toLowerCase() === "pdc");

    if (tdcEntitlement) {
      const required = Number(tdcEntitlement.required_sessions || 0);
      const done = tdcCompletedSessions;
      const tdcStatus = done <= 0 ? "not_started" : done >= required ? "completed" : "in_progress";
      await repository.updatePromoEntitlement(
        tdcEntitlement,
        {
          completed_sessions: done,
          status: tdcStatus,
          started_at: done > 0 ? (tdcEntitlement.started_at || new Date()) : null,
          completed_at: tdcStatus === "completed" ? (tdcEntitlement.completed_at || new Date()) : null,
        },
        transaction
      );
    }

    if (pdcEntitlement) {
      const required = Number(pdcEntitlement.required_sessions || 0);
      const done = pdcCompletedSessions;
      const pdcStatus = done <= 0 ? "not_started" : done >= required ? "completed" : "in_progress";
      await repository.updatePromoEntitlement(
        pdcEntitlement,
        {
          completed_sessions: done,
          status: pdcStatus,
          started_at: done > 0 ? (pdcEntitlement.started_at || new Date()) : null,
          completed_at: pdcStatus === "completed" ? (pdcEntitlement.completed_at || new Date()) : null,
        },
        transaction
      );
    }

    const tdcRequired = Number(tdcEntitlement?.required_sessions || 2);
    const pdcRequired = Number(pdcEntitlement?.required_sessions || 1);
    const tdcCompleted = tdcCompletedSessions >= tdcRequired;
    const pdcCompleted = pdcCompletedSessions >= pdcRequired;
    const expired = isDatePassed(enrollment.pdc_valid_until || promoPackage.pdc_valid_until);

    if (tdcCompleted && !enrollment.pdc_eligibility_date) {
      updates.pdc_eligibility_date = toDateOnly(new Date());
    }

    if (expired && !pdcCompleted) {
      enrollmentState = "expired";
      await repository.updatePromoPackage(promoPackage, { status: "expired" }, transaction);
    } else if (tdcCompleted && pdcCompleted) {
      enrollmentState = "completed";
      await repository.updatePromoPackage(promoPackage, { status: "completed" }, transaction);
    } else if (tdcCompleted) {
      enrollmentState = hasAnyPdcAttendance ? "pdc_in_progress" : "pdc_pending_schedule";
    } else if (hasAnyTdcAttendance) {
      enrollmentState = "tdc_in_progress";
    } else {
      enrollmentState = "active";
    }
  } else {
    if (hasAnyPdcAttendance) {
      enrollmentState = "pdc_in_progress";
    } else if (hasAnyTdcAttendance) {
      enrollmentState = "tdc_in_progress";
    } else {
      enrollmentState = "active";
    }
  }

  updates.enrollment_state = enrollmentState;
  await repository.updateEnrollment(enrollment, updates, transaction);

  return repository.findEnrollmentById(enrollment.id);
}

module.exports = {
  listEnrollments,
  getEnrollment,
  addEnrollment,
  editEnrollment,
  removeEnrollment,
  recomputeEnrollmentLifecycleState,
};
