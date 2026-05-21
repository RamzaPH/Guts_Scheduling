#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const onlineIntakeService = require("../src/modules/online-intake/online-intake.service");
const { sequelize } = require("../models");

function parseArgs(argv) {
  const args = {};
  argv.forEach((entry) => {
    const match = String(entry).match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  });
  return args;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseCsv(content) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^"|"$/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      const raw = values[index] || "";
      row[header] = raw.replace(/^"|"$/g, "");
    });
    rows.push(row);
  }

  return rows;
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function buildMappedPayloadFromRow(row, source, externalRef) {
  const enrollmentType = String(row.enrollment_type || row.type || "").toUpperCase();
  const firstName = row.first_name || row.firstname || "";
  const lastName = row.last_name || row.lastname || "";

  if (!enrollmentType || !firstName || !lastName) {
    return null;
  }

  const pdcCategory = row.pdc_category || row.pdc_type || null;
  const pdcStartMode = String(row.pdc_start_mode || "later").toLowerCase() === "now" ? "now" : "later";

  return {
    enrollment_type: enrollmentType,
    student: {
      first_name: firstName,
      middle_name: row.middle_name || "",
      last_name: lastName,
      email: row.email || "",
      phone: row.phone || "",
      source_channel: source,
      external_source: source,
      external_student_ref: externalRef,
    },
    profile: {
      birthdate: row.birthdate || null,
      nationality: row.nationality || null,
      city: row.city || null,
      province: row.province || null,
    },
    extras: {
      enrolling_for: row.enrolling_for || null,
      lto_portal_account: row.lto_portal_account || null,
      driving_school_tdc: row.driving_school_tdc || null,
      year_completed_tdc: row.year_completed_tdc || null,
    },
    enrollment: {
      enrollment_channel: source,
      external_application_ref: externalRef,
      client_type: row.client_type || null,
      is_already_driver: toBool(row.is_already_driver, false),
      target_vehicle: row.target_vehicle || null,
      transmission_type: row.transmission_type || null,
      motorcycle_type: row.motorcycle_type || null,
      pdc_category: pdcCategory,
      pdc_type: pdcCategory,
      pdc_start_mode: pdcStartMode,
      status: row.status || "pending",
    },
    schedule: {
      enabled: false,
      schedule_date: null,
      slot: null,
      instructor_id: null,
      care_of_instructor_id: null,
      vehicle_id: null,
    },
    promo_schedule: {
      enabled: enrollmentType === "PROMO",
      tdc: {
        enabled: false,
        schedule_date: null,
        slot: null,
        instructor_id: null,
        care_of_instructor_id: null,
        vehicle_id: null,
      },
      pdc: {
        enabled: enrollmentType === "PROMO" && pdcStartMode === "now",
        schedule_date: null,
        slot: null,
        instructor_id: null,
        care_of_instructor_id: null,
        vehicle_id: null,
      },
    },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args.file ? path.resolve(args.file) : null;
  const source = args.source || null;

  if (!filePath || !source) {
    throw new Error("Usage: node scripts/importOnlineApplicationsCsv.js --source=saferoads|otdc|odep --file=./imports/online.csv");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(content);

  if (!rows.length) {
    console.log("No rows found in CSV.");
    return;
  }

  const applications = rows
    .map((row) => {
      const externalRef = row.external_ref || row.external_application_ref || row.application_ref || null;
      if (!externalRef) return null;

      const rawPayload = safeJsonParse(row.raw_payload_json)
        || safeJsonParse(row.raw_payload)
        || row;

      const mappedPayload = safeJsonParse(row.mapped_payload_json)
        || safeJsonParse(row.mapped_payload)
        || buildMappedPayloadFromRow(row, source, externalRef);

      return {
        external_ref: externalRef,
        raw_payload: rawPayload,
        mapped_payload: mappedPayload,
      };
    })
    .filter(Boolean);

  if (!applications.length) {
    throw new Error("No valid application rows found. Required column: external_ref (or external_application_ref/application_ref)");
  }

  const result = await onlineIntakeService.manualIngest(
    {
      source,
      applications,
    },
    {
      id: null,
      role: "system",
      email: "csv-import@system.local",
    }
  );

  console.log(`Imported/updated ${result.total} application(s) into online intake queue.`);
}

run()
  .catch((error) => {
    console.error("CSV import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
