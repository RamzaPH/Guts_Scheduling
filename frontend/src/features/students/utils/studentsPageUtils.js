export function toTitleCase(value) {
  if (!value) return "N/A";
  return String(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStudentFullName(student) {
  return [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(" ") || "N/A";
}

export function getLatestEnrollment(student) {
  return student?.Enrollments?.[0] || null;
}

export function getStudentSourceLabel(student) {
  const source = String(student?.source_channel || student?.external_source || student?.StudentProfile?.tdc_source || "").toLowerCase();

  if (source === "saferoads") return "SafeRoads.ph";
  if (source === "otdc") return "OTDC.ph";
  if (source && source !== "walk_in") return "Online TDC";
  return "Walk-in";
}

export function getEnrollmentLifecycleStatus(enrollment, student) {
  const normalizedState = String(enrollment?.enrollment_state || "").toLowerCase();
  if (normalizedState === "cancelled") {
    return "cancelled";
  }

  const studentRecord = student || enrollment?.Student;
  const sourceLabel = getStudentSourceLabel(studentRecord);
  const courseCode = getCourseCode(studentRecord);
  const isImportedTdc = sourceLabel === "SafeRoads.ph" || sourceLabel === "OTDC.ph";

  if (isImportedTdc && (courseCode === "TDC" || courseCode === "N/A")) {
    return "completed";
  }

  if (!enrollment) {
    return sourceLabel === "Walk-in" ? "pending" : "completed";
  }

  const normalizedStatus = String(enrollment?.status || "").toLowerCase();
  return normalizedStatus || "pending";
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatImportedDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-CA");
}

export function getEnrollmentPaymentSummary(enrollment, student) {
  const studentRecord = student || enrollment?.Student;
  const sourceLabel = getStudentSourceLabel(studentRecord);
  const courseCode = getCourseCode(studentRecord);
  const isImportedTdc = sourceLabel !== "Walk-in" && (courseCode === "TDC" || courseCode === "N/A");
  const isFixedPaymentImport = isImportedTdc && (sourceLabel === "SafeRoads.ph" || sourceLabel === "OTDC.ph");
  const payments = Array.isArray(enrollment?.payments) ? enrollment.payments : [];
  let totalDue = Math.max(toNumber(enrollment?.fee_amount) - toNumber(enrollment?.discount_amount), 0);
  // If there is a promo package purchase and additional promos amount, only count
  // payments made after the promo purchase towards the promo delta so already-paid
  // items are excluded from the promo balance. (value not needed here)
  let totalPaid = payments.reduce((sum, payment) => sum + toNumber(payment?.amount), 0);
  const lifecycleStatus = String(enrollment?.status || "").toLowerCase();

  if (isFixedPaymentImport) {
    return {
      totalDue: 599,
      totalPaid: 599,
      remainingBalance: 0,
      paymentStatus: "completed_payment",
    };
  }

  if (isImportedTdc && totalPaid <= 0) {
    if (lifecycleStatus === "completed") {
      return {
        totalDue: 599,
        totalPaid: 599,
        remainingBalance: 0,
        paymentStatus: "completed_payment",
      };
    }

    return {
      totalDue: 599,
      totalPaid: 0,
      remainingBalance: 599,
      paymentStatus: "with_balance",
    };
  }

  const remainingBalance = Math.max(totalDue - totalPaid, 0);

  let paymentStatus = "not_set";
  if (totalDue > 0 || totalPaid > 0) {
    if (remainingBalance <= 0) {
      paymentStatus = "completed_payment";
    } else if (totalPaid > 0) {
      paymentStatus = "partial_payment";
    } else {
      paymentStatus = "with_balance";
    }
  }

  return {
    totalDue: Number(totalDue.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    remainingBalance: Number(remainingBalance.toFixed(2)),
    paymentStatus,
  };
}

export function hasPromoStatusContext(student) {
  const latestEnrollment = getLatestEnrollment(student);

  if (!latestEnrollment) {
    return false;
  }

  const hasPromoOffer = Boolean(latestEnrollment.promo_offer_id || latestEnrollment.promoOffer?.id || latestEnrollment.promoPackage?.id);
  const hasAdditionalPromos = Array.isArray(latestEnrollment.additional_promo_offer_ids) && latestEnrollment.additional_promo_offer_ids.length > 0;
  const profilePromoOffer = Boolean(student?.StudentProfile?.promo_offer_id);

  return hasPromoOffer || hasAdditionalPromos || profilePromoOffer;
}

export function getPaymentCategoryLabel(enrollment) {
  return {
    promoOfferName: enrollment?.promoOffer?.name || enrollment?.promo_offer_name || "None",
    paymentTerms: enrollment?.payment_terms || "Full Payment",
  };
}

export function getLatestScheduleForEnrollment(enrollment) {
  if (!enrollment) return null;
  if (enrollment.Schedule) return enrollment.Schedule;
  if (Array.isArray(enrollment.scheduledSessions) && enrollment.scheduledSessions.length) {
    return enrollment.scheduledSessions[0];
  }
  return null;
}

export function getStudentScheduleRemarks(schedule) {
  return schedule?.student_remarks || schedule?.remarks || "-";
}

export function getCourseCode(student) {
  const latestEnrollment = getLatestEnrollment(student);
  const rawCode = latestEnrollment?.DLCode?.code || "";
  const normalizedCode = rawCode.toUpperCase();

  if (normalizedCode.includes("PROMO")) return "PROMO";
  if (normalizedCode.includes("PDC")) return "PDC";
  if (normalizedCode.includes("TDC")) return "TDC";

  if (getStudentSourceLabel(student) !== "Walk-in") {
    return "TDC";
  }

  return "N/A";
}

export function getImportedTdcDates(student) {
  const enrollment = getLatestEnrollment(student);
  const source = getStudentSourceLabel(student);

  if (source === "Walk-in" || !enrollment) {
    return {
      startedAt: null,
      completedAt: null,
    };
  }

  return {
    startedAt: formatImportedDate(enrollment.created_at || enrollment.createdAt),
    completedAt: formatImportedDate(enrollment.completed_at || enrollment.completedAt || student?.StudentProfile?.year_completed_tdc),
  };
}

export function getEnrollmentTimelineDates(enrollment, student) {
  const studentRecord = student || enrollment?.Student;
  const sourceLabel = getStudentSourceLabel(studentRecord);
  const courseCode = getCourseCode(studentRecord);
  const isImportedTdc = sourceLabel !== "Walk-in" && (courseCode === "TDC" || courseCode === "N/A");

  if (isImportedTdc) {
    return getImportedTdcDates(studentRecord);
  }

  if (!enrollment) {
    return {
      startedAt: null,
      completedAt: null,
    };
  }

  return {
    startedAt: formatImportedDate(enrollment.created_at || enrollment.createdAt || studentRecord?.createdAt),
    completedAt: formatImportedDate(
      enrollment.completed_at ||
        enrollment.completedAt ||
        (String(enrollment.status || "").toLowerCase() === "completed" ? (enrollment.updated_at || enrollment.updatedAt) : null)
    ),
  };
}

import {
  getRegionLabel,
  getProvinceLabel,
  getCityLabel,
  getBarangayLabel,
  getZipCodeByAddressCodes,
} from "../../enrollments/utils/phLocations";

export function buildAddress(profile) {
  if (!profile) return "No address available";

  // Convert PSGC code values to human-friendly labels when possible
  let house = profile.house_number || "";
  let street = profile.street || "";
  let region = profile.region || "";
  let barangay = profile.barangay || "";
  let city = profile.city || "";
  let province = profile.province || "";
  let zip = profile.zip_code || "";

  const looksLikeCode = (v) => typeof v === "string" && /^\d+$/.test(v.trim());

  try {
    if (looksLikeCode(profile.region)) {
      region = getRegionLabel(profile.region) || region;
    }
    if (looksLikeCode(city)) {
      city = getCityLabel(profile.region || "", province || "", city) || city;
    }
    if (looksLikeCode(province)) {
      province = getProvinceLabel(profile.region || "", province) || province;
    }
    if (looksLikeCode(barangay)) {
      // getBarangayLabel needs the city code; pass original code if present
      barangay = getBarangayLabel(profile.city || "", barangay) || barangay;
    }

    // If zip missing, attempt to auto-fill from address codes
    if (!zip) {
      const auto = getZipCodeByAddressCodes(profile.region, profile.province, profile.city);
      zip = auto || zip;
    }
  } catch (e) {
    void e; // ignore location helper failures
  }

  const parts = [house, street, barangay, city, province, region, zip].filter(Boolean);
  return parts.length ? parts.join(", ") : "No address available";
}

export function mapStudentToEditForm(student) {
  const profile = student?.StudentProfile || {};

  return {
    student: {
      first_name: student?.first_name || "",
      middle_name: student?.middle_name || "",
      last_name: student?.last_name || "",
      email: student?.email || "",
      phone: student?.phone || "",
    },
    profile: {
      birthdate: profile.birthdate || "",
      age: profile.age || "",
      gender: profile.gender || "",
      civil_status: profile.civil_status || "",
      nationality: profile.nationality || "",
      fb_link: profile.fb_link || "",
      gmail_account: profile.gmail_account || "",
      house_number: profile.house_number || "",
      street: profile.street || "",
      barangay: profile.barangay || "",
      city: profile.city || "",
      province: profile.province || "",
      zip_code: profile.zip_code || "",
      region: profile.region || "",
      educational_attainment: profile.educational_attainment || "",
      emergency_contact_person: profile.emergency_contact_person || "",
      emergency_contact_number: profile.emergency_contact_number || "",
      lto_portal_account: profile.lto_portal_account || "",
      student_permit_number: profile.student_permit_number || "",
      student_permit_date: profile.student_permit_date || "",
      student_permit_status: profile.student_permit_status || "",
      medical_certificate_provider: profile.medical_certificate_provider || "",
      medical_certificate_date: profile.medical_certificate_date || "",
    },
  };
}
