#!/usr/bin/env node
/*
  wipeAllStudentsData.js
  Permanently delete all students, student_profiles, enrollments, payments, promo data, and online import queue.
  Runs in a transaction and prints counts before/after.
  USE WITH CAUTION — this deletes all student-related data.
*/

const { sequelize } = require("../models");

async function run() {
  const transaction = await sequelize.transaction();
  try {
    console.log('Gathering counts before wipe...');
    const beforeTotals = await Promise.all([
      sequelize.query('SELECT COUNT(*) AS cnt FROM Students', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Enrollments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Payments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM online_import_queue', { type: sequelize.QueryTypes.SELECT, transaction }),
    ]);

    console.log('Before counts:', {
      students: Number(beforeTotals[0][0].cnt || 0),
      enrollments: Number(beforeTotals[1][0].cnt || 0),
      payments: Number(beforeTotals[2][0].cnt || 0),
      queue: Number(beforeTotals[3][0].cnt || 0),
    });

    // Delete dependent records in safe order
    console.log('Deleting Payments...');
    await sequelize.query('DELETE FROM Payments', { transaction });

    console.log('Deleting promo_entitlements...');
    await sequelize.query('DELETE FROM promo_entitlements', { transaction });

    console.log('Deleting promo_packages...');
    await sequelize.query('DELETE FROM promo_packages', { transaction });

    console.log('Deleting Enrollments...');
    await sequelize.query('DELETE FROM Enrollments', { transaction });

    console.log('Deleting student_profiles...');
    await sequelize.query('DELETE FROM student_profiles', { transaction });

    console.log('Deleting Students...');
    await sequelize.query('DELETE FROM Students', { transaction });

    console.log('Deleting online_import_queue...');
    await sequelize.query('DELETE FROM online_import_queue', { transaction });

    const afterTotals = await Promise.all([
      sequelize.query('SELECT COUNT(*) AS cnt FROM Students', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Enrollments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM Payments', { type: sequelize.QueryTypes.SELECT, transaction }),
      sequelize.query('SELECT COUNT(*) AS cnt FROM online_import_queue', { type: sequelize.QueryTypes.SELECT, transaction }),
    ]);

    await transaction.commit();

    console.log('After counts:', {
      students: Number(afterTotals[0][0].cnt || 0),
      enrollments: Number(afterTotals[1][0].cnt || 0),
      payments: Number(afterTotals[2][0].cnt || 0),
      queue: Number(afterTotals[3][0].cnt || 0),
    });

    await sequelize.close();
  } catch (err) {
    console.error('Wipe failed, rolling back:', err && err.message ? err.message : err);
    try { await transaction.rollback(); } catch (e) { /* ignore rollback errors */ }
    try { await sequelize.close(); } catch (e) { /* ignore close errors */ }
    process.exitCode = 1;
  }
}

run();
