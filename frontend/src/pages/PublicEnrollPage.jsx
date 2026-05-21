import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { QR_ENROLLMENT_TEMPLATE, buildQrEnrollmentTemplate, resolveQrEnrollmentType } from "../shared/qrEnrollmentTemplate";
import {
  getBarangayOptions,
  getCityOptions,
  getProvinceOptions,
  getRegionOptions,
  getZipCodeByAddressCodes,
} from "../features/enrollments/utils/phLocations";

function createNestedValue(source, path, value) {
  const segments = path.split(".");
  const next = Array.isArray(source) ? [...source] : { ...source };
  let cursor = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const existing = cursor[segment];
    cursor[segment] = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
  return next;
}

function getNestedValue(source, path) {
  if (!path || typeof path !== "string") {
    return undefined;
  }

  return path.split(".").reduce((current, segment) => {
    if (current && typeof current === "object") {
      return current[segment];
    }
    return undefined;
  }, source);
}

const ADDRESS_DROPDOWN_FIELD_NAMES = new Set([
  "extras.region",
  "profile.province",
  "profile.city",
  "profile.barangay",
]);

function isAddressField(fieldName) {
  return ADDRESS_DROPDOWN_FIELD_NAMES.has(fieldName);
}

function getAddressOptions(fieldName, formData) {
  if (fieldName === "extras.region") {
    return getRegionOptions();
  }

  if (fieldName === "profile.province") {
    return getProvinceOptions(formData?.extras?.region);
  }

  if (fieldName === "profile.city") {
    return getCityOptions(formData?.extras?.region, formData?.profile?.province);
  }

  if (fieldName === "profile.barangay") {
    return getBarangayOptions(formData?.profile?.city);
  }

  return [];
}

function FieldControl({ field, value, onChange, formData }) {
  const baseClasses = "mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/10";
  const isContactNumberField = String(field?.name || "").includes("phone") || String(field?.name || "").includes("contact_number");
  const contactInputProps = isContactNumberField
    ? { inputMode: "numeric", maxLength: 11, pattern: "[0-9]*" }
    : {};

   if (field.type === "note") {
     return (
       <div className="mt-2 w-full rounded-2xl border border-[#d9c9a0] bg-white px-4 py-3 text-sm text-slate-600">
         {field.content}
       </div>
     );
   }

   if (field.name === "profile.zip_code") {
    return (
      <input
        name={field.name}
        type="text"
        value={value ?? ""}
        onChange={onChange}
        required={field.required}
        readOnly
        className={`${baseClasses} bg-slate-100 cursor-not-allowed`}
        tabIndex={-1}
      />
    );
  }

  if (isAddressField(field.name) && field.name !== "profile.zip_code") {
    const options = getAddressOptions(field.name, formData);
    const isDisabled = (field.name === "profile.province" && !formData?.extras?.region)
      || (field.name === "profile.city" && !formData?.profile?.province)
      || (field.name === "profile.barangay" && !formData?.profile?.city);

    return (
      <select
        name={field.name}
        value={value ?? ""}
        onChange={onChange}
        required={field.required}
        className={baseClasses}
        disabled={isDisabled}
      >
        <option value="">
          {field.name === "profile.province"
            ? (formData?.extras?.region ? "Select Province" : "Select region first")
            : field.name === "profile.city"
              ? (formData?.profile?.province ? "Select City / Municipality" : "Select province first")
              : field.name === "profile.barangay"
                ? (formData?.profile?.city ? "Select Barangay / District" : "Select city / municipality first")
                : "Select..."}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        name={field.name}
        value={value ?? ""}
        onChange={onChange}
        required={field.required}
        rows={4}
        readOnly={field.readOnly}
        className={baseClasses}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        name={field.name}
        value={value ?? ""}
        onChange={onChange}
        required={field.required}
        disabled={field.disabled}
        className={baseClasses}
      >
        <option value="">Select...</option>
        {(field.options || []).map((option) => {
          const normalizedOption = typeof option === "string" ? { value: option, label: option } : option;

          return (
            <option key={normalizedOption.value} value={normalizedOption.value}>
              {normalizedOption.label}
            </option>
          );
        })}
      </select>
    );
  }

  return (
    <input
      name={field.name}
        type={isContactNumberField ? "tel" : (field.type || "text")}
      value={value ?? ""}
      onChange={onChange}
      required={field.required}
      readOnly={field.readOnly}
        {...contactInputProps}
      className={baseClasses}
    />
  );
}

function clearDependentAddressFields(name, current) {
  let next = current;

  if (name === "extras.region") {
    next = createNestedValue(next, "profile.province", "");
    next = createNestedValue(next, "profile.city", "");
    next = createNestedValue(next, "profile.barangay", "");
    next = createNestedValue(next, "profile.zip_code", "");
  } else if (name === "profile.province") {
    next = createNestedValue(next, "profile.city", "");
    next = createNestedValue(next, "profile.barangay", "");
    next = createNestedValue(next, "profile.zip_code", "");
  } else if (name === "profile.city") {
    next = createNestedValue(next, "profile.barangay", "");
    next = createNestedValue(next, "profile.zip_code", "");
  }

  return next;
}

function getAutoZipCode(formData) {
  return getZipCodeByAddressCodes(
    formData?.extras?.region,
    formData?.profile?.province,
    formData?.profile?.city,
    formData?.profile?.barangay
  );
}

function normalizeBooleanValue(value) {
  return value === true || value === "true";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(numeric);
}

function buildPromoOption(offer) {
  const discounted = formatMoney(offer?.discounted_price);
  const fixed = formatMoney(offer?.fixed_price);
  const priceLabel = discounted ? ` - ${discounted}` : fixed ? ` - ${fixed}` : "";

  return {
    value: String(offer.id),
    label: `${offer.name}${priceLabel}`,
  };
}

function normalizeTemplate(template) {
  if (!template || typeof template !== "object") {
    return QR_ENROLLMENT_TEMPLATE;
  }

  // If template already has sections, use it as-is (preserve server-provided structure)
  if (Array.isArray(template.sections) && template.sections.length > 0) {
    return {
      ...QR_ENROLLMENT_TEMPLATE,
      ...template,
      sections: template.sections,
    };
  }

  // Try to infer type and rebuild if needed
  const enrollmentType = resolveQrEnrollmentType(template);
  if (enrollmentType) {
    return buildQrEnrollmentTemplate(enrollmentType);
  }

  if (Array.isArray(template.fields)) {
    return {
      ...QR_ENROLLMENT_TEMPLATE,
      ...template,
      sections: [
        {
          title: "Enrollment",
          description: "Basic fields supplied by the QR code.",
          fields: template.fields,
        },
      ],
    };
  }

  return QR_ENROLLMENT_TEMPLATE;
}

async function readApiBody(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    if (!text) return null;
    return { error: text };
  } catch {
    return null;
  }
}

export default function PublicEnrollPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [template, setTemplate] = useState(QR_ENROLLMENT_TEMPLATE);
  const [formData, setFormData] = useState({});
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitState, setSubmitState] = useState("idle");
  const [promoOptions, setPromoOptions] = useState([]);
  const [showPromoPrompt, setShowPromoPrompt] = useState(false);
  const [wantsPromo, setWantsPromo] = useState(null); // null = unanswered, true/false
  const [selectedPromos, setSelectedPromos] = useState([]);
  const [promoConfirmed, setPromoConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplate() {
      if (!token) {
        setLoading(false);
        setLoadError("Missing QR token.");
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`/api/enroll?token=${encodeURIComponent(token)}`);
        const data = await readApiBody(response);

        if (!response.ok) {
          throw new Error(data?.error || `Unable to load QR form (${response.status}).`);
        }

        let loadedPromoOptions = [];
        try {
          const promoResponse = await fetch(`/api/enroll/promo-offers?token=${encodeURIComponent(token)}`);
          const promoData = await readApiBody(promoResponse);
          if (promoResponse.ok && Array.isArray(promoData)) {
            loadedPromoOptions = promoData.map(buildPromoOption);
          }
        } catch {
          loadedPromoOptions = [];
        }

        // Fetch schedule options (instructors and vehicles)
        let scheduleOptions = { instructors: [], vehicles: [] };
        try {
          const scheduleResponse = await fetch(`/api/enroll/schedule-options?token=${encodeURIComponent(token)}`);
          const scheduleData = await readApiBody(scheduleResponse);
          if (scheduleResponse.ok && scheduleData) {
            scheduleOptions = scheduleData;
          }
        } catch {
          scheduleOptions = { instructors: [], vehicles: [] };
        }

        // Enrich template with schedule options
        let enrichedTemplate = normalizeTemplate(data.template);
        if (enrichedTemplate.sections && Array.isArray(enrichedTemplate.sections)) {
          enrichedTemplate.sections = enrichedTemplate.sections.map((section) => {
            if (section.fields && Array.isArray(section.fields)) {
              section.fields = section.fields.map((field) => {
                if (field.name === "schedule.instructor_id" || field.name === "schedule.care_of_instructor_id") {
                  return { ...field, options: scheduleOptions.instructors };
                }
                if (field.name === "schedule.vehicle_id") {
                  return { ...field, options: scheduleOptions.vehicles };
                }
                return field;
              });
            }
            return section;
          });
        }

        if (!cancelled) {
          setTemplate(enrichedTemplate);
          setPromoOptions(loadedPromoOptions);
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || "Unable to load QR form.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleChange(event) {
    const { name, value } = event.target;
    const normalizedValue = String(name || "").includes("phone") || String(name || "").includes("contact_number")
      ? value.replace(/\D/g, "").slice(0, 11)
      : value;
    setFormData((current) => {
      let next = createNestedValue(current, name, normalizedValue);
      next = clearDependentAddressFields(name, next);

      if (name === "extras.region" || name === "profile.province" || name === "profile.city" || name === "profile.barangay") {
        next = createNestedValue(next, "profile.zip_code", getAutoZipCode(next));
      }

      // Auto-calculate age from birthdate
      if (name === "profile.birthdate" && normalizedValue) {
        const birthDate = new Date(normalizedValue);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        next = createNestedValue(next, "profile.age", String(age));
      }

      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // If we have promo offers and the user hasn't been prompted yet,
    // show the promo prompt modal instead of immediately submitting.
    if (Array.isArray(promoOptions) && promoOptions.length > 0 && !promoConfirmed) {
      setShowPromoPrompt(true);
      return;
    }
    const payload = buildPayload();
    if (!payload) return; // buildPayload sets status when invalid
    await submitPayload(payload);
  }

  function buildPayload() {
    setSubmitState("submitting");
    setStatus("Submitting your enrollment...");

    const promoPdcEnabled = normalizeBooleanValue(formData.promo_schedule_pdc?.enabled);

    const payload = {
      ...formData,
      student: {
        ...formData.student,
        email: formData.student?.email || formData.profile?.gmail_account || "",
      },
      enrollment_type: template?.enrollment_type || formData.enrollment_type,
      enrollment: {
        ...(formData.enrollment || {}),
        promo_offer_id: formData.enrollment?.promo_offer_id ? Number(formData.enrollment.promo_offer_id) : null,
        additional_promo_offer_ids: Array.isArray(selectedPromos) && selectedPromos.length > 0 ? [Number(selectedPromos[0])] : undefined,
        is_already_driver: normalizeBooleanValue(formData.enrollment?.is_already_driver),
        enrollment_channel: "qr_public",
      },
      promo_schedule_pdc: {
        ...(formData.promo_schedule_pdc || {}),
        enabled: promoPdcEnabled,
      },
      promo_schedule:
        (template?.enrollment_type || formData.enrollment_type) === "PROMO"
          ? {
              enabled: true,
              tdc: {
                ...(formData.promo_schedule_tdc || {}),
                enabled: true,
              },
              pdc: {
                ...(formData.promo_schedule_pdc || {}),
                enabled: promoPdcEnabled,
              },
            }
          : undefined,
    };

    if (payload.enrollment_type === "PROMO") {
      if (!payload.promo_schedule?.tdc?.schedule_date) {
        setSubmitState("idle");
        setStatus("Please provide the desired TDC date.");
        return null;
      }

      if (payload.promo_schedule?.pdc?.enabled && !payload.promo_schedule?.pdc?.schedule_date) {
        setSubmitState("idle");
        setStatus("Please provide the desired PDC date when choosing Schedule Now.");
        return null;
      }
    }

    return payload;
  }

  async function submitPayload(payload) {
    setSubmitState("submitting");
    setStatus("Submitting your enrollment...");

    try {
      const response = await fetch("/api/enroll/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, data: payload }),
      });

      const data = await readApiBody(response);

      if (!response.ok) {
        throw new Error(data?.error || `Submission failed (${response.status}).`);
      }

      setSubmitState("done");
      setStatus("Submitted successfully. Your form is now waiting for sub-admin approval.");
    } catch (error) {
      setSubmitState("idle");
      setStatus(error?.message || "Submission failed.");
    }
  }

  const sections = useMemo(() => {
    const sourceSections = template?.sections || [];
    const processedSections = [];
    const effectiveEnrollmentType = resolveQrEnrollmentType(template);
    const isPDCScheduleNow = formData.promo_schedule_pdc?.enabled === "true" || formData.promo_schedule_pdc?.enabled === true;

    for (const section of sourceSections) {
      if ((effectiveEnrollmentType === "TDC" || effectiveEnrollmentType === "PDC") && (section.title === "DRIVING INFORMATION" || section.title === "Schedule Session")) {
        continue;
      }

      let fields = (section.fields || []).map((field) => {
        if (field?.name === "enrollment.promo_offer_id" && field?.type === "select") {
          return {
            ...field,
            options: promoOptions,
          };
        }
        return field;
      });

      // For PROMO: hide PDC COURSE INFORMATION and PDC Schedule Session unless "Schedule Now" is selected
      if (template?.enrollment_type === "PROMO") {
        if ((section.title === "PDC COURSE INFORMATION" || section.title === "PDC Schedule Session") && !isPDCScheduleNow) {
          // Skip these sections if Schedule Later is selected
          continue;
        }
      }

      // For PDC Schedule Session, hide the date field when "Schedule Later" is selected
      if (section.title === "PDC Schedule Session" && (formData.promo_schedule_pdc?.enabled === "false" || formData.promo_schedule_pdc?.enabled === false)) {
        fields = fields.filter(field => field.name !== "promo_schedule_pdc.schedule_date");
      }

      processedSections.push({
        ...section,
        fields,
      });
    }

    return processedSections;
  }, [template, promoOptions, formData]);

  const promoModalRef = useRef(null);

  useEffect(() => {
    if (showPromoPrompt) {
      try {
        window.scrollTo({ top: 0, behavior: "auto" });
      } catch (e) {
        void e; // ignore scroll errors in some browsers
      }
      setTimeout(() => {
        try {
          if (promoModalRef.current) {
            promoModalRef.current.scrollIntoView({ block: "center" });
            promoModalRef.current.focus?.();
          }
        } catch (e) {
          void e; // ignore focus/scrollIntoView errors
        }
      }, 60);
    }
  }, [showPromoPrompt]);

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4">
        <div className="w-full rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-center shadow-sm card-light">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-rose-700">QR Enrollment</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Missing QR token</h1>
          <p className="mt-2 text-sm text-slate-600">Open the public enrollment link from the QR code or ask the admin for the correct token.</p>
        </div>
      </div>
    );
  }

  if (!loading && loadError) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4">
        <div className="w-full rounded-[28px] border border-rose-200 bg-rose-50 p-8 text-center shadow-sm card-light">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-rose-700">QR Enrollment</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Unable to open form</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-qr-enrollment-page min-h-screen bg-[radial-gradient(circle_at_top,_rgba(128,0,0,0.08),_transparent_28%),linear-gradient(180deg,_#faf7f5_0%,_#ffffff_42%,_#f8fafc_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex flex-col-reverse gap-6 lg:grid lg:max-w-6xl lg:grid-cols-[1.15fr_0.85fr]">
        <section className="public-qr-surface rounded-[32px] border border-slate-200 bg-white/95 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur lg:order-1 card-light">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-[#800000]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#800000]">
                <ShieldCheck size={14} />
                Public QR Enrollment
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {template?.name || "Enrollment Form"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Fill out the form once. It will go to the sub-admin for review, then continue to payment after approval.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">Status</div>
              <div>{submitState === "done" ? "Submitted" : token ? "Open" : "Locked"}</div>
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 card-light">
              <Loader2 size={16} className="animate-spin" />
              Loading QR template...
            </div>
          ) : null}

          {!loading ? (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              {sections.map((section) => {
                // Filter fields conditionally based on form state
                let fieldsToRender = section.fields || [];
                
                // For PDC Schedule Session, hide the desired date field when "Schedule Later" is selected
                // The enabled value is "false" when Schedule Later is selected
                if (section.title === "PDC Schedule Session" && (formData.promo_schedule_pdc?.enabled === "Schedule Later" || formData.promo_schedule_pdc?.enabled === false || formData.promo_schedule_pdc?.enabled === "false")) {
                  fieldsToRender = fieldsToRender.filter(field => field.name !== "promo_schedule_pdc.schedule_date");
                }
                
                return (
                <div key={section.title}>
                  <div className="public-qr-section rounded-[28px] border border-slate-200 bg-slate-50 p-5 card-light">
                    <div className="flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-slate-950">{section.title}</h2>
                        {section.description ? <p className="text-sm text-slate-600">{section.description}</p> : null}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {fieldsToRender?.length || 0} fields
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {fieldsToRender.map((field) => (
                        <label key={field.name || field.content} className={field.type === "textarea" || field.type === "note" ? "md:col-span-2" : ""}>
                          {field.type !== "note" ? (
                            <span className="text-sm font-semibold text-slate-700">
                              {field.label}
                              {field.required ? <span className="ml-1 text-[#800000]">*</span> : null}
                            </span>
                          ) : null}
                          <FieldControl
                            field={field}
                            value={field.type === "note" ? undefined : getNestedValue(formData, field.name)}
                            onChange={handleChange}
                            formData={formData}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Show message when Schedule Later is selected in PROMO forms */}
                  {template?.enrollment_type === "PROMO" && section.title === "PDC Start Option" && formData.promo_schedule_pdc?.enabled === "false" && (
                    <div className="mt-4 rounded-2xl border border-[#d9c9a0] bg-white px-4 py-3 text-sm text-slate-600 card-light">
                      PDC is set to Schedule Later. PDC course information and schedule fields are hidden for now and can be filled once Schedule PDC Now is selected.
                    </div>
                  )}
                </div>
                );
              })}

              {status ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${submitState === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"} card-light`}>
                  {submitState === "done" ? <CheckCircle2 className="mr-2 inline-block" size={16} /> : null}
                  {status}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500">
                  By submitting, you confirm that the information is accurate and that you understand approval is required before payment.
                </p>
                <button
                  type="submit"
                  disabled={submitState === "submitting" || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#800000] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(128,0,0,0.22)] transition hover:bg-[#680000] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitState === "submitting" ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Submit enrollment
                </button>
              </div>
            </form>
          ) : null}

          {/* Promo confirmation modal shown when user hits submit */}
          {showPromoPrompt ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={() => { setShowPromoPrompt(false); setWantsPromo(null); }} />
              <div ref={promoModalRef} tabIndex={-1} className="relative mx-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
                <h3 className="text-lg font-bold">Would you like to add an additional promo?</h3>
                <p className="mt-2 text-sm text-slate-600">Choose one promo from the website list, including promos that apply to this enrollment type.</p>

                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setWantsPromo(true); }}
                    className={`rounded-lg px-4 py-2 ${wantsPromo === true ? "bg-[#800000] text-white" : "border bg-white text-slate-700"}`}
                  >Yes</button>
                  <button
                    type="button"
                    onClick={() => { setWantsPromo(false); setSelectedPromos([]); }}
                    className={`rounded-lg px-4 py-2 ${wantsPromo === false ? "bg-[#800000] text-white" : "border bg-white text-slate-700"}`}
                  >No</button>
                </div>

                {wantsPromo ? (
                  <div className="mt-4 max-h-[60vh] overflow-auto pr-1">
                    <div className="text-sm text-slate-700">Select a promo to add:</div>
                    <div className="mt-2 grid gap-2">
                      {promoOptions.map((opt) => {
                        const isSelected = selectedPromos.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSelectedPromos([opt.value])}
                            className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${isSelected ? "border-[#800000] bg-[#800000]/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                              <div className="text-xs text-slate-500">{opt.is_applicable ? "Applicable to this form" : "Selectable as an additional promo"}</div>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${opt.is_applicable ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {isSelected ? "Selected" : "Choose"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowPromoPrompt(false); setWantsPromo(null); }}
                    className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700"
                  >Cancel</button>
                  <button
                    type="button"
                    disabled={wantsPromo && selectedPromos.length === 0}
                    onClick={async () => {
                      // Confirm choice and proceed to submit directly to avoid
                      // racing state updates that required a second click.
                      setPromoConfirmed(true);
                      setShowPromoPrompt(false);
                      setStatus("");
                      if (!wantsPromo) setSelectedPromos([]);

                      const payload = buildPayload();
                      if (!payload) return;
                      await submitPayload(payload);
                    }}
                    className="rounded-lg bg-[#800000] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >Continue</button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-6 lg:order-2">
          <div className="public-qr-sidebar-card rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">Workflow</p>
            <ol className="mt-4 space-y-3 text-sm text-slate-200">
              <li className="rounded-2xl border border-white/10 bg-white/5 p-4">1. Scan the QR code from the admin desk or flyer.</li>
              <li className="rounded-2xl border border-white/10 bg-white/5 p-4">2. Complete the form on your own device.</li>
              <li className="rounded-2xl border border-white/10 bg-white/5 p-4">3. Wait for sub-admin approval, then proceed to payment.</li>
            </ol>
          </div>

          <div className="public-qr-sidebar-card rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm card-light">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">What happens next</p>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <div>
                <div className="font-semibold text-slate-900">Review</div>
                <p>The QR submission goes to the sub-admin queue with the linked QR code record.</p>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Approval</div>
                <p>Once approved, the enrollment status becomes confirmed and the payment handoff opens.</p>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Payment</div>
                <p>The payment page records the first transaction and closes out the enrollment when fully paid.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
