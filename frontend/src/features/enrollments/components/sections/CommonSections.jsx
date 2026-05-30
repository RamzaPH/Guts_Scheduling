import { useEffect, useMemo } from "react";
import { calculateAge } from "../../../../shared/utils/date";
import { FormField, SectionTitle, SelectField } from "../FormField";
import {
  getBarangayOptions,
  getCityOptions,
  getProvinceOptions,
  getRegionOptions,
  getZipCodeByAddressCodes,
} from "../../utils/phLocations";

const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const civilStatusOptions = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widow" },
  { value: "divorced", label: "Divorced" },
  { value: "separated", label: "Separated" },
  { value: "other", label: "Other" },
];

const nationalityOptions = [
  { value: "Filipino", label: "Filipino" },
  { value: "Foreign", label: "Foreign" },
  { value: "Others", label: "Others" },
];

const clientTypeOptions = [
  { value: "GUTS Walk-in Application", label: "GUTS Walk-in Application" },
  { value: "GUTS FB Page Application", label: "GUTS FB Page Application" },
  { value: "Carmona Estates Booking Office", label: "Carmona Estates Booking Office" },
];

const enrollingForOptions = [
  {
    value: "Theoretical Driving Course (TDC 15 hrs Lecture/Seminar) - FOR STUDENT PERMIT APPLICATION",
    label: "Theoretical Driving Course (TDC 15 hrs Lecture/Seminar) - FOR STUDENT PERMIT APPLICATION",
  },
  {
    value: "DEFENSIVE DRIVING SEMINAR (WITH NON PRO/ PRO LICENSE)",
    label: "DEFENSIVE DRIVING SEMINAR (WITH NON PRO/ PRO LICENSE)",
  },
];

const paymentTermsOptions = [
  { value: "full", label: "Full Payment" },
  { value: "installment", label: "Installment" },
  { value: "downpayment", label: "Downpayment" },
  { value: "custom", label: "Custom" },
];

function normalizeValue(value) {
  return String(value || "").trim();
}

function getNationalitySelection(profile) {
  const currentNationality = normalizeValue(profile.nationality);
  const customNationality = normalizeValue(profile.nationality_other);

  if (!currentNationality) {
    return { value: "", customValue: customNationality };
  }

  const presetMatch = nationalityOptions.some((option) => option.value === currentNationality);
  if (presetMatch) {
    return { value: currentNationality, customValue: customNationality };
  }

  return {
    value: "Others",
    customValue: customNationality || currentNationality,
  };
}

export function PersonalInfoSection({ type, form, onFieldChange, promoOfferOptions = [] }) {
  useEffect(() => {
    const birthdate = form.profile.birthdate;
    const age = calculateAge(birthdate);
    if (birthdate && age !== form.profile.age) {
      onFieldChange("profile", "age", age);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.profile.birthdate]);

  const { value: nationalityValue, customValue: nationalityCustomValue } = getNationalitySelection(form.profile);
  const showNationalityOther = nationalityValue === "Others";

  return (
    <>
      {type === "PDC" || type === "TDC" || type === "PROMO" ? <SectionTitle>CLIENT INFORMATION</SectionTitle> : null}
      {type === "PDC" || type === "TDC" || type === "PROMO" ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <SelectField
            label="PROMO OFFER"
            name="promo_offer_id"
            value={form.enrollment.promo_offer_id}
            onChange={(event) => onFieldChange("enrollment", "promo_offer_id", event.target.value)}
            placeholder="Select promo offer"
            options={promoOfferOptions}
          />
          <SelectField
            label="CLIENT TYPE"
            name="client_type"
            value={form.enrollment.client_type}
            onChange={(event) => onFieldChange("enrollment", "client_type", event.target.value)}
            placeholder="Select Client Type"
            options={clientTypeOptions}
            required
          />
        </div>
      ) : null}

      <SectionTitle>PERSONAL INFORMATION</SectionTitle>

      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <FormField
          label="FIRST NAME"
          name="first_name"
          value={form.student.first_name}
          onChange={(event) => onFieldChange("student", "first_name", event.target.value)}
          placeholder="First Name"
          required
        />
        <FormField
          label="MIDDLE NAME"
          name="middle_name"
          value={form.student.middle_name}
          onChange={(event) => onFieldChange("student", "middle_name", event.target.value)}
          placeholder="Middle Name"
          required={type === "TDC" || type === "PDC" || type === "PROMO"}
        />
        <FormField
          label="LAST NAME"
          name="last_name"
          value={form.student.last_name}
          onChange={(event) => onFieldChange("student", "last_name", event.target.value)}
          placeholder="Last Name"
          required
        />
      </div>

      {type === "PDC" ? (
        <>
          <div className="mt-2 grid gap-3 md:grid-cols-4">
            <FormField
              label="BIRTHDAY"
              name="birthdate"
              type="date"
              value={form.profile.birthdate}
              onChange={(event) => onFieldChange("profile", "birthdate", event.target.value)}
              required
            />
            <FormField
              label="BIRTHPLACE"
              name="birthplace"
              value={form.profile.birthplace}
              onChange={(event) => onFieldChange("profile", "birthplace", event.target.value)}
              placeholder="Birthplace"
              required
            />
            <FormField
              label="AGE"
              name="age"
              type="number"
              value={form.profile.age}
              placeholder="Age"
              inputClassName="bg-slate-100 cursor-not-allowed"
              readOnly
              tabIndex={-1}
            />
            <FormField
              label="EMAIL (Gmail, Yahoo Mail, etc.)"
              name="gmail_account"
              value={form.profile.gmail_account}
              onChange={(event) => onFieldChange("profile", "gmail_account", event.target.value)}
              placeholder="Email address"
              required
            />
          </div>

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <SelectField
              label="NATIONALITY"
              name="nationality"
              value={nationalityValue}
              onChange={(event) => onFieldChange("profile", "nationality", event.target.value)}
              placeholder="Select Nationality"
              options={nationalityOptions}
              required
            />
            <SelectField
              label="GENDER"
              name="gender"
              value={form.profile.gender}
              onChange={(event) => onFieldChange("profile", "gender", event.target.value)}
              placeholder="Select Gender"
              options={genderOptions}
              required
            />
          </div>

          {showNationalityOther ? (
            <div className="mt-2 grid gap-3 md:grid-cols-1">
              <FormField
                label="SPECIFY NATIONALITY"
                name="nationality_other"
                value={nationalityCustomValue}
                onChange={(event) => onFieldChange("profile", "nationality_other", event.target.value)}
                placeholder="Type nationality"
                required
              />
            </div>
          ) : null}

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <SelectField
              label="CIVIL STATUS"
              name="civil_status"
              value={form.profile.civil_status}
              onChange={(event) => onFieldChange("profile", "civil_status", event.target.value)}
              placeholder="Select Marital Status"
              options={civilStatusOptions}
              required
            />
            <FormField
              label="CONTACT NUMBER"
              name="phone"
              value={form.student.phone}
              onChange={(event) => onFieldChange("student", "phone", event.target.value)}
              placeholder="Contact Number"
              required
            />
          </div>
        </>
      ) : null}

      {type === "TDC" || type === "PROMO" ? (
        <>
          <div className="mt-2 grid gap-3 md:grid-cols-4">
            <FormField
              label="BIRTHDATE"
              name="birthdate"
              type="date"
              value={form.profile.birthdate}
              onChange={(event) => onFieldChange("profile", "birthdate", event.target.value)}
              required
            />
            <FormField
              label="AGE"
              name="age"
              type="number"
              value={form.profile.age}
              placeholder="Age"
              inputClassName="bg-slate-100 cursor-not-allowed"
              readOnly
              tabIndex={-1}
            />
            <SelectField
              label="NATIONALITY"
              name="nationality"
              value={nationalityValue}
              onChange={(event) => onFieldChange("profile", "nationality", event.target.value)}
              placeholder="Select Nationality"
              options={nationalityOptions}
              required
            />
            <SelectField
              label="GENDER"
              name="gender"
              value={form.profile.gender}
              onChange={(event) => onFieldChange("profile", "gender", event.target.value)}
              placeholder="Select Gender"
              options={genderOptions}
              required
            />
          </div>

          {showNationalityOther ? (
            <div className="mt-2 grid gap-3 md:grid-cols-1">
              <FormField
                label="SPECIFY NATIONALITY"
                name="nationality_other"
                value={nationalityCustomValue}
                onChange={(event) => onFieldChange("profile", "nationality_other", event.target.value)}
                placeholder="Type nationality"
                required
              />
            </div>
          ) : null}
        </>
      ) : null}

      {type === "TDC" || type === "PROMO" ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <FormField
            label="CONTACT NUMBER"
            name="phone"
            value={form.student.phone}
            onChange={(event) => onFieldChange("student", "phone", event.target.value)}
            placeholder="Contact Number"
            required
          />
        </div>
      ) : null}

      {type === "PROMO" ? (
        <>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <FormField
              label="BIRTHPLACE"
              name="birthplace"
              value={form.profile.birthplace}
              onChange={(event) => onFieldChange("profile", "birthplace", event.target.value)}
              placeholder="Birthplace"
              required
            />
            <FormField
              label="EMAIL (Gmail, Yahoo Mail, etc.)"
              name="gmail_account"
              value={form.profile.gmail_account}
              onChange={(event) => onFieldChange("profile", "gmail_account", event.target.value)}
              placeholder="Email address"
              required
            />
          </div>

          <SectionTitle>EMERGENCY CONTACTS</SectionTitle>
          <div className="grid gap-3 md:grid-cols-1">
            <FormField
              label="LTO/LTMS CLIENT ID"
              name="lto_portal_account"
              value={form.extras.lto_portal_account}
              onChange={(event) => onFieldChange("extras", "lto_portal_account", event.target.value)}
              placeholder="LTO/LTMS Client ID"
              required
            />
          </div>
        </>
      ) : null}

      {type === "TDC" ? (
        <>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <SelectField
              label="MARITAL STATUS"
              name="civil_status"
              value={form.profile.civil_status}
              onChange={(event) => onFieldChange("profile", "civil_status", event.target.value)}
              placeholder="Select Marital Status"
              options={civilStatusOptions}
              required
            />
          </div>

          <div className="mt-2 grid gap-3 md:grid-cols-1">
            <FormField
              label="BIRTHPLACE"
              name="birthplace"
              value={form.profile.birthplace}
              onChange={(event) => onFieldChange("profile", "birthplace", event.target.value)}
              placeholder="Birthplace"
              required
            />
          </div>

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <FormField
              label="FB ACCOUNT LINK"
              name="fb_link"
              value={form.profile.fb_link}
              onChange={(event) => onFieldChange("profile", "fb_link", event.target.value)}
              placeholder="FB Account Link"
              required
            />
            <FormField
              label="GMAIL / YMAIL ACCOUNT"
              name="gmail_account"
              value={form.profile.gmail_account}
              onChange={(event) => onFieldChange("profile", "gmail_account", event.target.value)}
              placeholder="Gmail / Ymail Account"
              required
            />
          </div>

          <SectionTitle>EMERGENCY CONTACTS</SectionTitle>
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
              onChange={(event) => onFieldChange("extras", "enrolling_for", event.target.value)}
              placeholder="Select Enrollment Purpose"
              options={enrollingForOptions}
              required
            />
          </div>
        </>
      ) : null}
    </>
  );
}

export function AddressSection({ type, form, onFieldChange }) {
  const regionOptions = useMemo(() => getRegionOptions(), []);
  const provinceOptions = useMemo(() => getProvinceOptions(form.extras.region), [form.extras.region]);
  const cityOptions = useMemo(
    () => getCityOptions(form.extras.region, form.profile.province),
    [form.extras.region, form.profile.province]
  );
  const barangayOptions = useMemo(() => getBarangayOptions(form.profile.city), [form.profile.city]);
  
  // Dito natin kinukuha ang auto zip code mula sa function natin (IDINAGDAG NA ANG BARANGAY)
  const autoZipCode = useMemo(
    () => getZipCodeByAddressCodes(form.extras.region, form.profile.province, form.profile.city, form.profile.barangay),
    [form.extras.region, form.profile.province, form.profile.city, form.profile.barangay]
  );

  useEffect(() => {
    if (!form.profile.city) {
      if (form.profile.zip_code) {
        onFieldChange("profile", "zip_code", "");
      }
      return;
    }

    // Ito ang nagse-set sa form ng nahanap na zip code
    if (autoZipCode && String(form.profile.zip_code || "") !== String(autoZipCode)) {
      onFieldChange("profile", "zip_code", autoZipCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoZipCode, form.profile.city]);

  return (
    <>
      <SectionTitle>ADDRESS</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          label="HOUSE NUMBER / BLDG NAME"
          name="house_number"
          value={form.profile.house_number}
          onChange={(event) => onFieldChange("profile", "house_number", event.target.value)}
          placeholder="House Number / Bldg Name"
          required={type === "PDC" || type === "TDC" || type === "PROMO"}
        />
        <FormField
          label="STREET / PHASE / SUBDIVISION"
          name="street"
          onChange={(event) => onFieldChange("profile", "street", event.target.value)}
          placeholder="Street / Phase / Subdivision"
          required={type === "PDC" || type === "TDC" || type === "PROMO"}
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <SelectField
          label="REGION"
          name="region"
          value={form.extras.region}
          onChange={(event) => onFieldChange("extras", "region", event.target.value)}
          placeholder="Select Region"
          options={regionOptions}
          required
        />
        <SelectField
          label="PROVINCE"
          name="province"
          value={form.profile.province}
          onChange={(event) => onFieldChange("profile", "province", event.target.value)}
          placeholder={form.extras.region ? "Select Province" : "Select region first"}
          options={provinceOptions}
          required
          inputClassName="text-slate-900"
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <SelectField
          label="CITY / MUNICIPALITY"
          name="city"
          value={form.profile.city}
          onChange={(event) => onFieldChange("profile", "city", event.target.value)}
          placeholder={form.profile.province ? "Select City / Municipality" : "Select province first"}
          options={cityOptions}
          required
          inputClassName="text-slate-900"
        />
        <SelectField
          label="BARANGAY / DISTRICT"
          name="barangay"
          value={form.profile.barangay}
          onChange={(event) => onFieldChange("profile", "barangay", event.target.value)}
          placeholder={form.profile.city ? "Select Barangay / District" : "Select city / municipality first"}
          options={barangayOptions}
          required
          inputClassName="text-slate-900"
        />
      </div>

      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <FormField
          label="ZIP CODE"
          name="zip_code"
          value={form.profile.zip_code}
          onChange={(event) => onFieldChange("profile", "zip_code", event.target.value)}
          placeholder="Auto-filled Zip Code"
          required
          // Idinagdag ito para hindi na i-type ng user manually dahil nag-aauto fill na siya
          inputClassName="bg-slate-100 cursor-not-allowed"
          readOnly
          tabIndex={-1}
        />
      </div>
    </>
  );
}

export function FinancialSection({ type, form, onFieldChange, promoOfferOptions = [] }) {
  const promoOfferSelected = Boolean(form.enrollment.promo_offer_id);

  return (
    <>
      {type === "PDC" || type === "TDC" || type === "PROMO" ? <SectionTitle>FINANCIAL DETAILS</SectionTitle> : null}
      {type === "PDC" || type === "TDC" || type === "PROMO" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="PROMO OFFER"
              name="promo_offer_id"
              value={form.enrollment.promo_offer_id}
              onChange={(event) => onFieldChange("enrollment", "promo_offer_id", event.target.value)}
              placeholder="Select promo offer"
              options={promoOfferOptions}
            />
            <FormField
              label="FEE AMOUNT"
              name="fee_amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.enrollment.fee_amount}
              onChange={(event) => onFieldChange("enrollment", "fee_amount", event.target.value)}
              placeholder="0.00"
              readOnly={promoOfferSelected}
            />
          </div>

          {promoOfferSelected ? (
            <p className="mt-2 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-xs text-slate-700">
              Promo offer selected. Fee amount is auto-filled from the promo pricing.
            </p>
          ) : null}

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <SelectField
              label="PAYMENT TERMS"
              name="payment_terms"
              value={form.enrollment.payment_terms}
              onChange={(event) => onFieldChange("enrollment", "payment_terms", event.target.value)}
              placeholder="Select payment terms"
              options={paymentTermsOptions}
            />
            <FormField
              label="PAYMENT REFERENCE NUMBER"
              name="payment_reference_number"
              value={form.enrollment.payment_reference_number}
              onChange={(event) => onFieldChange("enrollment", "payment_reference_number", event.target.value)}
              placeholder="Reference / OR number"
            />
          </div>

          <div className="mt-2 grid gap-3 md:grid-cols-1">
            <FormField
              label="PAYMENT NOTES"
              name="payment_notes"
              value={form.enrollment.payment_notes}
              onChange={(event) => onFieldChange("enrollment", "payment_notes", event.target.value)}
              placeholder="Additional financial notes"
            />
          </div>
        </>
      ) : null}
    </>
  );
}