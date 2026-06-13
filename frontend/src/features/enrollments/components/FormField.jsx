// ✅ FIX: Dinagdag ko ang `uppercase` utility class sa dulo ng baseFieldClassName
const baseFieldClassName = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#800000] uppercase";

export function FormField({
  label,
  placeholder,
  required = false,
  type = "text",
  name,
  value,
  onChange,
  className = "",
  inputClassName = "",
  shouldUppercase = true,
  maxLength,
  readOnly = false,
}) {
  const isContactNumberField = String(name || "").includes("phone") || String(name || "").includes("contact_number");
  const effectiveType = isContactNumberField ? "tel" : type;
  const effectiveInputMode = isContactNumberField ? "numeric" : undefined;
  const effectiveMaxLength = isContactNumberField ? 11 : maxLength;

  const handleChange = (e) => {
    let val = e.target.value;
    if (isContactNumberField) {
      val = String(val).replace(/\D/g, "").slice(0, 11);
    }
    // Convert to uppercase for text inputs (for encoder data entry like names, addresses)
    if (shouldUppercase && (effectiveType === "text" || effectiveType === "email")) {
      val = val.toUpperCase();
    }
    onChange({ ...e, target: { ...e.target, value: val } });
  };

  return (
    <label className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={name}
        value={value ?? ""}
        onChange={handleChange}
        type={effectiveType}
        placeholder={placeholder ? placeholder.toUpperCase() : ""}
        required={required}
        inputMode={effectiveInputMode}
        maxLength={effectiveMaxLength}
        readOnly={readOnly}
        // Kung hindi text (gaya ng date, i-remove ang uppercase param)
        className={`${baseFieldClassName} ${effectiveType !== "text" && effectiveType !== "email" ? "normal-case" : ""} ${inputClassName}`.trim()}
      />
    </label>
  );
}

export function SelectField({
  label,
  placeholder,
  required = false,
  name,
  value,
  onChange,
  options = [],
  className = "",
  inputClassName = "",
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        {label}
        {required ? " *" : ""}
      </span>
      <select
        name={name}
        value={value ?? ""}
        onChange={onChange}
        required={required}
        className={`${baseFieldClassName} ${inputClassName}`.trim()}
      >
        <option value="" disabled className="uppercase">
          {placeholder ? placeholder.toUpperCase() : "SELECT..."}
        </option>
        {/* ✅ FIX: Fino-force na ALL CAPS lahat ng laman ng dropdown options */}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="uppercase">
            {typeof option.label === "string" ? option.label.toUpperCase() : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SectionTitle({ children }) {
  return <h3 className="mb-3 mt-5 border-b border-slate-300 pb-2 text-xs font-bold tracking-[0.12em] text-blue-700 uppercase">{children}</h3>;
}