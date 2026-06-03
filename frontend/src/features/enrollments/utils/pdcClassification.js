function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function inferPdcCategory(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);

    if (!normalized) {
      continue;
    }

    if (normalized.includes("beginner")) {
      return "Beginner";
    }

    if (
      normalized.includes("experience")
      || normalized.includes("experienced")
      || normalized.includes("driving lesson")
    ) {
      return "Experience";
    }
  }

  return "";
}

export function getPdcCategoryFromEnrollment(enrollingFor, trainingMethod, currentCategory = "") {
  const normalizedCurrent = inferPdcCategory(currentCategory);
  if (normalizedCurrent) {
    return normalizedCurrent;
  }

  return inferPdcCategory(enrollingFor, trainingMethod);
}
