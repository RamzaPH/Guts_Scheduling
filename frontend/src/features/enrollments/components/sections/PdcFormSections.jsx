import { FormField, SectionTitle, SelectField } from "../FormField";

const yesNoOptions = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const vehicleTypeOptions = [
  { value: "DL Codes A - Motorcycle (2 wheels)", label: "DL Codes A - Motorcycle (2 wheels)" },
  { value: "DL Codes A1 - Tricycle (3 wheels)", label: "DL Codes A1 - Tricycle (3 wheels)" },
  { value: "DL Codes B - Car/Sedan (4 wheels - 8 seaters below)", label: "DL Codes B - Car/Sedan (4 wheels - 8 seaters below)" },
  { value: "DL Codes B1 - L300/Van (4 wheels - 9 seaters above)", label: "DL Codes B1 - L300/Van (4 wheels - 9 seaters above)" },
  { value: "Other", label: "Other" },
];

const transmissionTypeOptions = [
  { value: "AUTOMATIC TRANSMISSION (A/T) not allowed to drive M/T", label: "AUTOMATIC TRANSMISSION (A/T) not allowed to drive M/T" },
  { value: "MANUAL TRANSMISSION (M/T) allowed to drive A/T", label: "MANUAL TRANSMISSION (M/T) allowed to drive A/T" },
  { value: "Other", label: "Other" },
];

const enrollingForOptions = [
  { value: "PDC Experienced", label: "PDC Experienced" },
  { value: "PDC Beginner", label: "PDC Beginner" },
  { value: "PDC Additional Restriction / DL Codes - Experienced", label: "PDC Additional Restriction / DL Codes - Experienced" },
  { value: "PDC Additional Restriction / DL Codes- Beginner", label: "PDC Additional Restriction / DL Codes- Beginner" },
  { value: "DRIVING LESSON ( w/ license already)", label: "DRIVING LESSON ( w/ license already)" },
  { value: "Other", label: "Other" },
];

const modeOfTrainingOptions = [
  {
    value: "Experienced (w/ experience in driving/Applicable para sa marunong na talaga magdrive)",
    label: "Experienced (w/ experience in driving/Applicable para sa marunong na talaga magdrive)",
  },
  {
    value: "BEGINNER ( w/out Experience in Driving / Driving Enhancement/ Magpapaturo pa magdrive)",
    label: "BEGINNER ( w/out Experience in Driving / Driving Enhancement/ Magpapaturo pa magdrive)",
  },
  {
    value: "ADD RC/DL Codes -EXPERIENCED ( Para sa mga magpapadagdag ng DL Codes na marunong na talaga magdrive)",
    label: "ADD RC/DL Codes -EXPERIENCED ( Para sa mga magpapadagdag ng DL Codes na marunong na talaga magdrive)",
  },
  {
    value: "ADD RC/DL Codes -BEGINNER ( Para sa mga magpapadagdag ng DL Codes na Magpapaturo pa mag drive)",
    label: "ADD RC/DL Codes -BEGINNER ( Para sa mga magpapadagdag ng DL Codes na Magpapaturo pa mag drive)",
  },
  {
    value: "DRIVING LESSON ( Para sa mga may lisensya na at may DLCodes na B/B1 na Magpapaturo pa magdrive)",
    label: "DRIVING LESSON ( Para sa mga may lisensya na at may DLCodes na B/B1 na Magpapaturo pa magdrive)",
  },
  { value: "Other", label: "Other" },
];

const drivingSchoolOptions = [
  { value: "GUTS Driving School", label: "GUTS Driving School" },
  { value: "Other", label: "Other" },
];

const pdcClassificationOptions = [
  { value: "Beginner", label: "Beginner" },
  { value: "Experience", label: "Experience" },
];

const tdcSourceOptions = [
  { value: "guts", label: "GUTS Driving School" },
  { value: "external", label: "External Driving School" },
];

function inferPdcCategory(value) {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("beginner")) {
    return "Beginner";
  }

  if (normalized.includes("experience") || normalized.includes("experienced") || normalized.includes("driving lesson")) {
    return "Experience";
  }

  return "";
}

export default function PdcFormSections({ form, onFieldChange }) {
  const isExperienceCategory = String(form.enrollment.pdc_category || "").toLowerCase() === "experience";
  const isDriver = form.enrollment.is_already_driver === true;

  const handlePdcSelectionChange = (field, value) => {
    const inferredCategory = inferPdcCategory(value);
    onFieldChange("extras", field, value);

    if (inferredCategory) {
      onFieldChange("enrollment", "pdc_category", inferredCategory);
    }
  };

  return (
    <>
      <SectionTitle>EMERGENCY & CREDENTIALS</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          label="EMERGENCY CONTACT PERSON"
          name="emergency_contact_person"
          value={form.extras.emergency_contact_person}
          onChange={(event) => onFieldChange("extras", "emergency_contact_person", event.target.value)}
          placeholder="Emergency Contact Person"
          required
        />
        <FormField
          label="EMERGENCY CONTACT NUMBER"
          name="emergency_contact_number"
          value={form.extras.emergency_contact_number}
          onChange={(event) => onFieldChange("extras", "emergency_contact_number", event.target.value)}
          placeholder="Emergency Contact Number"
          required
        />
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-1">
        <FormField
          label="LTO/LTMS CLIENT ID"
          name="lto_portal_account"
          value={form.extras.lto_portal_account}
          onChange={(event) => onFieldChange("extras", "lto_portal_account", event.target.value)}
          placeholder="LTO/LTMS Client ID"
          required
        />
      </div>

      <SectionTitle>COURSE INFORMATION</SectionTitle>
      <div className="grid gap-3 md:grid-cols-1">
        <SelectField
          label="ENROLLING FOR"
          name="enrolling_for"
          value={form.extras.enrolling_for}
          onChange={(event) => handlePdcSelectionChange("enrolling_for", event.target.value)}
          placeholder="Select enrollment purpose"
          options={enrollingForOptions}
          required
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-1">
        <SelectField
          label="PDC CLASSIFICATION"
          name="pdc_category"
          value={form.enrollment.pdc_category}
          onChange={(event) => onFieldChange("enrollment", "pdc_category", event.target.value)}
          placeholder="Select Beginner or Experience"
          options={pdcClassificationOptions}
          required
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-1">
        <SelectField
          label="TDC SOURCE"
          name="tdc_source"
          value={form.enrollment.tdc_source || "guts"}
          onChange={(event) => onFieldChange("enrollment", "tdc_source", event.target.value)}
          placeholder="Select TDC source"
          options={tdcSourceOptions}
          required
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-1">
        <SelectField
          label="MODE OF TRAINING"
          name="training_method"
          value={form.enrollment.training_method}
          onChange={(event) => {
            onFieldChange("enrollment", "training_method", event.target.value);
            const inferredCategory = inferPdcCategory(event.target.value);
            if (inferredCategory) {
              onFieldChange("enrollment", "pdc_category", inferredCategory);
            }
          }}
          placeholder="Select mode of training"
          options={modeOfTrainingOptions}
          required
        />
      </div>

      <p className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-sm text-slate-700">
        IMPORTANT REMINDERS FOR PDC STUDENTS: PER DL CODES PO ANG ATING PDC. EVERY DL CODES MAGKAKAIBA ANG RATES AND SCHEDULE.
      </p>

      {isExperienceCategory ? (
        <>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <SelectField
                label="MARUNONG KA NA BANG MAGMANEHO, MANEUVERING/PARKING?"
              name="is_already_driver"
              value={String(form.enrollment.is_already_driver)}
              onChange={(event) => onFieldChange("enrollment", "is_already_driver", event.target.value)}
                placeholder="Select Yes or No"
              options={yesNoOptions}
              inputClassName="text-slate-900"
              required
            />
          </div>

          {isDriver ? (
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <SelectField
                label="ANONG SASAKYAN ANG IMAMANEHO?"
                name="target_vehicle"
                value={form.enrollment.target_vehicle}
                onChange={(event) => onFieldChange("enrollment", "target_vehicle", event.target.value)}
                placeholder="Select vehicle"
                options={vehicleTypeOptions}
                inputClassName="text-slate-900"
                required
              />
              <SelectField
                label="ANONG KLASE NG TRANSMISSION?"
                name="transmission_type"
                value={form.enrollment.transmission_type}
                onChange={(event) => onFieldChange("enrollment", "transmission_type", event.target.value)}
                placeholder="Select transmission"
                options={transmissionTypeOptions}
                inputClassName="text-slate-900"
                required
              />
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-sm text-slate-700">
              PDC Experience requires a driver with selected vehicle and transmission details.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-sm text-slate-700">
          Vehicle and transmission details are required only for PDC classification: Experience.
        </p>
      )}

      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <SelectField
          label="Driving School where you have taken your TDC"
          name="driving_school_tdc"
          value={form.extras.driving_school_tdc}
          onChange={(event) => onFieldChange("extras", "driving_school_tdc", event.target.value)}
          placeholder="Select driving school"
          options={drivingSchoolOptions}
          required
        />
        <FormField
          label="Year you completed your TDC"
          name="year_completed_tdc"
          value={form.extras.year_completed_tdc}
          onChange={(event) => onFieldChange("extras", "year_completed_tdc", event.target.value)}
          placeholder="Enter year completed"
          required
        />
      </div>

      {form.extras.driving_school_tdc === "Other" ? (
        <div className="mt-2 grid gap-3 md:grid-cols-1">
          <FormField
            label="Name of Driving School"
            name="driving_school_tdc_other"
            value={form.extras.driving_school_tdc_other || ""}
            onChange={(event) => onFieldChange("extras", "driving_school_tdc_other", event.target.value)}
            placeholder="Enter driving school name"
            required
          />
        </div>
      ) : null}
    </>
  );
}
