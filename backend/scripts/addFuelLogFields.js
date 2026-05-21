#!/usr/bin/env node
/*
  addFuelLogFields.js
  Adds station_name and price_per_liter to fuel_logs if they do not already exist.
*/

const { sequelize } = require("../models");

async function columnExists(columnName) {
  const rows = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'fuel_logs'
       AND column_name = :columnName`,
    {
      type: sequelize.QueryTypes.SELECT,
      replacements: { columnName },
    }
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function run() {
  try {
    const hasStationName = await columnExists("station_name");
    const hasPricePerLiter = await columnExists("price_per_liter");

    if (!hasStationName) {
      await sequelize.query(`ALTER TABLE fuel_logs ADD COLUMN station_name VARCHAR(255) NULL AFTER vehicle_id`);
      console.log("Added fuel_logs.station_name");
    } else {
      console.log("fuel_logs.station_name already exists");
    }

    if (!hasPricePerLiter) {
      await sequelize.query(`ALTER TABLE fuel_logs ADD COLUMN price_per_liter DECIMAL(12,2) NULL AFTER station_name`);
      console.log("Added fuel_logs.price_per_liter");
    } else {
      console.log("fuel_logs.price_per_liter already exists");
    }

    await sequelize.close();
    } catch (err) {
    console.error("Failed to add fuel log fields:", err && err.message ? err.message : err);
    try { await sequelize.close(); } catch (e) { /* ignore close errors */ }
    process.exitCode = 1;
  }
}

run();
