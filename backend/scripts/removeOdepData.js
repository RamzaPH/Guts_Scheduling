#!/usr/bin/env node
/*
  removeOdepData.js
  Safely remove ODEP-related data (payments, promo records, enrollments, queue, students)
  Runs inside a transaction and prints before/after counts.
*/

const { sequelize } = require("../models");

async function run() {
  const transaction = await sequelize.transaction();
  try {
    console.log('Gathering counts before deletion...');
    const before = {};
    const totals = await Promise.all([
      sequelize.query('SELECT COUNT(*) AS cnt FROM Students', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Enrollments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Payments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query("SELECT COUNT(*) AS cnt FROM online_import_queue WHERE source = 'odep'", { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query("SELECT COUNT(*) AS cnt FROM Enrollments WHERE enrollment_channel = 'odep'", { type: sequelize.QueryTypes.SELECT, transaction }),
    ]);
    before.students = Number(totals[0][0].cnt || 0);
    before.enrollments = Number(totals[1][0].cnt || 0);
    before.payments = Number(totals[2][0].cnt || 0);
    before.queue_odep = Number(totals[3][0].cnt || 0);
    before.enrollments_odep = Number(totals[4][0].cnt || 0);
    console.log('Before:', before);

    console.log('\nDeleting Payments for ODEP enrollments...');
    await sequelize.query(
      `DELETE p FROM Payments p JOIN Enrollments e ON p.enrollment_id = e.id WHERE e.enrollment_channel = 'odep'`,
      { transaction }
    );

    console.log('Deleting promo_entitlements linked to ODEP promo_packages...');
    await sequelize.query(
      `DELETE pe FROM promo_entitlements pe JOIN promo_packages pp ON pe.promo_package_id = pp.id JOIN Enrollments e ON pp.enrollment_id = e.id WHERE e.enrollment_channel = 'odep'`,
      { transaction }
    );

    console.log('Deleting promo_packages linked to ODEP enrollments...');
    await sequelize.query(
      `DELETE pp FROM promo_packages pp JOIN Enrollments e ON pp.enrollment_id = e.id WHERE e.enrollment_channel = 'odep'`,
      { transaction }
    );

    console.log('Deleting Enrollments with enrollment_channel = odep...');
    await sequelize.query(
      `DELETE FROM Enrollments WHERE enrollment_channel = 'odep'`,
      { transaction }
    );

    console.log('Deleting online_import_queue rows for source=odep...');
    await sequelize.query(
      `DELETE FROM online_import_queue WHERE source = 'odep'`,
      { transaction }
    );

    console.log('Deleting student_profiles for external_source=odep with no enrollments...');
    await sequelize.query(
      `DELETE sp FROM student_profiles sp JOIN Students s ON sp.student_id = s.id WHERE s.external_source = 'odep' AND NOT EXISTS (SELECT 1 FROM Enrollments e WHERE e.student_id = s.id)`,
      { transaction }
    );

    console.log('Deleting Students with external_source=odep and no enrollments...');
    await sequelize.query(
      `DELETE s FROM Students s WHERE s.external_source = 'odep' AND NOT EXISTS (SELECT 1 FROM Enrollments e WHERE e.student_id = s.id)`,
      { transaction }
    );

    // Recount after deletion
    const afterTotals = await Promise.all([
      sequelize.query('SELECT COUNT(*) AS cnt FROM Students', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Enrollments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Payments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query("SELECT COUNT(*) AS cnt FROM online_import_queue WHERE source = 'odep'", { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query("SELECT COUNT(*) AS cnt FROM Enrollments WHERE enrollment_channel = 'odep'", { type: sequelize.QueryTypes.SELECT, transaction }),
    ]);
    const after = {
      students: Number(afterTotals[0][0].cnt || 0),
      enrollments: Number(afterTotals[1][0].cnt || 0),
      payments: Number(afterTotals[2][0].cnt || 0),
      queue_odep: Number(afterTotals[3][0].cnt || 0),
      enrollments_odep: Number(afterTotals[4][0].cnt || 0),
    };

    await transaction.commit();

    console.log('\nDeletion complete. After:', after);
    await sequelize.close();
  } catch (err) {
    console.error('Removal failed, rolling back:', err && err.message ? err.message : err);
    try { await transaction.rollback(); } catch (e) { /* ignore rollback errors */ }
    try { await sequelize.close(); } catch (e) { /* ignore close errors */ }
    process.exitCode = 1;
  }
}

run();
