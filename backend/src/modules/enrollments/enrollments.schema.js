const Joi = require("joi");

const optionalText = Joi.string().trim().allow("", null);
const optionalNumber = Joi.number().integer().allow(null);
const targetVehicleSchema = optionalText;
const transmissionSchema = optionalText;
const educationalAttainmentSchema = Joi.string().valid(
  "High School",
  "College",
  "Elementary",
  "Post Graduate",
  "Vocational",
  "Informal Schooling",
  "Other"
).allow("", null);
const tdcTrainingMethodSchema = optionalText;
const pdcTrainingMethodSchema = optionalText;
const scheduleSlotSchema = Joi.string().valid("morning", "afternoon");
const financialAmountSchema = Joi.number().precision(2).min(0).allow(null);
const additionalPromoIdsSchema = Joi.array().items(Joi.number().integer().positive()).max(20).allow(null);

const schedulePayloadSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  schedule_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null),
  slot: scheduleSlotSchema.allow("", null),
  instructor_id: Joi.number().integer().positive().allow(null),
  care_of_instructor_id: Joi.number().integer().positive().allow(null),
  vehicle_id: Joi.number().integer().positive().allow(null),
});

const enrollmentCreateSchema = Joi.object({
  enrollment_type: Joi.string().valid("TDC", "PDC", "PROMO").required(),
  qrCodeId: Joi.number().integer().positive().allow(null),
  student: Joi.object({
    id: Joi.number().integer(),
    first_name: Joi.string().trim().required(),
    middle_name: optionalText,
    last_name: Joi.string().trim().required(),
    email: Joi.string().trim().email({ tlds: { allow: false } }).allow("", null),
    phone: optionalText,
  }).required(),
  profile: Joi.object({
    birthdate: Joi.date().iso().allow(null, ""),
    birthplace: optionalText,
    age: optionalNumber,
    gender: optionalText,
    civil_status: optionalText,
    nationality: optionalText,
    fb_link: optionalText,
    gmail_account: optionalText,
    house_number: optionalText,
    street: optionalText,
    barangay: optionalText,
    city: optionalText,
    province: optionalText,
    zip_code: optionalText,
  }).default({}),
  extras: Joi.object({
    region: optionalText,
    enrolling_for: optionalText,
    score: optionalText,
    educational_attainment: educationalAttainmentSchema,
    emergency_contact_person: optionalText,
    emergency_contact_number: optionalText,
    lto_portal_account: optionalText,
    driving_school_tdc: optionalText,
    year_completed_tdc: optionalText,
    tdc_training_method: tdcTrainingMethodSchema,
    pdc_training_method: pdcTrainingMethodSchema,
  }).default({}),
  enrollment: Joi.object({
    schedule_id: Joi.number().integer().allow(null),
    package_id: Joi.number().integer().allow(null),
    promo_offer_id: Joi.number().integer().allow(null),
    additional_promo_offer_ids: additionalPromoIdsSchema,
    additional_promos_amount: financialAmountSchema,
    client_type: optionalText,
    fee_amount: financialAmountSchema,
    discount_amount: financialAmountSchema,
    payment_terms: optionalText,
    payment_reference_number: optionalText,
    payment_notes: optionalText,
    tdc_source: Joi.string().valid("guts", "external").allow("", null),
    enrollment_channel: Joi.string().valid("walk_in", "saferoads", "otdc", "odep", "partner", "qr_public").allow("", null),
    external_application_ref: optionalText,
    is_already_driver: Joi.boolean().allow(null),
    target_vehicle: targetVehicleSchema,
    transmission_type: transmissionSchema,
    motorcycle_type: transmissionSchema,
    training_method: optionalText,
    pdc_start_mode: Joi.string().valid("now", "later").allow("", null),
    pdc_type: Joi.string().valid("beginner", "experience").allow(null, ""),
    pdc_category: Joi.string().valid("Beginner", "Experience", "beginner", "experience").allow(null, ""),
    enrolling_for: optionalText,
    score: optionalText,
    status: Joi.string().valid("pending", "confirmed", "completed").default("pending"),
  }).default({}),
  schedule: schedulePayloadSchema.default({ enabled: false }),
  promo_schedule: Joi.object({
    enabled: Joi.boolean().default(false),
    tdc: schedulePayloadSchema.default({ enabled: false }),
    pdc: schedulePayloadSchema.default({ enabled: false }),
  }).allow(null),
}).custom((value, helpers) => {
  const normalize = (input) => String(input || "").trim().toLowerCase();
  const isMotorcycleTarget = (input) => {
    const normalized = normalize(input);
    return (
      normalized === "motorcycle" ||
      normalized === "motor" ||
      normalized.includes("motorcycle") ||
      normalized.includes("tricycle") ||
      normalized.includes("dl codes a")
    );
  };

  const hasPdcSelection = Boolean(value.enrollment?.pdc_category || value.enrollment?.pdc_type);
  const pdcCategoryNormalized = normalize(value.enrollment?.pdc_category || value.enrollment?.pdc_type);
  const isExperienceCategory = pdcCategoryNormalized === "experience";
  const scheduleEnabled = Boolean(value.schedule?.enabled);
  const feeAmount = value.enrollment?.fee_amount;
  const discountAmount = value.enrollment?.discount_amount;

  if (value.enrollment_type === "PDC" && !hasPdcSelection) {
    return helpers.error("any.custom", {
      message: "pdc_category is required for PDC enrollments",
    });
  }

  if (feeAmount !== null && discountAmount !== null && Number(discountAmount) > Number(feeAmount)) {
    return helpers.error("any.custom", {
      message: "discount_amount cannot be greater than fee_amount",
    });
  }

  if (discountAmount !== null && feeAmount === null) {
    return helpers.error("any.custom", {
      message: "fee_amount is required when discount_amount is provided",
    });
  }

  const requiresExperienceDrivingDetails =
    (value.enrollment_type === "PDC" || value.enrollment_type === "PROMO") && isExperienceCategory;

  if (requiresExperienceDrivingDetails && value.enrollment?.is_already_driver !== true) {
    return helpers.error("any.custom", {
      message: "is_already_driver must be true for Experience enrollments",
    });
  }

  if (requiresExperienceDrivingDetails && !value.enrollment?.target_vehicle) {
    return helpers.error("any.custom", {
      message: "target_vehicle is required for Experience enrollments",
    });
  }

  if (requiresExperienceDrivingDetails && !value.enrollment?.transmission_type) {
    return helpers.error("any.custom", {
      message: "transmission_type is required for Experience enrollments",
    });
  }

  if (
    requiresExperienceDrivingDetails &&
    isMotorcycleTarget(value.enrollment?.target_vehicle) &&
    !value.enrollment?.motorcycle_type
  ) {
    return helpers.error("any.custom", {
      message: "motorcycle_type is required when Motorcycle is selected",
    });
  }

  const promoPdcEnabled = Boolean(value.promo_schedule?.pdc?.enabled);

  if (value.enrollment_type === "PROMO" && promoPdcEnabled && !hasPdcSelection) {
    return helpers.error("any.custom", {
      message: "pdc_category is required for PROMO enrollments",
    });
  }

  const promoScheduleEnabled = Boolean(value.promo_schedule?.enabled);
  if (value.enrollment_type === "PROMO" && promoScheduleEnabled) {
    const promoTdc = value.promo_schedule?.tdc || {};
    const promoPdc = value.promo_schedule?.pdc || {};
    const promoPdcEnabled = Boolean(promoPdc.enabled);
    const isPublicQr = value.enrollment?.enrollment_channel === "qr_public";

    if (!promoTdc.schedule_date) {
      return helpers.error("any.custom", {
        message: "promo_schedule.tdc requires schedule_date",
      });
    }

    if (!isPublicQr) {
      if (!promoTdc.slot || !promoTdc.instructor_id) {
        return helpers.error("any.custom", {
          message: "promo_schedule.tdc requires slot and instructor_id",
        });
      }

      if (promoPdcEnabled && (!promoPdc.schedule_date || !promoPdc.slot || !promoPdc.instructor_id || !promoPdc.vehicle_id)) {
        return helpers.error("any.custom", {
          message: "promo_schedule.pdc requires schedule_date, slot, instructor_id, and vehicle_id",
        });
      }
    } else if (promoPdcEnabled && !promoPdc.schedule_date) {
      return helpers.error("any.custom", {
        message: "promo_schedule.pdc requires schedule_date when Schedule Now is selected",
      });
    }
  }

  if (scheduleEnabled) {
    if (!value.schedule?.schedule_date) {
      return helpers.error("any.custom", {
        message: "schedule.schedule_date is required when scheduling during enrollment",
      });
    }

    if (!value.schedule?.slot) {
      return helpers.error("any.custom", {
        message: "schedule.slot is required when scheduling during enrollment",
      });
    }

    if (!value.schedule?.instructor_id) {
      return helpers.error("any.custom", {
        message: "schedule.instructor_id is required when scheduling during enrollment",
      });
    }

    const requiresVehicle = value.enrollment_type !== "TDC";
    if (requiresVehicle && !value.schedule?.vehicle_id) {
      return helpers.error("any.custom", {
        message: "schedule.vehicle_id is required for PDC scheduling during enrollment",
      });
    }
  }

  return value;
}, "PDC type requirement");

const enrollmentUpdateSchema = Joi.object({
  schedule_id: Joi.number().integer(),
  package_id: Joi.number().integer(),
  promo_offer_id: Joi.number().integer().allow(null),
  additional_promo_offer_ids: additionalPromoIdsSchema,
  additional_promos_amount: financialAmountSchema,
  dl_code_id: Joi.number().integer(),
  client_type: optionalText,
  enrollment_channel: Joi.string().valid("walk_in", "saferoads", "otdc", "odep", "partner").allow("", null),
  external_application_ref: optionalText,
  promo_package_id: Joi.number().integer().allow(null),
  tdc_completion_deadline: Joi.date().iso().allow(null, ""),
  pdc_eligibility_date: Joi.date().iso().allow(null, ""),
  pdc_valid_until: Joi.date().iso().allow(null, ""),
  pdc_start_mode: Joi.string().valid("now", "later").allow("", null),
  fee_amount: financialAmountSchema,
  discount_amount: financialAmountSchema,
  payment_terms: optionalText,
  payment_reference_number: optionalText,
  payment_notes: optionalText,
  tdc_source: Joi.string().valid("guts", "external").allow("", null),
  enrollment_state: Joi.string()
    .valid(
      "draft",
      "active",
      "tdc_in_progress",
      "tdc_completed",
      "pdc_pending_schedule",
      "pdc_in_progress",
      "completed",
      "expired",
      "cancelled"
    )
    .allow("", null),
  is_already_driver: Joi.boolean(),
  target_vehicle: targetVehicleSchema,
  transmission_type: transmissionSchema,
  motorcycle_type: transmissionSchema,
  training_method: optionalText,
  pdc_type: Joi.string().valid("beginner", "experience").allow(null, ""),
  pdc_category: Joi.string().valid("Beginner", "Experience").allow(null, ""),
  enrolling_for: optionalText,
  score: optionalText,
  status: Joi.string().valid("pending", "confirmed", "completed", "rejected"),
  // QR enrollment modal fields for updating promo schedules and student info
  promo_schedule_tdc: Joi.object({
    schedule_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null),
    instructor_id: Joi.number().integer().positive().allow(null),
    care_of_instructor_id: Joi.number().integer().positive().allow(null),
  }).allow(null),
  promo_schedule_pdc: Joi.object({
    enabled: Joi.boolean().allow(null),
    schedule_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null),
    instructor_id: Joi.number().integer().positive().allow(null),
    care_of_instructor_id: Joi.number().integer().positive().allow(null),
  }).allow(null),
  student: Joi.object({
    first_name: Joi.string().trim(),
    last_name: Joi.string().trim(),
    phone: optionalText,
  }).allow(null),
  profile: Joi.object({
    gmail_account: optionalText,
    house_number: optionalText,
    street: optionalText,
    barangay: optionalText,
    city: optionalText,
    province: optionalText,
    zip_code: optionalText,
    birthdate: Joi.date().iso().allow(null, ""),
    birthplace: optionalText,
    age: optionalNumber,
    gender: optionalText,
    civil_status: optionalText,
    nationality: optionalText,
    fb_link: optionalText,
    region: optionalText,
    educational_attainment: educationalAttainmentSchema,
    emergency_contact_person: optionalText,
    emergency_contact_number: optionalText,
    lto_portal_account: optionalText,
    driving_school_tdc: optionalText,
    year_completed_tdc: optionalText,
    client_type: optionalText,
    enrolling_for: optionalText,
    pdc_category: optionalText,
    tdc_source: optionalText,
    training_method: optionalText,
    is_already_driver: Joi.boolean().allow(null),
    target_vehicle: optionalText,
    transmission_type: optionalText,
    motorcycle_type: optionalText,
    promo_offer_id: Joi.number().integer().allow(null),
  }).allow(null),
}).min(1);

module.exports = {
  enrollmentCreateSchema,
  enrollmentUpdateSchema,
};
