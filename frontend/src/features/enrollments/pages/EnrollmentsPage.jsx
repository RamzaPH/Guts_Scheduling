import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GraduationCap, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EnrollmentTypeSwitcher from "../components/EnrollmentTypeSwitcher";
import { getEnrollmentTypeLabel } from "../components/enrollmentTypeOptions";
import { AddressSection, PersonalInfoSection } from "../components/sections/CommonSections";
import { useCreateEnrollment } from "../hooks/useCreateEnrollment";
import { resourceServices } from "../../../services/resources";
import { fetchDailyReports } from "../../dashboard/services/dashboardApi";
import ToastStack from "../../../shared/utils/ToastStack";
import { calculateAge } from "../../../shared/utils/date";
import {
  getBarangayLabel,
  getCityLabel,
  getProvinceLabel,
  getRegionLabel,
} from "../utils/phLocations";

const TdcFormSections = lazy(() => import("../components/sections/TdcFormSections"));
const PdcFormSections = lazy(() => import("../components/sections/PdcFormSections"));
const PromoFormSections = lazy(() => import("../components/sections/PromoFormSections"));

const INITIAL_FORM = {
  student: {
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    phone: "",
  },
  profile: {
    birthdate: "",
    birthplace: "",
    age: "",
    gender: "",
    civil_status: "",
    nationality: "",
    nationality_other: "",
    fb_link: "",
    gmail_account: "",
    house_number: "",
    street: "",
    barangay: "",
    city: "",
    province: "",
    zip_code: "",
  },
  enrollment: {
    client_type: "",
    is_already_driver: false,
    target_vehicle: "",
    transmission_type: "",
    motorcycle_type: "",
    training_method: "On Site",
    pdc_category: "",
    promo_offer_id: "",
    tdc_source: "guts",
  },
  extras: {
    region: "",
    enrolling_for: "",
    educational_attainment: "",
    emergency_contact_person: "",
    emergency_contact_number: "",
    lto_portal_account: "",
    driving_school_tdc: "",
    driving_school_tdc_other: "",
    year_completed_tdc: "",
    tdc_training_method: "Onsite",
    pdc_training_method: "Onsite",
  },
  schedule: {
    enabled: true,
    schedule_date: "",
    slot: "morning",
    instructor_id: "",
    care_of_instructor_id: "",
    vehicle_id: "",
  },
  promo_schedule_tdc: {
    enabled: true,
    schedule_date: "",
    slot: "morning",
    instructor_id: "",
    care_of_instructor_id: "",
    vehicle_id: "",
  },
  promo_schedule_pdc: {
    enabled: false,
    schedule_date: "",
    slot: "morning",
    instructor_id: "",
    care_of_instructor_id: "",
    vehicle_id: "",
  },
};

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isExperiencePdcCategory(value) {
  return String(value || "").trim().toLowerCase() === "experience";
}

function buildEnrollmentPayload(type, form) {
  const isExperienceFlow = isExperiencePdcCategory(form.enrollment.pdc_category);
  const drivingSchoolTdc = form.extras.driving_school_tdc === "Other"
    ? (form.extras.driving_school_tdc_other || "").trim()
    : form.extras.driving_school_tdc;
  const promoPdcTrainingMethod = "Onsite";
  const promoTrainingMethod = [
    form.extras.tdc_training_method ? `TDC: ${form.extras.tdc_training_method}` : null,
    `PDC: ${promoPdcTrainingMethod}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    enrollment_type: type,
    student: {
      first_name: form.student.first_name,
      middle_name: form.student.middle_name,
      last_name: form.student.last_name,
      email: form.student.email,
      phone: form.student.phone,
    },
    profile: {
      birthdate: form.profile.birthdate || null,
      birthplace: form.profile.birthplace || null,
      age: toNullableNumber(form.profile.age),
      gender: form.profile.gender,
      civil_status: form.profile.civil_status,
      nationality: form.profile.nationality === "Others" ? form.profile.nationality_other || null : form.profile.nationality,
      fb_link: form.profile.fb_link,
      gmail_account: form.profile.gmail_account,
      house_number: form.profile.house_number,
      street: form.profile.street,
      barangay: getBarangayLabel(form.profile.city, form.profile.barangay),
      city: getCityLabel(form.extras.region, form.profile.province, form.profile.city),
      province: getProvinceLabel(form.extras.region, form.profile.province),
      zip_code: form.profile.zip_code,
    },
    extras: {
      region: getRegionLabel(form.extras.region),
      enrolling_for:
        type === "PDC"
          ? form.extras.enrolling_for
          : type === "PROMO"
            ? "TDC + PDC Promo"
            : form.extras.enrolling_for,
      educational_attainment: form.extras.educational_attainment,
      emergency_contact_person: form.extras.emergency_contact_person,
      emergency_contact_number: form.extras.emergency_contact_number,
      lto_portal_account: form.extras.lto_portal_account,
      driving_school_tdc: drivingSchoolTdc,
      year_completed_tdc: form.extras.year_completed_tdc,
      tdc_training_method: type === "PROMO" ? form.extras.tdc_training_method || "Onsite" : form.extras.tdc_training_method,
      pdc_training_method: type === "PROMO" ? promoPdcTrainingMethod : form.extras.pdc_training_method,
    },
    enrollment: {
      client_type:
        type === "PDC"
          ? form.enrollment.client_type || null
          : type === "PROMO"
            ? "promo"
            : form.enrollment.client_type || null,
      is_already_driver:
        type === "PDC" || type === "PROMO"
          ? isExperienceFlow && form.enrollment.is_already_driver === true
          : false,
      target_vehicle:
        (type === "PDC" || type === "PROMO") && isExperienceFlow && form.enrollment.is_already_driver === true
          ? form.enrollment.target_vehicle || null
          : null,
      transmission_type:
        (type === "PDC" || type === "PROMO") && isExperienceFlow && form.enrollment.is_already_driver === true
          ? form.enrollment.transmission_type || null
          : null,
      motorcycle_type:
        (type === "PDC" || type === "PROMO") &&
        isExperienceFlow &&
        form.enrollment.is_already_driver === true &&
        isMotorcycleTargetVehicle(form.enrollment.target_vehicle)
          ? form.enrollment.motorcycle_type || null
          : null,
      fee_amount: form.enrollment.fee_amount || null,
      discount_amount: form.enrollment.discount_amount || null,
      payment_terms: form.enrollment.payment_terms || null,
      payment_reference_number: form.enrollment.payment_reference_number || null,
      payment_notes: form.enrollment.payment_notes || null,
      promo_offer_id: toNullableNumber(form.enrollment.promo_offer_id),
      tdc_source: type === "PDC" || type === "PROMO" ? (form.enrollment.tdc_source || "guts") : null,
      training_method:
        type === "PDC"
          ? form.enrollment.training_method || null
          : type === "PROMO"
            ? promoTrainingMethod
            : "",
      pdc_start_mode: type === "PROMO" ? "later" : null,
      pdc_category: type === "PDC" || type === "PROMO" ? form.enrollment.pdc_category : null,
      status: "pending",
    },
    schedule: {
      enabled: type === "PROMO" ? false : Boolean(form.schedule.enabled),
      schedule_date: type === "PROMO" ? null : (form.schedule.schedule_date || null),
      slot: type === "PROMO" ? null : (form.schedule.slot || null),
      instructor_id: type === "PROMO" ? null : toNullableNumber(form.schedule.instructor_id),
      care_of_instructor_id: type === "PROMO" ? null : toNullableNumber(form.schedule.care_of_instructor_id),
      vehicle_id: type === "PROMO" ? null : toNullableNumber(form.schedule.vehicle_id),
    },
    promo_schedule: type === "PROMO" ? {
      enabled: true,
      tdc: {
        enabled: Boolean(form.promo_schedule_tdc.enabled),
        schedule_date: form.promo_schedule_tdc.schedule_date || null,
        slot: form.promo_schedule_tdc.slot || "morning",
        instructor_id: toNullableNumber(form.promo_schedule_tdc.instructor_id),
        care_of_instructor_id: toNullableNumber(form.promo_schedule_tdc.care_of_instructor_id),
        vehicle_id: null,
      },
      pdc: {
        enabled: false,
        schedule_date: null,
        slot: null,
        instructor_id: null,
        care_of_instructor_id: null,
        vehicle_id: null,
      },
    } : null,
  };
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isMotorcycleTargetVehicle(value) {
  const normalized = normalizeText(value);
  return (
    normalized === "motorcycle" ||
    normalized === "motor" ||
    normalized.includes("motorcycle") ||
    normalized.includes("tricycle") ||
    normalized.includes("dl codes a")
  );
}

function inferEnrollmentCourseType(type, form) {
  if (type === "TDC") return "tdc";

  const pdcType = normalizeText(form.enrollment.pdc_type || form.enrollment.pdc_category);
  return pdcType === "experience" ? "pdc_experience" : pdcType ? "pdc_beginner" : "";
}

function scheduleCourseLabel(courseType) {
  if (courseType === "tdc") return "TDC";
  if (courseType === "pdc_beginner") return "PDC Beginner";
  if (courseType === "pdc_experience") return "PDC Experience";
  return "Select course details above";
}

function buildInstructorOptionsForCourseType(rows, courseType) {
  const isQualified = (item) => {
    const specialization = String(item.specialization || "").toLowerCase();
    const tdcCertified = Boolean(item.tdc_certified) || specialization.includes("tdc");
    const pdcBeginnerCertified = Boolean(item.pdc_beginner_certified) || specialization.includes("pdc");
    const pdcExperienceCertified = Boolean(item.pdc_experience_certified) || specialization.includes("pdc");

    if (courseType === "tdc") return tdcCertified;
    if (courseType === "pdc_beginner") return pdcBeginnerCertified;
    if (courseType === "pdc_experience") return pdcExperienceCertified;
    return true;
  };

  return rows
    .filter((item) => String(item.status || "Active") === "Active")
    .filter((item) => isQualified(item))
    .map((item) => ({ value: String(item.id), label: item.name }));
}

function isMotorcycleVehicleType(vehicleType) {
  const normalized = normalizeText(vehicleType);
  return (
    normalized === "motorcycle" ||
    normalized === "motor" ||
    normalized.includes("motorcycle") ||
    normalized.includes("tricycle") ||
    normalized.includes("dl codes a")
  );
}

function isCarVehicleType(vehicleType) {
  const normalized = normalizeText(vehicleType);
  return normalized === "car" || normalized === "sedan";
}

function matchesVehicleTarget(vehicleType, targetVehicle) {
  const normalizedTarget = normalizeText(targetVehicle);

  if (!normalizedTarget) {
    return true;
  }

  const wantsMotorcycle =
    normalizedTarget === "motor" ||
    normalizedTarget === "motorcycle" ||
    normalizedTarget.includes("motorcycle") ||
    normalizedTarget.includes("tricycle") ||
    normalizedTarget.includes("dl codes a");

  if (wantsMotorcycle) {
    return isMotorcycleVehicleType(vehicleType);
  }

  const wantsCar =
    normalizedTarget === "car" ||
    normalizedTarget.includes("car") ||
    normalizedTarget.includes("sedan") ||
    normalizedTarget.includes("l300") ||
    normalizedTarget.includes("van") ||
    normalizedTarget.includes("dl codes b");

  if (wantsCar) {
    return isCarVehicleType(vehicleType);
  }

  return true;
}

function matchesTransmissionType(vehicleTransmission, selectedTransmission) {
  const normalizedSelected = normalizeText(selectedTransmission);
  if (!normalizedSelected) {
    return true;
  }

  if (normalizedSelected === "other") {
    return true;
  }

  if (normalizedSelected.includes("manual")) {
    return normalizeText(vehicleTransmission) === "manual";
  }

  if (normalizedSelected.includes("automatic")) {
    return normalizeText(vehicleTransmission) === "automatic";
  }

  return normalizeText(vehicleTransmission) === normalizedSelected;
}

const ENROLLMENT_TYPE_CARDS = [
  { value: "TDC", label: "TDC", description: "Theoretical Driving Course" },
  { value: "PDC", label: "PDC", description: "Practical Driving Course" },
  { value: "PROMO", label: "TDC + PDC Promo", description: "Combined TDC & PDC Package" },
];

export default function EnrollmentsPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState(null);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const successRedirectTimeoutRef = useRef(null);
  const createEnrollmentMutation = useCreateEnrollment();
  const scheduleCourseType = useMemo(() => inferEnrollmentCourseType(selectedType, form), [selectedType, form]);
  const isScheduleTdc = scheduleCourseType === "tdc";
  const isPromo = selectedType === "PROMO";
  const promoPdcCourseType = useMemo(
    () => inferEnrollmentCourseType("PDC", form),
    [form]
  );

  const nationalityIsOther = form.profile.nationality === "Others";

  // INILIPAT DITO ANG AUTO-CALCULATE AGE PARA NASA LOOB NG COMPONENT
  useEffect(() => {
    const birthdate = form.profile.birthdate;
    const age = calculateAge(birthdate);
    if (birthdate && age !== form.profile.age) {
      Promise.resolve().then(() => {
        setForm((current) => ({
          ...current,
          profile: {
            ...current.profile,
            age,
          },
        }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.profile.birthdate]);

  const { data: scheduleResources, isLoading: loadingScheduleResources } = useQuery({
    queryKey: ["enrollment-schedule-resources"],
    queryFn: async () => {
      const [instructors, vehicles] = await Promise.all([
        resourceServices.instructors.list(),
        resourceServices.vehicles.list(),
      ]);

      return { instructors, vehicles };
    },
    enabled: step === 1,
    staleTime: 5 * 60 * 1000,
  });

  const { data: promoOffers } = useQuery({
    queryKey: ["promo-offers"],
    queryFn: async () => resourceServices.promoOffers.list(),
    enabled: Boolean(selectedType),
    staleTime: 5 * 60 * 1000,
  });

  const promoOfferRows = useMemo(
    () => (Array.isArray(promoOffers) ? promoOffers : promoOffers?.data || []),
    [promoOffers]
  );

  const { data: scheduleAvailability, isLoading: loadingScheduleAvailability } = useQuery({
    queryKey: [
      "enrollment-schedule-availability",
      form.schedule.schedule_date,
      scheduleCourseType,
      form.schedule.instructor_id,
      form.schedule.vehicle_id,
    ],
    queryFn: () => fetchDailyReports({
      mode: "day",
      date: form.schedule.schedule_date,
      courseType: scheduleCourseType,
      instructorId: form.schedule.instructor_id ? Number(form.schedule.instructor_id) : undefined,
      vehicleId: !isScheduleTdc && form.schedule.vehicle_id ? Number(form.schedule.vehicle_id) : undefined,
    }),
    enabled: step === 1 && Boolean(form.schedule.schedule_date) && Boolean(scheduleCourseType),
    staleTime: 10 * 1000,
  });

  const { data: promoTdcAvailability, isLoading: loadingPromoTdcAvailability } = useQuery({
    queryKey: [
      "enrollment-promo-tdc-availability",
      form.promo_schedule_tdc.schedule_date,
      form.promo_schedule_tdc.instructor_id,
    ],
    queryFn: () => fetchDailyReports({
      mode: "day",
      date: form.promo_schedule_tdc.schedule_date,
      courseType: "tdc",
      instructorId: form.promo_schedule_tdc.instructor_id ? Number(form.promo_schedule_tdc.instructor_id) : undefined,
    }),
    enabled: step === 1 && isPromo && Boolean(form.promo_schedule_tdc.schedule_date),
    staleTime: 10 * 1000,
  });

  const { data: promoPdcAvailability, isLoading: loadingPromoPdcAvailability } = useQuery({
    queryKey: [
      "enrollment-promo-pdc-availability",
      form.promo_schedule_pdc.schedule_date,
      promoPdcCourseType,
      form.promo_schedule_pdc.instructor_id,
      form.promo_schedule_pdc.vehicle_id,
    ],
    queryFn: () => fetchDailyReports({
      mode: "day",
      date: form.promo_schedule_pdc.schedule_date,
      courseType: promoPdcCourseType,
      instructorId: form.promo_schedule_pdc.instructor_id ? Number(form.promo_schedule_pdc.instructor_id) : undefined,
      vehicleId: form.promo_schedule_pdc.vehicle_id ? Number(form.promo_schedule_pdc.vehicle_id) : undefined,
    }),
    enabled: false,
    staleTime: 10 * 1000,
  });

  const instructorOptions = useMemo(
    () => buildInstructorOptionsForCourseType(scheduleResources?.instructors || [], scheduleCourseType),
    [scheduleResources, scheduleCourseType]
  );

  const promoTdcInstructorOptions = useMemo(
    () => buildInstructorOptionsForCourseType(scheduleResources?.instructors || [], "tdc"),
    [scheduleResources]
  );

  const promoPdcInstructorOptions = useMemo(
    () => buildInstructorOptionsForCourseType(scheduleResources?.instructors || [], promoPdcCourseType),
    [scheduleResources, promoPdcCourseType]
  );

  const vehicleOptions = useMemo(() => {
    const rows = scheduleResources?.vehicles || [];
    const filtered = rows
      .filter((item) => matchesVehicleTarget(item.vehicle_type, form.enrollment.target_vehicle))
      .filter((item) => matchesTransmissionType(item.transmission_type, form.enrollment.transmission_type));

    return filtered.map((item) => ({
      value: String(item.id),
      label: `${item.vehicle_name || item.plate_number} (${item.vehicle_type || "Vehicle"} | ${item.transmission_type || "Transmission N/A"})`,
    }));
  }, [scheduleResources, form.enrollment.target_vehicle, form.enrollment.transmission_type]);

  const promoOfferOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...promoOfferRows
        .filter((item) => String(item?.status || "").toLowerCase() === "active")
        .filter((item) => {
          const appliesToScope = item?.applies_to || "ALL";
          return appliesToScope === "ALL" || appliesToScope === selectedType;
        })
        .map((item) => ({ value: String(item.id), label: item.name || `Promo #${item.id}` })),
    ],
    [promoOfferRows, selectedType]
  );

  const selectedPromoOffer = useMemo(
    () => promoOfferRows.find((item) => String(item.id) === String(form.enrollment.promo_offer_id)) || null,
    [promoOfferRows, form.enrollment.promo_offer_id]
  );

  const promoAmountSnapshot = useMemo(() => {
    const fixedPrice = Number(selectedPromoOffer?.fixed_price);
    const discountedPrice = Number(selectedPromoOffer?.discounted_price);

    if (!selectedPromoOffer || Number.isNaN(discountedPrice)) {
      return null;
    }

    return {
      fee_amount: discountedPrice.toFixed(2),
      discount_amount: Math.max(fixedPrice - discountedPrice, 0).toFixed(2),
    };
  }, [selectedPromoOffer]);

  useEffect(() => {
    if (!promoAmountSnapshot) {
      return;
    }

    Promise.resolve().then(() => {
      setForm((current) => {
        const nextFeeAmount = promoAmountSnapshot.fee_amount;
        const nextDiscountAmount = promoAmountSnapshot.discount_amount;

        if (current.enrollment.fee_amount === nextFeeAmount && current.enrollment.discount_amount === nextDiscountAmount) {
          return current;
        }

        return {
          ...current,
          enrollment: {
            ...current.enrollment,
            fee_amount: nextFeeAmount,
            discount_amount: nextDiscountAmount,
          },
        };
      });
    });
  }, [promoAmountSnapshot]);

  const selectedScheduleVehicle = useMemo(
    () => (scheduleResources?.vehicles || []).find((item) => String(item.id) === String(form.schedule.vehicle_id)) || null,
    [scheduleResources, form.schedule.vehicle_id]
  );

  const promoPdcSelectedVehicle = useMemo(
    () => (scheduleResources?.vehicles || []).find((item) => String(item.id) === String(form.promo_schedule_pdc.vehicle_id)) || null,
    [scheduleResources, form.promo_schedule_pdc.vehicle_id]
  );

  const isMotorcycleWholeDaySchedule =
    scheduleCourseType === "tdc" || (scheduleCourseType === "pdc_experience" && isMotorcycleVehicleType(selectedScheduleVehicle?.vehicle_type));

  const isPromoPdcWholeDaySchedule =
    promoPdcCourseType === "pdc_experience" && isMotorcycleVehicleType(promoPdcSelectedVehicle?.vehicle_type);

  const activeScheduleSlotKey = isMotorcycleWholeDaySchedule ? "morning" : form.schedule.slot;

  const scheduleSlots = scheduleAvailability?.availability || [];
  const selectedScheduleSlot = scheduleSlots.find((item) => item.slot === activeScheduleSlotKey) || null;

  const promoTdcSlots = promoTdcAvailability?.availability || [];
  const promoTdcSelectedSlot = promoTdcSlots.find((item) => item.slot === "morning") || null;

  const promoPdcActiveSlotKey = isPromoPdcWholeDaySchedule ? "morning" : form.promo_schedule_pdc.slot;
  const promoPdcSlots = promoPdcAvailability?.availability || [];
  const promoPdcSelectedSlot = promoPdcSlots.find((item) => item.slot === promoPdcActiveSlotKey) || null;

  useEffect(() => {
    if (!isMotorcycleWholeDaySchedule) return;
    // Use a microtask to avoid cascading renders
    Promise.resolve().then(() => {
      setForm((current) => {
        if (current.schedule.slot === "morning") {
          return current;
        }
        return {
          ...current,
          schedule: {
            ...current.schedule,
            slot: "morning",
          },
        };
      });
    });
  }, [isMotorcycleWholeDaySchedule]);

  

  useEffect(() => {
    if (isScheduleTdc) return;
    const existsInOptions = vehicleOptions.some((item) => item.value === String(form.schedule.vehicle_id));
    if (existsInOptions || !form.schedule.vehicle_id) return;
    Promise.resolve().then(() => {
      setForm((current) => ({
        ...current,
        schedule: {
          ...current.schedule,
          vehicle_id: "",
        },
      }));
    });
  }, [vehicleOptions, form.schedule.vehicle_id, isScheduleTdc]);

  useEffect(() => {
    if (!isPromo || !form.promo_schedule_pdc.enabled) return;
    const existsInOptions = vehicleOptions.some((item) => item.value === String(form.promo_schedule_pdc.vehicle_id));
    if (existsInOptions || !form.promo_schedule_pdc.vehicle_id) return;
    Promise.resolve().then(() => {
      setForm((current) => ({
        ...current,
        promo_schedule_pdc: {
          ...current.promo_schedule_pdc,
          vehicle_id: "",
        },
      }));
    });
  }, [isPromo, form.promo_schedule_pdc.enabled, vehicleOptions, form.promo_schedule_pdc.vehicle_id]);

  useEffect(() => {
    return () => {
      if (successRedirectTimeoutRef.current) {
        window.clearTimeout(successRedirectTimeoutRef.current);
      }
    };
  }, []);

  function addToast(message, type = "error") {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3500);
  }

  function handleFieldChange(section, field, value) {
    setForm((current) => {
      if (section === "extras" && field === "region") {
        return {
          ...current,
          extras: {
            ...current.extras,
            region: value,
          },
          profile: {
            ...current.profile,
            province: "",
            city: "",
            barangay: "",
          },
        };
      }

      if (section === "profile" && field === "province") {
        return {
          ...current,
          profile: {
            ...current.profile,
            province: value,
            city: "",
            barangay: "",
          },
        };
      }

      if (section === "profile" && field === "city") {
        return {
          ...current,
          profile: {
            ...current.profile,
            city: value,
            barangay: "",
          },
        };
      }

      if (section === "profile" && field === "nationality") {
        return {
          ...current,
          profile: {
            ...current.profile,
            nationality: value,
            nationality_other: value === "Others" ? current.profile.nationality_other : "",
          },
        };
      }

      if (section === "profile" && field === "nationality_other") {
        return {
          ...current,
          profile: {
            ...current.profile,
            nationality_other: value,
          },
        };
      }

      if (section !== "enrollment" && section !== "schedule") {
        return {
          ...current,
          [section]: {
            ...current[section],
            [field]: value,
          },
        };
      }

      if (section === "schedule") {
        return {
          ...current,
          schedule: {
            ...current.schedule,
            [field]: value,
          },
        };
      }

      if (field === "is_already_driver") {
        const isDriver = value === true || value === "true";
        return {
          ...current,
          enrollment: {
            ...current.enrollment,
            is_already_driver: isDriver,
            target_vehicle: isDriver ? current.enrollment.target_vehicle : "",
            transmission_type: isDriver ? current.enrollment.transmission_type : "",
            motorcycle_type: isDriver ? current.enrollment.motorcycle_type : "",
          },
        };
      }

      if (field === "target_vehicle") {
        const isMotorcycle = isMotorcycleTargetVehicle(value);
        return {
          ...current,
          enrollment: {
            ...current.enrollment,
            target_vehicle: value,
            motorcycle_type: isMotorcycle ? current.enrollment.motorcycle_type : "",
          },
        };
      }

      return {
        ...current,
        enrollment: {
          ...current.enrollment,
          [field]: value,
        },
      };
    });
  }

  function handleTypeChange(nextType) {
    setSelectedType(nextType);
    setIsTypeMenuOpen(false);
    setSuccessMessage("");

    if (nextType === "PDC") {
      setForm((current) => ({
        ...current,
        enrollment: {
          ...current.enrollment,
          client_type: "",
          training_method: "",
          pdc_category: "",
        },
        extras: {
          ...current.extras,
          enrolling_for: "",
        },
      }));
      return;
    }

    if (nextType === "PROMO") {
      setForm((current) => ({
        ...current,
        enrollment: {
          ...current.enrollment,
          pdc_category: "",
        },
        extras: {
          ...current.extras,
          tdc_training_method: "FACE TO FACE ( FRI-SAT / 8AM TO 5PM)",
          pdc_training_method: "Onsite",
        },
        promo_schedule_tdc: {
          ...current.promo_schedule_tdc,
          enabled: true,
          slot: "morning",
          vehicle_id: "",
        },
        promo_schedule_pdc: {
          ...current.promo_schedule_pdc,
          enabled: false,
          slot: "morning",
        },
      }));
    }
  }

  function handleContinue() {
    if (selectedType) {
      setStep(1);
    }
  }

  function handleBackFromForm() {
    setStep(0);
    setIsTypeMenuOpen(false);
  }

  function resetEnrollmentFlow() {
    setForm(INITIAL_FORM);
    setSelectedType(null);
    setStep(0);
    setIsTypeMenuOpen(false);
    setSuccessMessage("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage("");

    if (nationalityIsOther && !String(form.profile.nationality_other || "").trim()) {
      addToast("Please specify the nationality when Others is selected.");
      return;
    }

    if (selectedType === "PDC" && !form.enrollment.pdc_category) {
      addToast("PDC classification is required. Please select Beginner or Experience.");
      return;
    }

    if (selectedType === "TDC" && form.enrollment.is_already_driver) {
      if (!form.enrollment.target_vehicle || !form.enrollment.transmission_type) {
        addToast("Please complete the required driving information fields.");
        return;
      }
    }

    if (selectedType === "PROMO" && form.enrollment.is_already_driver) {
      if (!form.enrollment.target_vehicle || !form.enrollment.transmission_type) {
        addToast("Please complete the required driving information fields.");
        return;
      }
    }

    // Promo PDC is always schedule-later at creation; no PDC schedule validation here.

    if (selectedType === "PROMO") {
      if (!form.promo_schedule_tdc.schedule_date || !form.promo_schedule_tdc.instructor_id) {
        addToast("Please complete the TDC schedule session details for promo enrollment.");
        return;
      }

      if (promoTdcSelectedSlot?.full) {
        addToast("The promo TDC schedule session is fully booked. Choose another date or slot.");
        return;
      }
    } else {
      if (!form.schedule.schedule_date) {
        addToast("Please select a schedule date before submitting the enrollment.");
        return;
      }

      if (!form.schedule.instructor_id) {
        addToast("Please assign an instructor in the Schedule Session section.");
        return;
      }

      if (!isScheduleTdc && !form.schedule.vehicle_id) {
        addToast("Please assign a vehicle in the Schedule Session section.");
        return;
      }

      if (selectedScheduleSlot?.full) {
        addToast("The selected schedule slot is fully booked. Choose another slot or date.");
        return;
      }
    }

    createEnrollmentMutation.mutate(buildEnrollmentPayload(selectedType, form), {
      onSuccess: (response) => {
        const hasSchedule = Boolean(response?.schedule?.item);
        const nextSuccessMessage = hasSchedule
          ? `${getEnrollmentTypeLabel(selectedType)} and schedule submitted successfully.`
          : `${getEnrollmentTypeLabel(selectedType)} submitted successfully.`;

        setSuccessMessage(nextSuccessMessage);
        setIsSuccessModalOpen(true);
        setToasts([]);

        if (successRedirectTimeoutRef.current) {
          window.clearTimeout(successRedirectTimeoutRef.current);
        }

        successRedirectTimeoutRef.current = window.setTimeout(() => {
          setIsSuccessModalOpen(false);
          resetEnrollmentFlow();
        }, 1800);
      },
    });
  }

  if (step === 0) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
        {isSuccessModalOpen ? (
          <div
            style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
            className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-950/20 px-4"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <GraduationCap size={20} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Enrollment saved</h2>
              <p className="mt-2 text-sm text-slate-500">{successMessage}</p>
              <p className="mt-3 text-xs text-slate-400">Returning to enrollment type selection...</p>
            </div>
          </div>
        ) : null}

        <section className="w-full min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md p-1 text-slate-700 hover:bg-slate-300"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#D4AF37]/20 text-[#800000]">
              <GraduationCap size={16} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">New Enrollment</h1>
              <p className="text-xs text-slate-500">Guardians Technical School</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-5 text-base font-semibold text-slate-900">Select Enrollment Type</h2>

            <div className="grid grid-cols-3 gap-4">
              {ENROLLMENT_TYPE_CARDS.map((card) => {
                const isSelected = selectedType === card.value;
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => setSelectedType(card.value)}
                    className={`rounded-xl border-2 p-4 text-left transition-colors ${
                      isSelected
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${isSelected ? "text-blue-700" : "text-slate-900"}`}>
                      {card.label}
                    </p>
                    <p className={`mt-0.5 text-xs ${isSelected ? "text-blue-500" : "text-slate-500"}`}>
                      {card.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleContinue}
                disabled={!selectedType}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue 
              </button>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      {isSuccessModalOpen ? (
        <div
          style={{ left: "var(--app-sidebar-width, 0px)", width: "calc(100vw - var(--app-sidebar-width, 0px))" }}
          className="fixed inset-y-0 right-0 z-50 flex items-center justify-center bg-slate-950/20 px-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <GraduationCap size={20} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Enrollment saved</h2>
            <p className="mt-2 text-sm text-slate-500">{successMessage}</p>
            <p className="mt-3 text-xs text-slate-400">Returning to enrollment type selection...</p>
          </div>
        </div>
      ) : null}

      <section className="w-full min-w-0">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackFromForm}
            className="rounded-md p-1 text-slate-700 hover:bg-slate-300"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/20 text-[#800000]">
            <GraduationCap size={16} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">New Enrollment</h1>
            <p className="text-xs text-slate-500 truncate">Guardians Technical School</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl bg-white shadow-md">
          <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{getEnrollmentTypeLabel(selectedType)}</h2>
              <p className="mt-1 text-xs text-slate-500">Fill out student details and submit the enrollment record.</p>
            </div>

            <EnrollmentTypeSwitcher
              isOpen={isTypeMenuOpen}
              selectedType={selectedType}
              onToggle={() => setIsTypeMenuOpen((current) => !current)}
              onSelect={handleTypeChange}
            />
          </div>

          <div className="thin-scrollbar max-h-[80vh] overflow-y-auto px-4 py-4 sm:px-5">
            <PersonalInfoSection type={selectedType} form={form} onFieldChange={handleFieldChange} promoOfferOptions={promoOfferOptions} />
            <AddressSection type={selectedType} form={form} onFieldChange={handleFieldChange} />
            {selectedType === "TDC" ? (
              <Suspense fallback={<p className="mt-4 text-sm text-slate-500">Loading TDC form...</p>}>
                <TdcFormSections />
              </Suspense>
            ) : null}
            {selectedType === "PDC" ? (
              <Suspense fallback={<p className="mt-4 text-sm text-slate-500">Loading PDC form...</p>}>
                <PdcFormSections form={form} onFieldChange={handleFieldChange} />
              </Suspense>
            ) : null}
            {selectedType === "PROMO" ? (
              <Suspense fallback={<p className="mt-4 text-sm text-slate-500">Loading promo form...</p>}>
                <PromoFormSections
                  form={form}
                  onFieldChange={handleFieldChange}
                  promoTdcInstructorOptions={promoTdcInstructorOptions}
                  promoPdcInstructorOptions={promoPdcInstructorOptions}
                  promoVehicleOptions={vehicleOptions}
                  promoTdcSelectedSlot={promoTdcSelectedSlot}
                  promoPdcSelectedSlot={promoPdcSelectedSlot}
                  promoPdcSlots={promoPdcSlots}
                  promoPdcWholeDay={isPromoPdcWholeDaySchedule}
                  promoPdcCourseLabel={scheduleCourseLabel(promoPdcCourseType)}
                  loadingScheduleResources={loadingScheduleResources}
                  loadingPromoTdcAvailability={loadingPromoTdcAvailability}
                  loadingPromoPdcAvailability={loadingPromoPdcAvailability}
                />
              </Suspense>
            ) : null}

            {selectedType !== "PROMO" ? (
              <section className="mt-6 rounded-2xl border border-[#d9c9a0] bg-[#fff9ef] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Schedule Session</h3>
                  <p className="mt-1 text-sm text-slate-500">Reserve the first session while saving the enrollment.</p>
                </div>
                <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 text-xs font-semibold text-[#800000]">
                  {scheduleCourseLabel(scheduleCourseType)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Start Date</span>
                  <input
                    type="date"
                    value={form.schedule.schedule_date}
                    onChange={(event) => handleFieldChange("schedule", "schedule_date", event.target.value)}
                    className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
                  />
                </label>

                {/* Care of Instructor Dropdown */}
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Care of</span>
                  <select
                    value={form.schedule.care_of_instructor_id}
                    onChange={(event) => handleFieldChange("schedule", "care_of_instructor_id", event.target.value)}
                    disabled={loadingScheduleResources || !scheduleCourseType}
                    className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] disabled:bg-slate-100"
                  >
                    <option value="">Select care of instructor</option>
                    {instructorOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Instructor</span>
                  <select
                    value={form.schedule.instructor_id}
                    onChange={(event) => handleFieldChange("schedule", "instructor_id", event.target.value)}
                    disabled={loadingScheduleResources || !scheduleCourseType}
                    className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] disabled:bg-slate-100"
                  >
                    <option value="">Select instructor</option>
                    {instructorOptions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>

                {!isScheduleTdc ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Vehicle</span>
                    <select
                      value={form.schedule.vehicle_id}
                      onChange={(event) => handleFieldChange("schedule", "vehicle_id", event.target.value)}
                      disabled={loadingScheduleResources || !scheduleCourseType}
                      className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] disabled:bg-slate-100"
                    >
                      <option value="">Select vehicle</option>
                      {vehicleOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    {!loadingScheduleResources && vehicleOptions.length === 0 ? (
                      <span className="text-xs text-red-600">No vehicles found for the selected vehicle type.</span>
                    ) : null}
                  </label>
                ) : (
                  <div className="rounded-xl border border-[#d9c9a0] bg-white px-4 py-3 text-sm text-slate-600">
                    TDC uses an instructor-only lecture slot. Vehicle assignment is not required.
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">
                    {isMotorcycleWholeDaySchedule ? "Session Type" : "Time Slot"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {isMotorcycleWholeDaySchedule
                      ? selectedScheduleSlot?.full
                        ? "Fully booked for the day"
                        : "Whole-day reservation"
                      : selectedScheduleSlot
                      ? selectedScheduleSlot.full
                        ? "Fully booked"
                        : `${selectedScheduleSlot.available} slot${selectedScheduleSlot.available === 1 ? "" : "s"} left`
                      : "Select a date to view availability"}
                  </p>
                </div>

                {isMotorcycleWholeDaySchedule ? (
                  <div className={`mt-2 rounded-2xl border px-4 py-4 ${selectedScheduleSlot?.full ? "border-red-300 bg-red-50 text-red-700" : "border-[#d9c9a0] bg-white text-slate-800"}`}>
                    <p className="text-sm font-semibold">Whole Day (08:00 AM - 05:00 PM)</p>
                    <p className={`mt-1 text-xs ${selectedScheduleSlot?.full ? "text-red-600" : "text-slate-500"}`}>
                      {selectedScheduleSlot?.full ? (selectedScheduleSlot.fullLabel || "Fully Booked") : "Reserved as whole-day motorcycle session"}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {[
                      { slot: "morning", slotLabel: "08:00 AM - 12:00 PM", full: false, available: 0 },
                      { slot: "afternoon", slotLabel: "01:00 PM - 05:00 PM", full: false, available: 0 },
                    ].map((fallback) => {
                      const item = scheduleSlots.find((slot) => slot.slot === fallback.slot) || fallback;
                      const selected = form.schedule.slot === item.slot;
                      return (
                        <button
                          key={item.slot}
                          type="button"
                          disabled={Boolean(item.full)}
                          onClick={() => handleFieldChange("schedule", "slot", item.slot)}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            item.full
                              ? "border-red-300 bg-red-50 text-red-700"
                              : selected
                                ? "border-[#800000] bg-[#800000] text-white shadow-lg"
                                : "border-[#d9c9a0] bg-white text-slate-800 hover:border-[#800000]"
                          }`}
                        >
                          <p className="text-sm font-semibold">{item.slotLabel}</p>
                          <p className={`mt-1 text-xs ${item.full ? "text-red-600" : selected ? "text-white/80" : "text-slate-500"}`}>
                            {item.full ? (item.fullLabel || "Fully Booked") : `${item.available} slot${item.available === 1 ? "" : "s"} left`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {loadingScheduleAvailability ? (
                  <p className="mt-3 text-sm text-slate-500">Checking schedule availability...</p>
                ) : null}

                {scheduleCourseType === "tdc" ? (
                  <p className="mt-3 rounded-xl border border-[#d9c9a0] bg-white px-3 py-2 text-sm text-slate-700">
                    TDC scheduling automatically reserves the same slot on two consecutive operating days (excluding Sundays and regular holidays). Maximum capacity: 30 students per session.
                  </p>
                ) : null}

                {scheduleCourseType === "pdc_beginner" ? (
                  <p className="mt-3 rounded-xl border border-[#d9c9a0] bg-white px-3 py-2 text-sm text-slate-700">
                    PDC scheduling is available Monday to Saturday only, excluding Sundays and regular holidays. Beginner scheduling automatically reserves the same slot on two consecutive operating days and only allows 1 student per slot.
                  </p>
                ) : null}

                {scheduleCourseType === "pdc_experience" ? (
                  <p className="mt-3 rounded-xl border border-[#d9c9a0] bg-white px-3 py-2 text-sm text-slate-700">
                    PDC scheduling is available Monday to Saturday only, excluding Sundays and regular holidays.
                    {isMotorcycleWholeDaySchedule
                      ? "Motorcycle experience scheduling automatically reserves the whole day for the selected instructor and vehicle."
                      : "Experience scheduling reserves the selected time slot for the selected instructor and vehicle."}
                  </p>
                ) : null}
              </div>
              </section>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <div>
              {createEnrollmentMutation.isError ? (
                <p className="text-sm text-red-600">{createEnrollmentMutation.error.message}</p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createEnrollmentMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#800000] px-4 py-2 text-sm font-semibold text-white hover:bg-[#680000] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {createEnrollmentMutation.isPending ? <LoaderCircle size={16} className="animate-spin" /> : null}
                {createEnrollmentMutation.isPending ? "Submitting..." : "Submit Enrollment"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}
