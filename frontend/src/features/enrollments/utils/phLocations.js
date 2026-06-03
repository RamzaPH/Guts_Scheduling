import {
  getRegions,
  getProvincesByRegion,
  getCitiesAndMunsByProvince,
  getBarangaysByCityOrMun,
} from "latest-ph-address-thanks-to-anehan";
import zipcodes from "zipcodes-ph";

// ============================================================================
// MASSIVE CUSTOM ZIP CODE DICTIONARY
// ============================================================================
const CUSTOM_ZIP_DICTIONARY = {
  // CAVITE (Kumpleto)
  "dasmariñas": "4114", "dasmarinas": "4114", "trece martires": "4109", "trece martires city": "4109", "general emilio aguinaldo": "4124", "gen. emilio aguinaldo": "4124", "bailen": "4124", "carmona": "4116", "silang": "4118", "tagaytay": "4120", "tagaytay city": "4120", "alfonso": "4123", "amadeo": "4119", "bacoor": "4102", "bacoor city": "4102", "cavite city": "4100", "general trias": "4107", "gen. trias": "4107", "imus": "4103", "imus city": "4103", "indang": "4122", "kawit": "4104", "magallanes": "4113", "maragondon": "4112", "mendez": "4121", "naic": "4110", "noveleta": "4105", "rosario": "4106", "tanza": "4108", "ternate": "4111", "general mariano alvarez": "4117", "gma": "4117",

  // LAGUNA, BATANGAS, RIZAL (Mga may "ñ" at madalas mag-error)
  "biñan": "4024", "binan": "4024", "biñan city": "4024", "santa rosa": "4026", "santa rosa city": "4026", "san pedro": "4023", "cabuyao": "4025", "calamba": "4027", "calamba city": "4027", "los baños": "4030", "los banos": "4030", "san pablo": "4000", "san pablo city": "4000", "santa cruz": "4009",
  "batangas city": "4200", "lipa": "4217", "lipa city": "4217", "tanauan": "4232", "tanauan city": "4232", "santo tomas": "4234", "nasugbu": "4231", "lemery": "4209",
  "antipolo": "1870", "antipolo city": "1870", "cainta": "1900", "taytay": "1920", "binangonan": "1940", "san mateo": "1850", "rodriguez": "1860", "montalban": "1860", "angono": "1930",

  // BULACAN & PAMPANGA
  "malolos": "3000", "malolos city": "3000", "meycauayan": "3020", "meycauayan city": "3020", "san jose del monte": "3023", "sjdm": "3023", "bocaue": "3018", "baliug": "3006", "baliuag": "3006", "marilao": "3019", "santa maria": "3022",
  "angeles": "2009", "angeles city": "2009", "san fernando": "2000", "mabalacat": "2010",

  // METRO MANILA (Central/Default Codes)
  "manila": "1000", "quezon city": "1100", "caloocan": "1400", "caloocan city": "1400", "las piñas": "1740", "las pinas": "1740", "makati": "1200", "makati city": "1200", "malabon": "1470", "malabon city": "1470", "mandaluyong": "1550", "mandaluyong city": "1550", "marikina": "1800", "marikina city": "1800", "muntinlupa": "1770", "muntinlupa city": "1770", "navotas": "1490", "navotas city": "1490", "parañaque": "1700", "paranaque": "1700", "pasay": "1300", "pasay city": "1300", "pasig": "1600", "pasig city": "1600", "pateros": "1620", "san juan": "1500", "taguig": "1630", "taguig city": "1630", "valenzuela": "1440", "valenzuela city": "1440",

  // MAJOR CITIES (Visayas / Mindanao)
  "cebu city": "6000", "mandaue": "6014", "mandaue city": "6014", "lapu-lapu": "6015", "lapu-lapu city": "6015",
  "davao city": "8000", "iloilo city": "5000", "bacolod": "6100", "bacolod city": "6100",
  "cagayan de oro": "9000", "cagayan de oro city": "9000", "cdo": "9000",
  "zamboanga city": "7000", "general santos": "9500", "general santos city": "9500", "gensan": "9500"
};
// ============================================================================

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMatch(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^city of\s+/i, "")
    .replace(/\bgen\.?\b/gi, "general")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCityLabel(name) {
  let normalized = normalizeText(name);

  if (normalized.toLowerCase().startsWith("city of ")) {
    normalized = normalized.replace(/^city of\s+/i, "");
  }

  if (normalized === "Gen. Mariano Alvarez") {
    return "General Mariano Alvarez";
  }

  // Awtomatikong idudugtong ang 'City' sa mga sumusunod para maganda sa UI
  const requiresCitySuffix = ["cavite", "batangas", "tarlac", "cebu", "iloilo", "davao"];
  if (requiresCitySuffix.includes(normalized.toLowerCase())) {
    return `${normalized} City`;
  }

  return normalized;
}

export function getRegionOptions() {
  return getRegions().map((item) => ({
    value: item.psgc,
    label: item.name,
  }));
}

export function getProvinceOptions(regionCode) {
  if (!regionCode) {
    return [];
  }

  const provinces = getProvincesByRegion(regionCode);
  if (typeof provinces === "string") {
    return [{ value: provinces, label: provinces }];
  }

  return provinces.map((item) => ({
    value: item.psgc,
    label: item.name,
  }));
}

export function getCityOptions(regionCode, provinceCode) {
  if (!regionCode) {
    return [];
  }

  const cities = provinceCode === "-NO PROVINCE-"
    ? getCitiesAndMunsByProvince("-NO PROVINCE-", regionCode)
    : getCitiesAndMunsByProvince(provinceCode);

  return cities.map((item) => ({
    value: item.psgc,
    label: formatCityLabel(item.name),
  }));
}

export function getBarangayOptions(cityCode) {
  if (!cityCode || cityCode === "-NO PROVINCE-") {
    return [];
  }

  return getBarangaysByCityOrMun(cityCode).map((item) => ({
    value: item.psgc,
    label: item.name,
  }));
}

export function getRegionLabel(regionCode) {
  const match = getRegions().find((item) => item.psgc === regionCode);
  return match?.name || regionCode || "";
}

export function findRegionCodeByLabel(regionLabel) {
  const normalized = normalizeMatch(regionLabel);
  if (!normalized) return "";

  const match = getRegions().find((item) => normalizeMatch(item.name) === normalized);
  return match?.psgc || "";
}

export function getProvinceLabel(regionCode, provinceCode) {
  if (!regionCode || !provinceCode) {
    return provinceCode || "";
  }

  const provinces = getProvincesByRegion(regionCode);
  if (typeof provinces === "string") {
    return provinces;
  }

  const match = provinces.find((item) => item.psgc === provinceCode);
  return match?.name || provinceCode || "";
}

export function findProvinceCodeByName(regionCode, provinceName) {
  if (!regionCode) return "";

  const normalized = normalizeMatch(provinceName);
  if (!normalized) return "";

  const provinces = getProvinceOptions(regionCode);
  const match = provinces.find((item) => normalizeMatch(item.label) === normalized);
  return match?.value || "";
}

export function getCityLabel(regionCode, provinceCode, cityCode) {
  if (!regionCode || !cityCode) {
    return cityCode || "";
  }

  const cities = provinceCode === "-NO PROVINCE-"
    ? getCitiesAndMunsByProvince("-NO PROVINCE-", regionCode)
    : getCitiesAndMunsByProvince(provinceCode);

  const match = cities.find((item) => item.psgc === cityCode);
  return match ? formatCityLabel(match.name) : cityCode || "";
}

export function findCityCodeByName(regionCode, provinceCode, cityName) {
  if (!regionCode || !provinceCode) return "";

  const normalized = normalizeMatch(cityName);
  if (!normalized) return "";

  const cities = getCityOptions(regionCode, provinceCode);
  const match = cities.find((item) => normalizeMatch(item.label) === normalized);
  return match?.value || "";
}

export function getBarangayLabel(cityCode, barangayCode) {
  if (!cityCode || !barangayCode) {
    return barangayCode || "";
  }

  const barangays = getBarangaysByCityOrMun(cityCode);
  const match = barangays.find((item) => item.psgc === barangayCode);
  return match?.name || barangayCode || "";
}

export function findBarangayCodeByName(cityCode, barangayName) {
  if (!cityCode) return "";

  const normalized = normalizeMatch(barangayName);
  if (!normalized) return "";

  const barangays = getBarangayOptions(cityCode);
  const match = barangays.find((item) => normalizeMatch(item.label) === normalized);
  return match?.value || "";
}

// ============================================================================
// ULTIMATE ZIP CODE FINDER
// ============================================================================
export function getZipCodeByAddressCodes(regionCode, provinceCode, cityCode) {
  if (!regionCode || !provinceCode || !cityCode) {
    return "";
  }

  const cityLabel = getCityLabel(regionCode, provinceCode, cityCode);
  if (!cityLabel) return "";

  const cleanCityLabel = cityLabel.toLowerCase().trim();

  // 1. Unahin hanapin sa ating Custom Dictionary (Instant Match)
  if (CUSTOM_ZIP_DICTIONARY[cleanCityLabel]) {
    return CUSTOM_ZIP_DICTIONARY[cleanCityLabel];
  }

  // 2. Subukan tanggalin ang salitang "City" at hanapin ulit sa Dictionary
  const noCityLabel = cleanCityLabel.replace(/\bcity\b/g, "").trim();
  if (CUSTOM_ZIP_DICTIONARY[noCityLabel]) {
    return CUSTOM_ZIP_DICTIONARY[noCityLabel];
  }

  // 3. Kung wala talaga sa dictionary, ipaubaya sa zipcodes-ph library
  const sanitize = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/gi, "n");
  };

  const pureCityLabel = sanitize(cityLabel);
  const variants = new Set([
    cityLabel,
    pureCityLabel,
    `${cityLabel} City`,
    `${pureCityLabel} City`,
    cityLabel.replace(/\bCity\b/gi, "").trim(),
    pureCityLabel.replace(/\bCity\b/gi, "").trim()
  ]);

  for (const variant of variants) {
    if (!variant) continue;
    const zip = zipcodes.reverse(variant);
    if (zip) return String(zip);
  }

  // 4. Kung sumablay lahat, return blank
  return "";
}