export const PDC_OUTCOME_OPTIONS = [
  "PASSED",
  "FAILED",
  "RETAKE",
  "RESCHED/RE ENROLL",
  "RESCHED/PENALTY",
  "RESCHEDULE ONLY",
  "CANCEL",
  "CANCELLED",
  "VOID",
];

export const TDC_OUTCOME_OPTIONS = [
  "PASSED",
  "FAILED",
  "ABSENT",
  "PENALTY RESCHEDULE",
  "RESCHEDULE ONLY",
  "SEAT IN",
  "SCHOLAR",
  "FREE TDC",
  "CANCEL",
  "CANCELLED",
  "VOID",
];

export function getOutcomeOptionsByCourse(courseCode, promoCategory = "TDC") {
  const normalizedCourse = String(courseCode || "").toUpperCase();
  const normalizedPromoCategory = String(promoCategory || "").toUpperCase();

  if (normalizedCourse === "PDC") {
    return PDC_OUTCOME_OPTIONS;
  }

  if (normalizedCourse === "TDC") {
    return TDC_OUTCOME_OPTIONS;
  }

  if (normalizedCourse === "PROMO") {
    return normalizedPromoCategory === "PDC" ? PDC_OUTCOME_OPTIONS : TDC_OUTCOME_OPTIONS;
  }

  return [];
}

export function mapOutcomeToEnrollmentStatus(outcome) {
  const normalized = String(outcome || "").trim().toUpperCase();

  if (!normalized) return "pending";
  if (normalized === "CANCELLED") return "cancelled";
  if (normalized === "PASSED" || normalized === "FAILED") return "completed";
  if (normalized === "RETAKE") return "pending";
  if (normalized.includes("RESCHED")) return "confirmed";
  if (normalized === "ABSENT") return "pending";
  if (normalized === "SEAT IN" || normalized === "SCHOLAR" || normalized === "FREE TDC") return "confirmed";

  return "confirmed";
}

export function formatScoreValue(courseCode, outcome, promoCategory = "") {
  const normalizedCourse = String(courseCode || "").toUpperCase();
  const normalizedOutcome = String(outcome || "").trim();
  const normalizedPromoCategory = String(promoCategory || "").toUpperCase();

  if (!normalizedOutcome) return "";

  if (normalizedCourse === "PROMO") {
    return `PROMO|${normalizedPromoCategory || "TDC"}|${normalizedOutcome}`;
  }

  if (normalizedCourse === "PDC" || normalizedCourse === "TDC") {
    return `${normalizedCourse}|${normalizedOutcome}`;
  }

  return normalizedOutcome;
}

export function formatPromoScoreValue(promoTdcOutcome, promoPdcOutcome) {
  const safeTdc = String(promoTdcOutcome || "").trim();
  const safePdc = String(promoPdcOutcome || "").trim();
  return `PROMO|TDC=${safeTdc}|PDC=${safePdc}`;
}

export function parseScoreValue(scoreValue) {
  const raw = String(scoreValue || "").trim();
  if (!raw) {
    return {
      promoCategory: "TDC",
      outcome: "",
      promoTdcOutcome: "",
      promoPdcOutcome: "",
    };
  }

  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);

  if (parts[0] === "PROMO") {
    const hasKeyValuePairs = parts.some((part) => part.startsWith("TDC=") || part.startsWith("PDC="));
    if (hasKeyValuePairs) {
      const tdcPart = parts.find((part) => part.startsWith("TDC="));
      const pdcPart = parts.find((part) => part.startsWith("PDC="));
      const promoTdcOutcome = tdcPart ? tdcPart.replace(/^TDC=/, "").trim() : "";
      const promoPdcOutcome = pdcPart ? pdcPart.replace(/^PDC=/, "").trim() : "";
      return {
        promoCategory: promoPdcOutcome ? "PDC" : "TDC",
        outcome: promoPdcOutcome || promoTdcOutcome,
        promoTdcOutcome,
        promoPdcOutcome,
      };
    }

    return {
      promoCategory: parts[1] || "TDC",
      outcome: parts.slice(2).join("|") || "",
      promoTdcOutcome: parts[1] === "TDC" ? parts.slice(2).join("|") || "" : "",
      promoPdcOutcome: parts[1] === "PDC" ? parts.slice(2).join("|") || "" : "",
    };
  }

  if (parts[0] === "PDC" || parts[0] === "TDC") {
    return {
      promoCategory: parts[0],
      outcome: parts.slice(1).join("|") || "",
      promoTdcOutcome: parts[0] === "TDC" ? parts.slice(1).join("|") || "" : "",
      promoPdcOutcome: parts[0] === "PDC" ? parts.slice(1).join("|") || "" : "",
    };
  }

  return {
    promoCategory: "TDC",
    outcome: raw,
    promoTdcOutcome: "",
    promoPdcOutcome: "",
  };
}

export function getDisplayStatusLabel(courseCode, scoreValue, enrollmentStatus = "", options = {}) {
  const { isImportedTdc = false } = options || {};
  const parsed = parseScoreValue(scoreValue);
  const normalizedCourse = String(courseCode || "").toUpperCase();
  const normalizedStatus = String(enrollmentStatus || "").toLowerCase();

  if (normalizedStatus === "cancelled") {
    return "CANCELLED";
  }

  if (normalizedCourse === "PROMO") {
    const tdc = parsed.promoTdcOutcome || "NOT SET";
    const pdc = parsed.promoPdcOutcome || "NOT SET";
    return `TDC: ${tdc} | PDC: ${pdc}`;
  }

  if (parsed.outcome) {
    return parsed.outcome;
  }

  if (isImportedTdc) {
    return "PASSED";
  }

  if (normalizedStatus === "completed") {
    return "COMPLETED";
  }

  return "NOT SET";
}
