#!/usr/bin/env node

/*
  diagnoseOdepData.js
  Read-only diagnostic for ODEP-related data: prints counts and sample rows.
*/

const { sequelize, Student, Enrollment, Payment, OnlineImportQueue } = require("../models");

async function run() {
  try {
    const [studentsTotal, enrollmentsTotal, paymentsTotal] = await Promise.all([
      Student.count(),
      Enrollment.count(),
      Payment.count(),
    ]);

    const odepQueueCount = await OnlineImportQueue.count({ where: { source: 'odep' } });
    const odepQueue = await OnlineImportQueue.findAll({ where: { source: 'odep' }, order: [['id','DESC']], limit: 50 });

    const odepEnrollments = await Enrollment.findAll({ where: { enrollment_channel: 'odep' }, order: [['id','DESC']], limit: 50 });
    const odepEnrollmentCount = await Enrollment.count({ where: { enrollment_channel: 'odep' } });

    const odepPayments = await sequelize.query(
      `SELECT p.id, p.enrollment_id, p.amount, p.payment_status, p.reference_number
       FROM Payments p JOIN Enrollments e ON p.enrollment_id = e.id
       WHERE e.enrollment_channel = 'odep' LIMIT 50`,
      { type: sequelize.QueryTypes.SELECT }
    );

    console.log('COUNTS:');
    console.log({ studentsTotal, enrollmentsTotal, paymentsTotal, odepQueueCount, odepEnrollmentCount });

    console.log('\nODEP online_import_queue rows (up to 50):');
    odepQueue.forEach((q) => {
      console.log({ id: q.id, source: q.source, external_ref: q.external_ref, import_status: q.import_status, error_message: q.error_message });
    });

    console.log('\nODEP Enrollments (up to 50):');
    for (const e of odepEnrollments) {
      console.log({ id: e.id, student_id: e.student_id, external_application_ref: e.external_application_ref, enrollment_channel: e.enrollment_channel, status: e.status, fee_amount: e.fee_amount });
    }

    console.log('\nODEP Payments (up to 50):');
    odepPayments.forEach((p) => console.log(p));

    await sequelize.close();
  } catch (err) {
    console.error('Diagnostic failed:', err && err.message ? err.message : err);
    try { await sequelize.close(); } catch(e) { /* ignore close errors */ }
    process.exitCode = 1;
  }
}

run();
