const clientTypeOptions = [
  { value: "GUTS Walk-in Application", label: "GUTS Walk-in Application" },
  { value: "GUTS FB Page Application", label: "GUTS FB Page Application" },
  { value: "Carmona Estates Booking Office", label: "Carmona Estates Booking Office" },
];

const genderOptions = ["Male", "Female", "Prefer not to say"];
const civilStatusOptions = ["Single", "Married", "Separated", "Widowed"];
const nationalityOptions = ["Filipino", "Foreign", "Others"];
const educationalAttainmentOptions = ["College", "High School", "Elementary", "Post Graduate", "Vocational", "Informal Schooling", "Other"];
const enrollingForOptions = [
  "Theoretical Driving Course (TDC 15 hrs Lecture/Seminar) - FOR STUDENT PERMIT APPLICATION",
  "DEFENSIVE DRIVING SEMINAR (WITH NON PRO/ PRO LICENSE)",
];
const pdcClassificationOptions = ["Beginner", "Experience"];
const yesNoOptions = ["true", "false"];
const pdcVehicleTypeOptions = [
  "DL Codes A - Motorcycle (2 wheels)",
  "DL Codes A1 - Tricycle (3 wheels)",
  "DL Codes B - Car/Sedan (4 wheels - 8 seaters below)",
  "DL Codes B1 - L300/Van (4 wheels - 9 seaters above)",
  "Other",
];
const promoPdcEnrollingForOptions = [
  "PDC Experienced",
  "PDC Beginner",
  "PDC Additional Restriction / DL Codes - Experienced",
  "PDC Additional Restriction / DL Codes- Beginner",
  "DRIVING LESSON ( w/ license already)",
  "Other",
];
// Removed unused option lists to satisfy linting (previously defined but not used)

function section(title, description, fields = []) {
  return { title, description, fields };
}

function textField(name, label, required = false, extra = {}) {
  return { name, label, type: "text", required, ...extra };
}

function selectField(name, label, options, required = false, extra = {}) {
  return { name, label, type: "select", required, options, ...extra };
}

function dateField(name, label, required = false, extra = {}) {
  return { name, label, type: "date", required, ...extra };
}

// Standardized sections used by all enrollment forms
const commonClientInfoSection = [
  selectField("enrollment.promo_offer_id", "PROMO OFFER", [], false),
  selectField("enrollment.client_type", "CLIENT TYPE", clientTypeOptions, true),
];

const commonPersonalInfoSection = [
  textField("student.first_name", "FIRST NAME", true),
  textField("student.middle_name", "MIDDLE NAME", false),
  textField("student.last_name", "LAST NAME", true),
  { name: "profile.birthdate", label: "BIRTHDAY", type: "date", required: true },
  textField("profile.birthplace", "BIRTHPLACE", true),
  textField("profile.age", "AGE", false, { readOnly: true }),
  textField("profile.gmail_account", "GMAIL / YMAIL ACCOUNT", true),
  selectField("profile.nationality", "NATIONALITY", nationalityOptions, true),
  selectField("profile.gender", "GENDER", genderOptions, true),
  selectField("profile.civil_status", "MARITAL STATUS", civilStatusOptions, true),
  textField("student.phone", "CONTACT NUMBER", true),
];

const commonAddressSection = [
  textField("profile.house_number", "HOUSE NUMBER / BLDG NAME", true),
  textField("profile.street", "STREET / PHASE / SUBDIVISION", true),
  selectField("extras.region", "REGION", [], true),
  selectField("profile.province", "PROVINCE", [], true),
  selectField("profile.city", "CITY / MUNICIPALITY", [], true),
  selectField("profile.barangay", "BARANGAY / DISTRICT", [], true),
  textField("profile.zip_code", "ZIP CODE", false, { readOnly: true }),
];

const commonEmergencySection = [
  selectField("extras.educational_attainment", "EDUCATIONAL ATTAINMENT", educationalAttainmentOptions, false),
  textField("extras.emergency_contact_person", "EMERGENCY CONTACT PERSON", false),
  textField("extras.emergency_contact_number", "EMERGENCY CONTACT NUMBER", false),
  textField("extras.lto_portal_account", "LTO/LTMS PORTAL ACCOUNT", false),
];

const templatesByType = {
  TDC: {
    enrollment_type: "TDC",
    name: "TDC Enrollment Form",
    description: "Technical Driving Course public enrollment form",
    sections: [
      section("CLIENT INFORMATION", "Tell us which intake and client category applies to this submission.", commonClientInfoSection),
      section("PERSONAL INFORMATION", "Fill out student details and submit the enrollment record.", commonPersonalInfoSection),
      section("ADDRESS", "Collect the address details needed for the student profile.", commonAddressSection),
      section("EMERGENCY & CREDENTIALS", "Student contact and account details used during review.", commonEmergencySection),
      section("COURSE INFORMATION", "Select the enrollment purpose for this TDC intake.", [
        selectField("extras.enrolling_for", "ENROLLING FOR", enrollingForOptions, true),
      ]),
    ],
  },
  PDC: {
    enrollment_type: "PDC",
    name: "PDC Enrollment Form",
    description: "Professional Driving Course public enrollment form",
    sections: [
      section("CLIENT INFORMATION", "Tell us which intake and client category applies to this submission.", commonClientInfoSection),
      section("PERSONAL INFORMATION", "Fill out student details and submit the enrollment record.", commonPersonalInfoSection),
      section("ADDRESS", "Collect the address details needed for the student profile.", commonAddressSection),
      section("EMERGENCY & CREDENTIALS", "Student contact and account details used during review.", commonEmergencySection),
      section("COURSE INFORMATION", "Pick the PDC track and related training details.", [
        selectField("extras.enrolling_for", "ENROLLING FOR", promoPdcEnrollingForOptions, true),
        selectField("enrollment.pdc_category", "PDC CLASSIFICATION", pdcClassificationOptions, true),
        selectField("enrollment.is_already_driver", "MARUNONG KA NA BANG MAGMANEHO?", yesNoOptions, false),
        selectField("enrollment.target_vehicle", "ANONG SASAKYAN ANG IMAMANEHO?", pdcVehicleTypeOptions, false),
      ]),
    ],
  },
  PROMO: {
    enrollment_type: "PROMO",
    name: "TDC + PDC Promo Enrollment Form",
    description: "Combined Technical and Professional Driving Course enrollment",
    sections: [
      section("CLIENT INFORMATION", "Tell us which intake and client category applies to this submission.", commonClientInfoSection),
      section("PERSONAL INFORMATION", "Fill out student details and submit the enrollment record.", commonPersonalInfoSection),
      section("EMERGENCY & CREDENTIALS", "Student contact and account details used during review.", commonEmergencySection),
      section("ADDRESS", "Collect the address details needed for the student profile.", commonAddressSection),
      section("COURSE INFORMATION", "Select the enrollment purpose for the TDC leg.", [
        selectField("extras.enrolling_for", "ENROLLING FOR", enrollingForOptions, true),
      ]),
      section("TDC Schedule Session", "Enter the date you want for the TDC leg. Encoder/staff will assign the instructor and final schedule details.", [
        dateField("promo_schedule_tdc.schedule_date", "Desired Date", true),
        { type: "note", content: "Encoder/staff will assign the instructor, time slot, and final schedule details after review." }
      ]),
      section("PDC Start Option", "Choose whether the PDC leg should be scheduled now or left for later review.", [
        selectField(
          "promo_schedule_pdc.enabled",
          "PDC Start Option",
          [
            { value: "true", label: "Schedule Now" },
            { value: "false", label: "Schedule Later" },
          ],
          true
        ),
      ]),
      section("PDC COURSE INFORMATION", "Pick the PDC track and related training details.", [
        selectField("extras.enrolling_for", "ENROLLING FOR", promoPdcEnrollingForOptions, true),
        selectField("enrollment.pdc_category", "PDC CLASSIFICATION", pdcClassificationOptions, true),
        selectField("enrollment.is_already_driver", "MARUNONG KA NA BANG MAGMANEHO?", yesNoOptions, false),
        selectField("enrollment.target_vehicle", "ANONG SASAKYAN ANG IMAMANEHO?", pdcVehicleTypeOptions, false),
        { type: "note", content: "IMPORTANT REMINDERS FOR PDC STUDENTS: PER DL CODES PO ANG ATING PDC. EVERY DL CODES MAGKAKAIBA ANG RATES AND SCHEDULE." }
      ]),
      section("PDC Schedule Session", "Set the PDC schedule for promo enrollment.", [
        dateField("promo_schedule_pdc.schedule_date", "Desired Date", false),
      ])
    ],
  },
};

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

function inferEnrollmentTypeFromName(name) {
  const normalized = String(name || "").toLowerCase();

  if (normalized.includes("promo")) {
    return "PROMO";
  }

  if (normalized.includes("pdc")) {
    return "PDC";
  }

  if (normalized.includes("tdc")) {
    return "TDC";
  }

  return null;
}

export const QR_ENROLLMENT_TEMPLATE = {
  name: "GUTS QR Enrollment",
  description: "Public enrollment form captured from a generated QR code.",
  sections: [
    section("Enrollment Type", "Tell us what kind of enrollment you want to submit.", [
      selectField("enrollment_type", "Enrollment Type", ["TDC", "PDC", "PROMO"], true),
      selectField("enrollment.client_type", "Client Type", clientTypeOptions.map((option) => option.value), true),
      selectField("enrollment.pdc_category", "PDC Category", ["Beginner", "Experience"], false),
    ]),
  ],
};

export function buildQrEnrollmentTemplate(enrollmentType) {
  const normalizedType = String(enrollmentType || "").trim().toUpperCase();
  const template = templatesByType[normalizedType] || templatesByType.TDC;
  return cloneTemplate(template);
}

export function resolveQrEnrollmentType(template) {
  if (!template || typeof template !== "object") {
    return null;
  }

  const explicitType = String(template.enrollment_type || "").trim().toUpperCase();
  if (explicitType === "TDC" || explicitType === "PDC" || explicitType === "PROMO") {
    return explicitType;
  }

  return inferEnrollmentTypeFromName(template.name);
}