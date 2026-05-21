#!/usr/bin/env node

const onlineIntakeService = require("../src/modules/online-intake/online-intake.service");
const { sequelize } = require("../models");

function parseArgs(argv) {
  const args = {};
  argv.forEach((entry) => {
    const match = String(entry).match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
    if (String(entry) === "--auto-approve") {
      args.autoApprove = true;
    }
  });
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source || null;
  const status = args.status || null;
  const autoApprove = !!args.autoApprove;

  if (!source) {
    throw new Error("Usage: node scripts/processOnlineImportQueue.js --source=odep [--status=for_review] [--auto-approve]");
  }

  console.log(`Listing online import queue for source='${source}' status='${status || "any"}'`);

  const items = await onlineIntakeService.listQueue({ source, status, limit: 1000 });

  if (!items || !items.length) {
    console.log("No queue items found.");
    return;
  }

  for (const item of items) {
    const hasMapped = !!item.mapped_payload;
    console.log(`Queue #${item.id} | source=${item.source} | ref=${item.external_ref} | status=${item.import_status} | mapped=${hasMapped}`);

    if (hasMapped) {
      try {
        const payloadStr = typeof item.mapped_payload === "string" ? item.mapped_payload : JSON.stringify(item.mapped_payload);
        console.log(`  mapped_payload: ${payloadStr}`);
      } catch (err) {
        console.log("  mapped_payload: <unserializable>");
      }
    }

    if (autoApprove && hasMapped && item.import_status !== "created_new") {
      // Defensive check: PROMO entries with promo_schedule.enabled must include schedule dates
      const mapped = typeof item.mapped_payload === "string" ? JSON.parse(item.mapped_payload) : item.mapped_payload;
      if (mapped && mapped.enrollment_type === "PROMO" && mapped.promo_schedule && mapped.promo_schedule.enabled) {
        const tdcDate = mapped.promo_schedule?.tdc?.schedule_date || mapped.promo_schedule?.tdc?.scheduleDate || null;
        const pdcDate = mapped.promo_schedule?.pdc?.schedule_date || mapped.promo_schedule?.pdc?.scheduleDate || null;
        if (!tdcDate && !pdcDate) {
          console.log(`-> Skipping auto-approve for queue #${item.id} (PROMO with no schedule dates)`);
          continue;
        }
      }

      try {
        console.log(`-> Auto-approving create for queue #${item.id} ...`);
        const result = await onlineIntakeService.approveCreate(item.id, { reviewer_note: "Auto-approved by script" }, { id: null, role: "system", email: "script@system.local" });
        console.log(`   Approved. enrollmentId=${result.enrollmentId}`);
      } catch (err) {
        console.error(`   Failed to approve queue #${item.id}:`, err.message || err);
      }
    }
  }
}

run()
  .catch((err) => {
    console.error("Script failed:", err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
