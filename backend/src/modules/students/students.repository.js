const { Student, StudentProfile, Enrollment, DLCode, PromoOffer, Payment, Schedule, sequelize } = require("../../../models");

async function findStudentBySourceIdentity(sourceChannel, externalStudentRef, transaction) {
  if (!sourceChannel || !externalStudentRef) {
    return null;
  }

  return Student.findOne({
    where: {
      source_channel: sourceChannel,
      external_student_ref: externalStudentRef,
    },
    transaction,
  });
}

async function findStudentsForImportDeduplication(transaction) {
  const profileAttributes = await getSafeStudentProfileAttributes();

  return Student.findAll({
    attributes: ["id", "first_name", "middle_name", "last_name", "email", "phone", "source_channel", "external_source", "external_student_ref", "createdAt", "updatedAt"],
    include: [
      {
        model: StudentProfile,
        attributes: profileAttributes,
        required: false,
      },
    ],
    order: [["id", "ASC"]],
    transaction,
  });
}

let cachedStudentProfileAttributes = null;

async function getSafeStudentProfileAttributes() {
  if (cachedStudentProfileAttributes) {
    return cachedStudentProfileAttributes;
  }

  const fallback = [
    "id",
    "student_id",
    "birthdate",
    "age",
    "gender",
    "civil_status",
    "nationality",
    "fb_link",
    "gmail_account",
    "house_number",
    "street",
    "barangay",
    "city",
    "province",
    "zip_code",
    "region",
    "educational_attainment",
    "emergency_contact_person",
    "emergency_contact_number",
    "lto_portal_account",
    "student_permit_number",
    "student_permit_date",
    "student_permit_status",
    "medical_certificate_provider",
    "medical_certificate_date",
    // Enrollment-specific fields
    "client_type",
    "promo_offer_id",
    "enrolling_for",
    "pdc_category",
    "tdc_source",
    "training_method",
    "is_already_driver",
    "target_vehicle",
    "transmission_type",
    "motorcycle_type",
  ];

  try {
    const definition = await sequelize.getQueryInterface().describeTable("student_profiles");
    const existing = Object.keys(definition || {});
    const modelColumns = Object.keys(StudentProfile.rawAttributes || {});
    cachedStudentProfileAttributes = modelColumns.filter((column) => existing.includes(column));
    if (!cachedStudentProfileAttributes.length) {
      cachedStudentProfileAttributes = fallback;
    }
  } catch {
    cachedStudentProfileAttributes = fallback;
  }

  return cachedStudentProfileAttributes;
}

const latestEnrollmentInclude = {
  model: Enrollment,
  separate: true,
  limit: 1,
  order: [["created_at", "DESC"], ["id", "DESC"]],
  include: [
    {
      model: DLCode,
      attributes: ["id", "code", "description"],
    },
    {
      model: PromoOffer,
      as: "promoOffer",
      attributes: ["id", "name", "fixed_price", "discounted_price"],
      required: false,
    },
        {
          model: Payment,
          as: "payments",
          attributes: ["id", "amount", "payment_method", "payment_status", "reference_number", "account_number", "created_at"],
          required: false,
          separate: true,
          order: [["created_at", "ASC"], ["id", "ASC"]],
        },
    {
      model: Schedule,
      attributes: ["id", "remarks", "student_remarks", "instructor_remarks"],
      required: false,
    },
    {
      model: Schedule,
      as: "scheduledSessions",
      attributes: ["id", "remarks", "student_remarks", "instructor_remarks", "schedule_date"],
      separate: true,
      limit: 1,
      order: [["schedule_date", "DESC"], ["id", "DESC"]],
      required: false,
    },
  ],
};

const fullEnrollmentInclude = {
  model: Enrollment,
  separate: true,
  order: [["created_at", "DESC"], ["id", "DESC"]],
  include: [
    {
      model: DLCode,
      attributes: ["id", "code", "description"],
    },
    {
      model: PromoOffer,
      as: "promoOffer",
      attributes: ["id", "name", "fixed_price", "discounted_price"],
      required: false,
    },
    {
      model: Payment,
      as: "payments",
      attributes: ["id", "amount", "payment_method", "payment_status", "reference_number", "account_number", "created_at"],
      required: false,
    },
    {
      model: Schedule,
      attributes: ["id", "remarks", "student_remarks", "instructor_remarks"],
      required: false,
    },
    {
      model: Schedule,
      as: "scheduledSessions",
      attributes: ["id", "remarks", "student_remarks", "instructor_remarks", "schedule_date"],
      separate: true,
      limit: 1,
      order: [["schedule_date", "DESC"], ["id", "DESC"]],
      required: false,
    },
  ],
};

async function findAllStudents(options = {}) {
  const { startDate, endDate, includeExternal = false, source } = options || {};
  // Query params may arrive as strings ("true"/"false"). Normalize to boolean.
  const includeExternalFlag = includeExternal === true || String(includeExternal).toLowerCase() === "true";
  const profileAttributes = await getSafeStudentProfileAttributes();
  const normalizedSource = source ? String(source).trim().toLowerCase() : null;

  const students = await Student.findAll({
    include: [
      {
        model: StudentProfile,
        attributes: profileAttributes,
      },
      latestEnrollmentInclude,
    ],
    order: [["id", "DESC"]],
  });

  return students.filter((student) => {
    const enrollments = student.Enrollments || [];
    const latestEnrollment = Array.isArray(enrollments) && enrollments.length ? enrollments[0] : null;
    const enrollmentSource = latestEnrollment && (latestEnrollment.tdc_source || latestEnrollment.enrollment_channel || latestEnrollment.external_application_ref);

    const sourceChannel = String(
      student.source_channel || student.external_source || (student.StudentProfile && student.StudentProfile.tdc_source) || enrollmentSource || ""
    ).toLowerCase();
    const isImportedExternal = includeExternalFlag && sourceChannel && sourceChannel !== "walk_in";

    if (normalizedSource && sourceChannel !== normalizedSource) {
      return false;
    }

    const studentCreatedAt = student.createdAt || student.created_at || null;
    const hasMatchingEnrollment = enrollments.length > 0;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const inRange = hasMatchingEnrollment
        ? enrollments.some((enrollment) => {
            const created = enrollment.created_at || enrollment.createdAt || null;
            if (!created) return false;
            const createdDate = new Date(created);
            if (Number.isNaN(createdDate.getTime())) return false;
            if (start && createdDate < start) return false;
            if (end && createdDate > end) return false;
            return true;
          })
        : (() => {
            if (!studentCreatedAt) return false;
            const createdDate = new Date(studentCreatedAt);
            if (Number.isNaN(createdDate.getTime())) return false;
            if (start && createdDate < start) return false;
            if (end && createdDate > end) return false;
            return true;
          })();

      if (!inRange) return false;
    }

    if (isImportedExternal) {
      return true;
    }

    // If includeExternal is explicitly false, exclude external/imported students
    if (!includeExternalFlag && sourceChannel && sourceChannel !== "walk_in") {
      return false;
    }

    if (enrollments.length === 0) {
      return false;
    }

    const hasPaidEnrollment = enrollments.some(
      (enrollment) => enrollment.status === "confirmed" || enrollment.status === "completed"
    );

    return hasPaidEnrollment;
  });
}

async function findStudentById(id) {
  const profileAttributes = await getSafeStudentProfileAttributes();

  return Student.findByPk(id, {
    include: [
      {
        model: StudentProfile,
        attributes: profileAttributes,
      },
      fullEnrollmentInclude,
    ],
  });
}

async function createStudent(payload, transaction) {
  return Student.create(payload, transaction ? { transaction } : undefined);
}

async function findStudentProfileByStudentId(studentId, transaction) {
  return StudentProfile.findOne({
    where: { student_id: studentId },
    transaction,
  });
}

async function updateStudent(student, payload, transaction) {
  return student.update(payload, { transaction });
}

async function createStudentProfile(payload, transaction) {
  return StudentProfile.create(payload, { transaction });
}

async function updateStudentProfile(profile, payload, transaction) {
  return profile.update(payload, { transaction });
}

async function findEnrollmentsByStudentId(studentId, transaction) {
  return Enrollment.findAll({
    where: { student_id: studentId },
    attributes: ["id", "schedule_id"],
    transaction,
    order: [["id", "DESC"]],
  });
}

async function findTdcEnrollmentByStudentId(studentId, transaction) {
  return Enrollment.findOne({
    where: { student_id: studentId },
    include: [
      {
        model: DLCode,
        attributes: ["id", "code"],
        required: true,
      },
    ],
    transaction,
    order: [["id", "DESC"]],
  });
}

async function detachEnrollmentsFromStudent(studentId, transaction) {
  return Enrollment.update(
    { student_id: null },
    {
      where: { student_id: studentId },
      transaction,
    }
  );
}

async function deleteStudentProfile(profile, transaction) {
  return profile.destroy({ transaction });
}

async function deleteStudent(student, transaction) {
  return student.destroy({ transaction });
}

async function updateEnrollmentStatus(studentId, payload, transaction) {
  const enrollmentStatus = payload?.enrollmentStatus;
  const score = payload?.score;

  const enrollment = await Enrollment.findOne({
    where: { student_id: studentId },
    order: [["id", "DESC"]],
    transaction,
  });

  if (!enrollment) {
    const error = new Error("No enrollment found for this student");
    error.status = 404;
    throw error;
  }

  if (enrollmentStatus || score !== undefined) {
    const nextPayload = {};
    if (enrollmentStatus) {
      if (enrollmentStatus === "cancelled") {
        nextPayload.enrollment_state = "cancelled";
      } else {
        nextPayload.status = enrollmentStatus;
        nextPayload.enrollment_state = enrollmentStatus === "completed" ? "completed" : "active";
      }
    }
    if (score !== undefined) {
      nextPayload.score = score || null;
    }

    await enrollment.update(nextPayload, { transaction });
  }

  return enrollment;
}

module.exports = {
  findAllStudents,
  findStudentById,
  findStudentBySourceIdentity,
  findStudentsForImportDeduplication,
  createStudent,
  findStudentProfileByStudentId,
  updateStudent,
  createStudentProfile,
  updateStudentProfile,
  findEnrollmentsByStudentId,
  findTdcEnrollmentByStudentId,
  detachEnrollmentsFromStudent,
  deleteStudentProfile,
  deleteStudent,
  updateEnrollmentStatus,
};
