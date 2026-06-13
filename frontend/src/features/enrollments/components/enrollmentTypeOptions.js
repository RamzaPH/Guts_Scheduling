// ✅ FIX: Ginawa nating UPPERCASE lahat ng labels
export const ENROLLMENT_TYPE_OPTIONS = [
  { value: "TDC", label: "TDC ENROLLMENT FORM" },
  { value: "PDC", label: "PDC ENROLLMENT FORM" },
  { value: "PROMO", label: "TDC + PDC PROMO ENROLLMENT FORM" },
];

export function getEnrollmentTypeLabel(type) {
  const optionLabel = ENROLLMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label || "ENROLLMENT FORM";
  return optionLabel.toUpperCase();
}