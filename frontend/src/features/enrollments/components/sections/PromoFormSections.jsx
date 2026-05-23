import { SectionTitle, SelectField } from "../FormField";

const yesNoOptions = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const tdcVehicleOptions = [
  { value: "Car", label: "Car" },
  { value: "Motorcycle", label: "Motorcycle" },
];

const tdcTransmissionOptions = [
  { value: "Manual", label: "Manual" },
  { value: "Automatic", label: "Automatic" },
];


export default function PromoFormSections({
  form,
  onFieldChange,
  promoTdcInstructorOptions,
  promoTdcSelectedSlot,
  loadingScheduleResources,
  loadingPromoTdcAvailability,
}) {
  const isPromoDriver = form.enrollment.is_already_driver === true;
  const isExperienceCategory = String(form.enrollment.pdc_category || "").toLowerCase() === "experience";

  return (
    <>
      <div className="rounded-lg border-l-4 border-l-[#800000] bg-[#fff9ef] px-4 py-3 mb-8 mt-12">
        <h3 className="text-sm font-bold tracking-wide text-[#800000]">TDC</h3>
      </div>

      {isExperienceCategory ? (
        <>
          <SectionTitle>PDC EXPERIENCE DRIVING ASSESSMENT</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="MARUNONG KA NA BANG MAGMANEHO?"
              name="is_already_driver"
              value={String(form.enrollment.is_already_driver)}
              onChange={(event) => onFieldChange("enrollment", "is_already_driver", event.target.value)}
              placeholder="Select Marunong ka na bang magmaneho?"
              options={yesNoOptions}
              inputClassName="text-slate-900"
              required
            />
          </div>

          {!isPromoDriver ? (
            <p className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-sm text-slate-700">
              PDC Experience requires a driver with selected vehicle and transmission details.
            </p>
          ) : (
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <SelectField
                label="ANONG SASAKYAN ANG INAANYO?"
                name="target_vehicle"
                value={form.enrollment.target_vehicle}
                onChange={(event) => onFieldChange("enrollment", "target_vehicle", event.target.value)}
                placeholder="Select target vehicle"
                options={tdcVehicleOptions}
                inputClassName="text-slate-900"
                required
              />
              <SelectField
                label="ANONG KLASE NG TRANSMISSION?"
                name="transmission_type"
                value={form.enrollment.transmission_type}
                onChange={(event) => onFieldChange("enrollment", "transmission_type", event.target.value)}
                placeholder="Select transmission type"
                options={tdcTransmissionOptions}
                inputClassName="text-slate-900"
                required
              />
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-[#D4AF37]/30 bg-[#fff8e7] px-4 py-3 text-sm text-slate-700">
          Driving assessment, vehicle, and transmission fields are required only for PDC category: Experience.
        </p>
      )}

      <section className="mt-4 rounded-2xl border border-[#d9c9a0] bg-[#fff9ef] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">TDC Schedule Session</h3>
            <p className="mt-1 text-sm text-slate-500">Set the TDC schedule for promo enrollment.</p>
          </div>
          <span className="rounded-full bg-[#D4AF37]/20 px-3 py-1 text-xs font-semibold text-[#800000]">TDC</span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Start Date</span>
            <input
              type="date"
              value={form.promo_schedule_tdc.schedule_date}
              onChange={(event) => onFieldChange("promo_schedule_tdc", "schedule_date", event.target.value)}
              className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Care of</span>
            <select
              value={form.promo_schedule_tdc.care_of_instructor_id}
              onChange={(event) => onFieldChange("promo_schedule_tdc", "care_of_instructor_id", event.target.value)}
              disabled={loadingScheduleResources}
              className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] disabled:bg-slate-100"
            >
              <option value="">Select care of instructor</option>
              {promoTdcInstructorOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold tracking-wide text-[#6b5b4d]">Instructor</span>
            <select
              value={form.promo_schedule_tdc.instructor_id}
              onChange={(event) => onFieldChange("promo_schedule_tdc", "instructor_id", event.target.value)}
              disabled={loadingScheduleResources}
              className="h-11 rounded-xl border border-[#d9c9a0] bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] disabled:bg-slate-100"
            >
              <option value="">Select instructor</option>
              {promoTdcInstructorOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-[#d9c9a0] bg-white px-4 py-3 text-sm text-slate-600">
            Whole-day lecture session. Vehicle assignment is not required.
          </div>
        </div>

        <div className="mt-4 rounded-2xl border px-4 py-4 border-[#d9c9a0] bg-white text-slate-800">
          <p className="text-sm font-semibold">Whole Day (08:00 AM - 05:00 PM)</p>
          <p className={`mt-1 text-xs ${promoTdcSelectedSlot?.full ? "text-red-600" : "text-slate-500"}`}>
            {promoTdcSelectedSlot?.full ? (promoTdcSelectedSlot.fullLabel || "Fully Booked") : "Reserved as whole-day TDC session"}
          </p>
        </div>

        {loadingPromoTdcAvailability ? (
          <p className="mt-3 text-sm text-slate-500">Checking TDC schedule availability...</p>
        ) : null}
      </section>

      <section className="mt-8 rounded-2xl border border-dashed border-[#d9c9a0] bg-[#fff9ef] p-5">
        <h3 className="text-base font-semibold text-slate-900">PDC Details</h3>
        <p className="mt-2 text-sm text-slate-600">
          PDC is automatically set to Schedule Later. PDC course information stays here, and the schedule will be assigned after review.
        </p>
      </section>
    </>
  );
}
