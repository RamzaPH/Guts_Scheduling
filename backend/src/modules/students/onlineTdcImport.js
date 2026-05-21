const crypto = require("crypto");
const path = require("path");
const XLSX = require("xlsx");

const ONLINE_TDC_SOURCES = new Set(["saferoads", "otdc", "odep", "saferoads_odep"]);

function isSaferoadsLike(source) {
  return source === "saferoads" || source === "odep" || source === "saferoads_odep";
}

/**
 * ONLINE TDC IMPORT SCHEMA HANDLING
 * 
 * SafeRoads.ph Schema:
 * - Rich data export with 50+ fields including: firstName, lastName, middleName, email, mobile,
 *   driverLicense, ltoClientId, gender, birthDate, courseCode, courseName, quizScore/Result,
 *   examScore/Result, certified status, paymentStatus, etc.
 * - Business flow: Students scanned at QR code, payment over-the-counter at GUTS
 * - Imported students have completed TDC with SafeRoads
 * 
 * OTDC.ph Schema (Minimal):
 * - Simple export with only 6 fields: Email, Name, Payment Mode, Registration Date,
 *   Completed Date & Time, Driving School
 * - Business flow: Uses third-party payment (Dragonpay)
 * - Imported students are marked with payment mode and completion date
 * 
 * SPECIAL CASE HANDLING:
 * - SafeRoads: Full name breakdown (firstName/lastName/middleName)
 * - OTDC: Single "Name" field split into firstName/lastName if needed
 * - Both: Stored with source tracking (external_source, external_student_ref) to prevent duplicates
 * - Import now creates a completed TDC enrollment with a fixed 999 PHP fee and a paid Payment row
 *   so the existing payment summary UI shows completed payment / zero balance
 */

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function buildLookup(row = {}) {
  return Object.entries(row).reduce((lookup, [key, value]) => {
    lookup[normalizeKey(key)] = value;
    return lookup;
  }, {});
}

function pickValue(lookup, aliases = []) {
  for (const alias of aliases) {
    const value = lookup[normalizeKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeFingerprintValue(value) {
  if (value === undefined || value === null) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  const text = String(value).trim().toLowerCase();
  if (!text) return "";

  const numeric = Number(text.replace(/,/g, ""));
  if (Number.isFinite(numeric) && text !== "true" && text !== "false") {
    return String(numeric);
  }

  return text.replace(/\s+/g, " ");
}

function normalizeFingerprintDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return normalizeFingerprintValue(value);
}

function buildComparableImportSnapshot(record = {}) {
  const student = record.student || record.Student || record || {};
  const profile = record.profile || record.StudentProfile || {};
  const lifecycle = record.lifecycle || record.Lifecycle || {};

  return {
    student: {
      first_name: normalizeFingerprintValue(student.first_name),
      middle_name: normalizeFingerprintValue(student.middle_name),
      last_name: normalizeFingerprintValue(student.last_name),
      email: normalizeFingerprintValue(student.email),
      phone: normalizeFingerprintValue(student.phone),
    },
    profile: {
      birthdate: normalizeFingerprintDate(profile.birthdate),
      birthplace: normalizeFingerprintValue(profile.birthplace),
      age: normalizeFingerprintValue(profile.age),
      gender: normalizeFingerprintValue(profile.gender),
      civil_status: normalizeFingerprintValue(profile.civil_status),
      nationality: normalizeFingerprintValue(profile.nationality),
      fb_link: normalizeFingerprintValue(profile.fb_link),
      gmail_account: normalizeFingerprintValue(profile.gmail_account),
      house_number: normalizeFingerprintValue(profile.house_number),
      street: normalizeFingerprintValue(profile.street),
      barangay: normalizeFingerprintValue(profile.barangay),
      city: normalizeFingerprintValue(profile.city),
      province: normalizeFingerprintValue(profile.province),
      zip_code: normalizeFingerprintValue(profile.zip_code),
      region: normalizeFingerprintValue(profile.region),
      educational_attainment: normalizeFingerprintValue(profile.educational_attainment),
      emergency_contact_person: normalizeFingerprintValue(profile.emergency_contact_person),
      emergency_contact_number: normalizeFingerprintValue(profile.emergency_contact_number),
      lto_portal_account: normalizeFingerprintValue(profile.lto_portal_account),
      student_permit_number: normalizeFingerprintValue(profile.student_permit_number),
      student_permit_date: normalizeFingerprintDate(profile.student_permit_date),
      student_permit_status: normalizeFingerprintValue(profile.student_permit_status),
      medical_certificate_provider: normalizeFingerprintValue(profile.medical_certificate_provider),
      medical_certificate_date: normalizeFingerprintDate(profile.medical_certificate_date),
      client_type: normalizeFingerprintValue(profile.client_type),
      promo_offer_id: normalizeFingerprintValue(profile.promo_offer_id),
      enrolling_for: normalizeFingerprintValue(profile.enrolling_for),
      pdc_category: normalizeFingerprintValue(profile.pdc_category),
      tdc_source: normalizeFingerprintValue(profile.tdc_source),
      training_method: normalizeFingerprintValue(profile.training_method),
      is_already_driver: normalizeFingerprintValue(profile.is_already_driver),
      target_vehicle: normalizeFingerprintValue(profile.target_vehicle),
      transmission_type: normalizeFingerprintValue(profile.transmission_type),
      motorcycle_type: normalizeFingerprintValue(profile.motorcycle_type),
      saferoads_id: normalizeFingerprintValue(profile.saferoads_id),
      driver_license_number: normalizeFingerprintValue(profile.driver_license_number),
      lto_client_id: normalizeFingerprintValue(profile.lto_client_id),
      lto_accreditation_no: normalizeFingerprintValue(profile.lto_accreditation_no),
      ofw: normalizeFingerprintValue(profile.ofw),
      luxa_id: normalizeFingerprintValue(profile.luxa_id),
      course_code: normalizeFingerprintValue(profile.course_code),
      course_name: normalizeFingerprintValue(profile.course_name),
      module_status: normalizeFingerprintValue(profile.module_status),
      quiz_score: normalizeFingerprintValue(profile.quiz_score),
      quiz_result: normalizeFingerprintValue(profile.quiz_result),
      quiz_start_date: normalizeFingerprintDate(profile.quiz_start_date),
      quiz_end_date: normalizeFingerprintDate(profile.quiz_end_date),
      exam_score: normalizeFingerprintValue(profile.exam_score),
      exam_result: normalizeFingerprintValue(profile.exam_result),
      exam_start_date: normalizeFingerprintDate(profile.exam_start_date),
      exam_end_date: normalizeFingerprintDate(profile.exam_end_date),
      certified: normalizeFingerprintValue(profile.certified),
      payment_status: normalizeFingerprintValue(profile.payment_status),
      payment_date: normalizeFingerprintDate(profile.payment_date),
      subscription_type: normalizeFingerprintValue(profile.subscription_type),
      ds_status: normalizeFingerprintValue(profile.ds_status),
      referral_code: normalizeFingerprintValue(profile.referral_code),
      company_name: normalizeFingerprintValue(profile.company_name),
      contact_person: normalizeFingerprintValue(profile.contact_person),
      company_email: normalizeFingerprintValue(profile.company_email),
      instructor_full_name: normalizeFingerprintValue(profile.instructor_full_name),
      instructor_lto_accreditation_no: normalizeFingerprintValue(profile.instructor_lto_accreditation_no),
      duration_days: normalizeFingerprintValue(profile.duration_days),
      archived: normalizeFingerprintValue(profile.archived),
      otdc_payment_mode: normalizeFingerprintValue(profile.otdc_payment_mode),
      otdc_registration_date: normalizeFingerprintDate(profile.otdc_registration_date),
      otdc_completed_date: normalizeFingerprintDate(profile.otdc_completed_date),
      otdc_driving_school: normalizeFingerprintValue(profile.otdc_driving_school),
      otdc_amount: normalizeFingerprintValue(profile.otdc_amount),
      otdc_city: normalizeFingerprintValue(profile.otdc_city),
      otdc_region: normalizeFingerprintValue(profile.otdc_region),
    },
    lifecycle: {
      startedAt: normalizeFingerprintDate(lifecycle.startedAt),
      completedAt: normalizeFingerprintDate(lifecycle.completedAt),
      isCompleted: normalizeFingerprintValue(lifecycle.isCompleted),
    },
  };
}

function buildComparableImportSignature(record = {}) {
  return crypto.createHash("sha1").update(JSON.stringify(buildComparableImportSnapshot(record))).digest("hex");
}

function parseImportedDate(value) {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsedFromSerial = new Date(excelEpoch + (value * 24 * 60 * 60 * 1000));
    return Number.isNaN(parsedFromSerial.getTime()) ? null : parsedFromSerial;
  }

  const text = String(value).trim();
  if (!text) return null;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?:\s*([AP]M))?)?/i);
  if (!match) return null;

  const [, monthValue, dayValue, yearValue, hourValue, minuteValue, meridiem] = match;
  let hours = Number(hourValue || 0);
  const minutes = Number(minuteValue || 0);

  if (meridiem) {
    const normalizedMeridiem = String(meridiem).toUpperCase();
    if (normalizedMeridiem === "PM" && hours < 12) hours += 12;
    if (normalizedMeridiem === "AM" && hours === 12) hours = 0;
  }

  const fallback = new Date(Number(yearValue), Number(monthValue) - 1, Number(dayValue), hours, minutes, 0, 0);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseImportedName(value, source) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  if (normalized.includes(",")) {
    const [lastPart, firstPart] = normalized.split(",").map((part) => part.trim()).filter(Boolean);
    if (firstPart && lastPart) {
      return { firstName: firstPart, lastName: lastPart };
    }
  }

  const parts = normalized.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    if (source === "otdc") {
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "N/A" };
  }

  return { firstName: null, lastName: null };
}

function buildImportedLifecycle(lookup, source) {
  const normalizedSource = normalizeSource(source);

  if (normalizedSource === "otdc") {
    const startedAt = parseImportedDate(
      pickValue(lookup, ["registration_date", "registrationdate", "registered_at", "registered_date"])
    );
    const completedAt = parseImportedDate(
      pickValue(lookup, ["completed_date_time", "completed_date", "completion_date", "completedat"])
    ) || startedAt || new Date();

    return {
      startedAt,
      completedAt,
      isCompleted: true,
    };
  }

  if (isSaferoadsLike(normalizedSource)) {
    const startedAt = parseImportedDate(
      pickValue(lookup, ["quizStartDate", "examStartDate", "startDate", "started_at", "startedDate"])
    );
    const endDate = parseImportedDate(
      pickValue(lookup, ["examEndDate", "examEnd_date", "quizEndDate", "quizEnd_date", "completionDate", "completedDate", "finished_at"])
    );

    return {
      startedAt,
      completedAt: endDate || startedAt || new Date(),
      isCompleted: true,
    };
  }

  return {
    startedAt: null,
    completedAt: null,
    isCompleted: false,
  };
}

function normalizeSource(source) {
  const normalized = String(source || "").trim().toLowerCase();
  return ONLINE_TDC_SOURCES.has(normalized) ? normalized : null;
}

function getSourceLabel(source) {
  const normalized = normalizeSource(source);
  if (isSaferoadsLike(normalized)) return normalized === "odep" || normalized === "saferoads_odep" ? "SafeRoads (ODEP)" : "SafeRoads.ph";
  if (normalized === "otdc") return "OTDC.ph";
  return "Online TDC";
}

function buildStableExternalRef(row, source, index) {
  const lookup = buildLookup(row);
  const explicitRef = normalizeText(
    pickValue(lookup, [
      "external_ref",
      "external_reference",
      "external_student_ref",
      "application_ref",
      "application_reference",
      "reference_number",
      "student_reference",
      "student_ref",
      "id",
    ])
  );

  if (explicitRef) {
    return explicitRef;
  }

  const payloadForHash = JSON.stringify(
    Object.keys(row)
      .sort()
      .reduce((result, key) => {
        result[key] = row[key];
        return result;
      }, {})
  );

  const hash = crypto.createHash("sha1").update(`${source}:${index}:${payloadForHash}`).digest("hex");
  return `${source}-${hash.slice(0, 16)}`;
}

function parseSpreadsheetRows(file) {
  if (!file || !file.buffer) {
    return [];
  }

  const originalName = String(file.originalname || "");
  const extension = path.extname(originalName).toLowerCase();
  const workbook = extension === ".csv"
    ? XLSX.read(file.buffer.toString("utf8"), { type: "string" })
    : XLSX.read(file.buffer, { type: "buffer" });

  const firstSheet = workbook.SheetNames?.[0];
  if (!firstSheet) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function mapImportedOnlineTdcRow(row, source, index) {
  const normalizedSource = normalizeSource(source);
  if (!normalizedSource) {
    return null;
  }

  const lookup = buildLookup(row);
  const externalRef = buildStableExternalRef(row, normalizedSource, index);
  const lifecycle = buildImportedLifecycle(lookup, normalizedSource);

  // SafeRoads uses camelCase: firstName, lastName, middleName
  // OTDC uses single "Name" field
  const firstName = normalizeText(
    pickValue(lookup, [
      "firstname", "first_name", "first name", "given_name", "givenname",
      isSaferoadsLike(normalizedSource) ? "firstname" : null,
    ].filter(Boolean))
  );

  const lastName = normalizeText(
    pickValue(lookup, [
      "lastname", "last_name", "last name", "surname", "family_name", "familyname",
      isSaferoadsLike(normalizedSource) ? "lastname" : null,
    ].filter(Boolean))
  );

  const nameSourceValue = pickValue(lookup, ["name", "student", "student_name", "full_name", "fullname"]);
  const parsedName = parseImportedName(nameSourceValue, normalizedSource);
  const finalFirstName = firstName || parsedName.firstName;
  const finalLastName = lastName || parsedName.lastName;

  if (!finalFirstName || !finalLastName) {
    return null;
  }

  const middleName = normalizeText(
    pickValue(lookup, [
      "middle_name", "middlename", "middle name", "mi", "middle_initial",
      isSaferoadsLike(normalizedSource) ? "middlename" : null
    ].filter(Boolean))
  );
  
  const email = normalizeText(
    pickValue(lookup, [
      "email", "email_address", "gmail_account", "gmail", "mail",
      isSaferoadsLike(normalizedSource) ? "email" : "email",
      normalizedSource === "otdc" ? "email" : null
    ].filter(Boolean))
  );
  
  const phone = normalizeText(
    pickValue(lookup, [
      "phone", "mobile", "mobile_number", "contact_number", "contact", "cellphone",
      isSaferoadsLike(normalizedSource) ? "mobile" : null
    ].filter(Boolean))
  );

  const profile = {
    birthdate: normalizeText(pickValue(lookup, ["birthdate", "birth_date", "date_of_birth", "dob", "birthDate"])),
    birthplace: normalizeText(pickValue(lookup, ["birthplace", "place_of_birth", "birthPlace"])),
    age: normalizeNumber(pickValue(lookup, ["age"])),
    gender: normalizeText(pickValue(lookup, ["gender", "sex"])),
    civil_status: normalizeText(pickValue(lookup, ["civil_status", "civilstatus", "marital_status", "civilStatus"])),
    nationality: normalizeText(pickValue(lookup, ["nationality", "citizenship"])),
    fb_link: normalizeText(pickValue(lookup, ["fb_link", "facebook_link", "facebook"])),
    gmail_account: normalizeText(pickValue(lookup, ["gmail_account", "gmail", "email", "email_address"])),
    house_number: normalizeText(pickValue(lookup, ["house_number", "house no", "house_no", "unit", "no", "address"])),
    street: normalizeText(pickValue(lookup, ["street", "street_name"])),
    barangay: normalizeText(pickValue(lookup, ["barangay", "brgy"])),
    city: normalizeText(pickValue(lookup, ["city", "municipality", "town"])),
    province: normalizeText(pickValue(lookup, ["province"])),
    zip_code: normalizeText(pickValue(lookup, ["zip_code", "zipcode", "postal_code", "zip", "postalCode"])),
    region: normalizeText(pickValue(lookup, ["region"])),
    educational_attainment: normalizeText(pickValue(lookup, ["educational_attainment", "education", "highest_education"])),
    emergency_contact_person: normalizeText(pickValue(lookup, ["emergency_contact_person", "emergency_contact_name", "emergency_person"])),
    emergency_contact_number: normalizeText(pickValue(lookup, ["emergency_contact_number", "emergency_contact", "emergency_number"])),
    lto_portal_account: normalizeText(pickValue(lookup, ["lto_portal_account", "lto_account", "ltoClientId", "driverLicense"])),
    driving_school_tdc: normalizeText(pickValue(lookup, ["driving_school_tdc", "driving_school", "school", "driving_school", "dsFullAddress"])),
    year_completed_tdc: normalizeText(pickValue(lookup, ["year_completed_tdc", "year_completed", "tdc_year", "startDate"])),
    student_permit_number: normalizeText(pickValue(lookup, ["student_permit_number", "permit_number", "student_permit"])),
    student_permit_date: normalizeText(pickValue(lookup, ["student_permit_date", "permit_date", "validationDate"])),
    student_permit_status: normalizeText(pickValue(lookup, ["student_permit_status", "permit_status", "status"])),
    medical_certificate_provider: normalizeText(pickValue(lookup, ["medical_certificate_provider", "medical_provider"])),
    medical_certificate_date: normalizeText(pickValue(lookup, ["medical_certificate_date", "medical_date"])),
    client_type: normalizeText(pickValue(lookup, ["client_type"])),
    promo_offer_id: normalizeNumber(pickValue(lookup, ["promo_offer_id", "promo_offer"])),
    enrolling_for: normalizeText(pickValue(lookup, ["enrolling_for", "course", "course_type", "courseName"])),
    pdc_category: normalizeText(pickValue(lookup, ["pdc_category", "pdc_type"])),
    training_method: normalizeText(pickValue(lookup, ["training_method"])),
    is_already_driver: normalizeBoolean(pickValue(lookup, ["is_already_driver", "already_driver"])),
    target_vehicle: normalizeText(pickValue(lookup, ["target_vehicle", "vehicle"])),
    transmission_type: normalizeText(pickValue(lookup, ["transmission_type", "transmission"])),
    motorcycle_type: normalizeText(pickValue(lookup, ["motorcycle_type", "motorcycle"])),
    
    // SafeRoads-specific fields
    ...(isSaferoadsLike(normalizedSource) && {
      saferoads_id: normalizeText(pickValue(lookup, ["id", "customId"])),
      driver_license_number: normalizeText(pickValue(lookup, ["driverLicense"])),
      lto_client_id: normalizeText(pickValue(lookup, ["ltoClientId"])),
      lto_accreditation_no: normalizeText(pickValue(lookup, ["ltoAccreditationNo"])),
      ofw: normalizeBoolean(pickValue(lookup, ["ofw"])),
      luxa_id: normalizeText(pickValue(lookup, ["luxandId"])),
      course_code: normalizeText(pickValue(lookup, ["courseCode"])),
      course_name: normalizeText(pickValue(lookup, ["courseName"])),
      module_status: normalizeText(pickValue(lookup, ["moduleStatus"])),
      quiz_score: normalizeNumber(pickValue(lookup, ["quizScore"])),
      quiz_result: normalizeText(pickValue(lookup, ["quizResult"])),
      quiz_start_date: normalizeText(pickValue(lookup, ["quizStartDate"])),
      quiz_end_date: normalizeText(pickValue(lookup, ["quizEnd_date"])),
      exam_score: normalizeNumber(pickValue(lookup, ["examScore"])),
      exam_result: normalizeText(pickValue(lookup, ["examResult"])),
      exam_start_date: normalizeText(pickValue(lookup, ["examStartDate"])),
      exam_end_date: normalizeText(pickValue(lookup, ["examEnd_date"])),
      certified: normalizeBoolean(pickValue(lookup, ["certified"])),
      payment_status: normalizeText(pickValue(lookup, ["paymentStatus"])),
      payment_date: normalizeText(pickValue(lookup, ["paymentDate"])),
      subscription_type: normalizeText(pickValue(lookup, ["subscriptionType"])),
      ds_status: normalizeText(pickValue(lookup, ["dsStatus"])),
      referral_code: normalizeText(pickValue(lookup, ["referralCode"])),
      company_name: normalizeText(pickValue(lookup, ["companyName"])),
      contact_person: normalizeText(pickValue(lookup, ["contactPerson"])),
      company_email: normalizeText(pickValue(lookup, ["companyEmail"])),
      instructor_full_name: normalizeText(pickValue(lookup, ["instructorFullName"])),
      instructor_lto_accreditation_no: normalizeText(pickValue(lookup, ["instructorLtoAccreditationNo"])),
      duration_days: normalizeNumber(pickValue(lookup, ["durationDays"])),
      archived: normalizeBoolean(pickValue(lookup, ["archived"])),
    }),
    
    // OTDC-specific fields
    ...(normalizedSource === "otdc" && {
      otdc_payment_mode: normalizeText(pickValue(lookup, ["payment_mode", "payment_method", "payment_mode"])),
      otdc_registration_date: normalizeText(pickValue(lookup, ["registration_date", "registration_date"])),
      otdc_completed_date: normalizeText(pickValue(lookup, ["completed_date_time", "completed_date", "completion_date"])),
      otdc_driving_school: normalizeText(pickValue(lookup, ["driving_school"])),
      otdc_amount: normalizeNumber(pickValue(lookup, ["amount", "payment_amount", "paid_amount"])),
      otdc_city: normalizeText(pickValue(lookup, ["city"])),
      otdc_region: normalizeText(pickValue(lookup, ["region"])),
    }),
    
    tdc_source: normalizedSource,
  };

  return {
    external_ref: externalRef,
    raw_payload: row,
    lifecycle,
    student: {
      first_name: finalFirstName,
      middle_name: middleName,
      last_name: finalLastName,
      email,
      phone,
      source_channel: normalizedSource,
      external_source: normalizedSource,
      external_student_ref: externalRef,
    },
    profile,
  };
}

module.exports = {
  buildComparableImportSignature,
  getSourceLabel,
  mapImportedOnlineTdcRow,
  normalizeSource,
  parseSpreadsheetRows,
};
