import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import {
  findBarangayCodeByName,
  findCityCodeByName,
  findProvinceCodeByName,
  findRegionCodeByLabel,
  getBarangayLabel,
  getBarangayOptions,
  getCityLabel,
  getCityOptions,
  getProvinceLabel,
  getProvinceOptions,
  getRegionLabel,
  getRegionOptions,
  getZipCodeByAddressCodes,
} from "../../enrollments/utils/phLocations";

const genderOptions = ["male", "female", "prefer_not_to_say"];
const nationalityOptions = ["Filipino", "Foreign", "Others"];
const civilStatusOptions = ["single", "married", "widowed", "divorced", "separated", "other"];

export default function EditStudentModal({ student, form, onChange, onClose, onSubmit, isPending }) {
  const modalViewportStyle = {
    left: "var(--app-sidebar-width, 0px)",
    width: "calc(100vw - var(--app-sidebar-width, 0px))",
  };

  const [regionCode, setRegionCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [nationalitySelection, setNationalitySelection] = useState("");
  const [nationalityOther, setNationalityOther] = useState("");

  const handleFieldChange = (section, field, value) => {
    onChange((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  };

  const regionOptions = useMemo(() => getRegionOptions(), []);
  const provinceOptions = useMemo(() => getProvinceOptions(regionCode), [regionCode]);
  const cityOptions = useMemo(() => getCityOptions(regionCode, provinceCode), [regionCode, provinceCode]);
  const barangayOptions = useMemo(() => getBarangayOptions(cityCode), [cityCode]);
  const autoZipCode = useMemo(() => getZipCodeByAddressCodes(regionCode, provinceCode, cityCode), [regionCode, provinceCode, cityCode]);

  useEffect(() => {
    let cancelled = false;

    if (!student || !form?.profile) {
      queueMicrotask(() => {
        if (cancelled) return;
        setRegionCode("");
        setProvinceCode("");
        setCityCode("");
        setBarangayCode("");
        setNationalitySelection("");
        setNationalityOther("");
      });
      return () => {
        cancelled = true;
      };
    }

    const nextRegionCode = findRegionCodeByLabel(form.profile.region);
    const nextProvinceCode = findProvinceCodeByName(nextRegionCode, form.profile.province);
    const nextCityCode = findCityCodeByName(nextRegionCode, nextProvinceCode, form.profile.city);
    const nextBarangayCode = findBarangayCodeByName(nextCityCode, form.profile.barangay);

    queueMicrotask(() => {
      if (cancelled) return;
      setRegionCode(nextRegionCode);
      setProvinceCode(nextProvinceCode);
      setCityCode(nextCityCode);
      setBarangayCode(nextBarangayCode);

      const currentNationality = String(form.profile.nationality || "").trim();
      if (currentNationality === "Filipino" || currentNationality === "Foreign") {
        setNationalitySelection(currentNationality);
        setNationalityOther("");
      } else if (currentNationality) {
        setNationalitySelection("Others");
        setNationalityOther(currentNationality);
      } else {
        setNationalitySelection("");
        setNationalityOther("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [student, form.profile]);

  useEffect(() => {
    if (!cityCode) {
      if (form.profile.zip_code) {
        handleFieldChange("profile", "zip_code", "");
      }
      return;
    }

    if (autoZipCode && String(form.profile.zip_code || "") !== String(autoZipCode)) {
      handleFieldChange("profile", "zip_code", autoZipCode);
    }
    // FIX: Nilagyan natin ng ignore comment ang susunod na linya para hindi mag-warning ang ESLint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoZipCode, cityCode, form.profile.zip_code]);

  if (!student) return null;

  const handleRegionChange = (value) => {
    setRegionCode(value);
    setProvinceCode("");
    setCityCode("");
    setBarangayCode("");

    handleFieldChange("profile", "region", getRegionLabel(value));
    handleFieldChange("profile", "province", "");
    handleFieldChange("profile", "city", "");
    handleFieldChange("profile", "barangay", "");
  };

  const handleProvinceChange = (value) => {
    setProvinceCode(value);
    setCityCode("");
    setBarangayCode("");

    handleFieldChange("profile", "province", getProvinceLabel(regionCode, value));
    handleFieldChange("profile", "city", "");
    handleFieldChange("profile", "barangay", "");
  };

  const handleCityChange = (value) => {
    setCityCode(value);
    setBarangayCode("");

    handleFieldChange("profile", "city", getCityLabel(regionCode, provinceCode, value));
    handleFieldChange("profile", "barangay", "");
  };

  const handleBarangayChange = (value) => {
    setBarangayCode(value);
    handleFieldChange("profile", "barangay", getBarangayLabel(cityCode, value));
  };

  const handleNationalityChange = (value) => {
    setNationalitySelection(value);
    if (value === "Others") {
      handleFieldChange("profile", "nationality", nationalityOther);
      return;
    }

    setNationalityOther("");
    handleFieldChange("profile", "nationality", value);
  };

  const handleNationalityOtherChange = (value) => {
    setNationalityOther(value);
    handleFieldChange("profile", "nationality", value);
  };

  const sectionHeadingClass = "mb-2 text-xs font-bold uppercase tracking-wide text-[#800000]";
  const inputClass =
    "rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-500 outline-none transition focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/15";

  return (
    <div style={modalViewportStyle} className="fixed inset-y-0 right-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#800000] px-5 py-4 text-white">
          <div>
            <h3 className="text-lg font-semibold">Edit Student</h3>
            <p className="text-xs text-white/80">Update student and profile details</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="thin-scrollbar max-h-[75vh] overflow-y-auto px-5 py-4">
          <h4 className={sectionHeadingClass}>Personal Information</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.student.first_name}
              onChange={(event) => handleFieldChange("student", "first_name", event.target.value)}
              placeholder="First Name"
              required
              className={inputClass}
            />
            <input
              value={form.student.middle_name}
              onChange={(event) => handleFieldChange("student", "middle_name", event.target.value)}
              placeholder="Middle Name"
              className={inputClass}
            />
            <input
              value={form.student.last_name}
              onChange={(event) => handleFieldChange("student", "last_name", event.target.value)}
              placeholder="Last Name"
              required
              className={inputClass}
            />
            <input
              value={form.student.phone}
              onChange={(event) => handleFieldChange("student", "phone", event.target.value)}
              placeholder="Contact Number"
              className={inputClass}
            />
          </div>

          <h4 className={`${sectionHeadingClass} mt-5`}>Profile</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={form.profile.birthdate}
              onChange={(event) => handleFieldChange("profile", "birthdate", event.target.value)}
              type="date"
              className={inputClass}
            />
            <input
              value={form.profile.age}
              onChange={(event) => handleFieldChange("profile", "age", event.target.value)}
              placeholder="Age"
              type="number"
              className={inputClass}
            />
            <select
              value={form.profile.gender || ""}
              onChange={(event) => handleFieldChange("profile", "gender", event.target.value)}
              className={inputClass}
            >
              <option value="">Select Gender</option>
              {genderOptions.map((option) => (
                <option key={option} value={option}>{option.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className={`mt-3 grid gap-3 ${nationalitySelection === "Others" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <select
              value={form.profile.civil_status || ""}
              onChange={(event) => handleFieldChange("profile", "civil_status", event.target.value)}
              className={inputClass}
            >
              <option value="">Select Civil Status</option>
              {civilStatusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              value={nationalitySelection}
              onChange={(event) => handleNationalityChange(event.target.value)}
              className={inputClass}
            >
              <option value="">Select Nationality</option>
              {nationalityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {nationalitySelection === "Others" ? (
              <input
                value={nationalityOther}
                onChange={(event) => handleNationalityOtherChange(event.target.value)}
                placeholder="Specify Nationality"
                className={inputClass}
              />
            ) : null}
          </div>

          <h4 className={`${sectionHeadingClass} mt-5`}>Address</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.profile.house_number}
              onChange={(event) => handleFieldChange("profile", "house_number", event.target.value)}
              placeholder="House Number / Bldg"
              className={inputClass}
            />
            <input
              value={form.profile.street}
              onChange={(event) => handleFieldChange("profile", "street", event.target.value)}
              placeholder="Street"
              className={inputClass}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <select
              value={regionCode}
              onChange={(event) => handleRegionChange(event.target.value)}
              className={inputClass}
            >
              <option value="">Select Region</option>
              {regionOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={provinceCode}
              onChange={(event) => handleProvinceChange(event.target.value)}
              className={inputClass}
            >
              <option value="">{regionCode ? "Select Province" : "Select region first"}</option>
              {provinceOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              value={cityCode}
              onChange={(event) => handleCityChange(event.target.value)}
              className={inputClass}
            >
              <option value="">{provinceCode ? "Select City / Municipality" : "Select province first"}</option>
              {cityOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-1">
            <select
              value={barangayCode}
              onChange={(event) => handleBarangayChange(event.target.value)}
              className={inputClass}
            >
              <option value="">{cityCode ? "Select Barangay / District" : "Select city first"}</option>
              {barangayOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              value={form.profile.zip_code}
              onChange={(event) => handleFieldChange("profile", "zip_code", event.target.value)}
              placeholder="Zip Code"
              className={inputClass}
            />
            <input
              value={form.profile.educational_attainment}
              onChange={(event) => handleFieldChange("profile", "educational_attainment", event.target.value)}
              placeholder="Educational Attainment"
              className={inputClass}
            />
          </div>

          <h4 className={`${sectionHeadingClass} mt-5`}>Contacts and Accounts</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.profile.emergency_contact_person}
              onChange={(event) => handleFieldChange("profile", "emergency_contact_person", event.target.value)}
              placeholder="Emergency Contact Person"
              className={inputClass}
            />
            <input
              value={form.profile.emergency_contact_number}
              onChange={(event) => handleFieldChange("profile", "emergency_contact_number", event.target.value)}
              placeholder="Emergency Contact Number"
              className={inputClass}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              value={form.profile.fb_link}
              onChange={(event) => handleFieldChange("profile", "fb_link", event.target.value)}
              placeholder="FB Link"
              className={inputClass}
            />
            <input
              value={form.profile.gmail_account}
              onChange={(event) => handleFieldChange("profile", "gmail_account", event.target.value)}
              placeholder="Gmail Account"
              className={inputClass}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-1">
            <input
              value={form.profile.lto_portal_account}
              onChange={(event) => handleFieldChange("profile", "lto_portal_account", event.target.value)}
              placeholder="LTO Portal Account"
              className={inputClass}
            />
          </div>

          <h4 className={`${sectionHeadingClass} mt-5`}>LTMS Information</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={form.profile.student_permit_number}
              onChange={(event) => handleFieldChange("profile", "student_permit_number", event.target.value)}
              placeholder="Student Permit Number"
              className={inputClass}
            />
            <input
              value={form.profile.student_permit_date}
              onChange={(event) => handleFieldChange("profile", "student_permit_date", event.target.value)}
              type="date"
              placeholder="Student Permit Date"
              className={inputClass}
            />
            <select
              value={form.profile.student_permit_status || ""}
              onChange={(event) => handleFieldChange("profile", "student_permit_status", event.target.value)}
              className={inputClass}
            >
              <option value="">Permit Status</option>
              <option value="valid">Valid</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <h4 className={`${sectionHeadingClass} mt-5`}>Medical Certificate</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.profile.medical_certificate_provider}
              onChange={(event) => handleFieldChange("profile", "medical_certificate_provider", event.target.value)}
              placeholder="Clinic Name"
              className={inputClass}
            />
            <input
              value={form.profile.medical_certificate_date}
              onChange={(event) => handleFieldChange("profile", "medical_certificate_date", event.target.value)}
              type="date"
              placeholder="Medical Certificate Date"
              className={inputClass}
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#800000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#690000] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}