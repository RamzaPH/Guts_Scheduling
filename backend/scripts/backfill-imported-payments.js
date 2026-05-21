/**
 * Backfill missing Payment records for imported TDC enrollments.
 * Imported students from OTDC/SafeRoads should have Payment records set to "paid" status.
 * This script also normalizes historical imported rows that were stored at 999 so reports and ledger totals
 * match the current 599 GUTS share.
 * 
 * Usage: node scripts/backfill-imported-payments.js
 */

require("dotenv").config();
const path = require("path");
const { Payment, sequelize } = require(path.join(__dirname, "../models"));

const IMPORTED_TDC_AMOUNT = 599;

async function backfillImportedPayments() {
  console.log("Starting backfill of imported payments...");

  try {
    await sequelize.transaction(async (transaction) => {
      const [updatedEnrollments] = await sequelize.query(
        `UPDATE Enrollments
         SET fee_amount = :importedAmount
         WHERE enrollment_channel IN ('otdc', 'saferoads', 'odep')
           AND CAST(fee_amount AS DECIMAL(10,2)) <> :importedAmount`,
        {
          replacements: { importedAmount: IMPORTED_TDC_AMOUNT },
          transaction,
        }
      );

      const [updatedPayments] = await sequelize.query(
        `UPDATE Payments p
         INNER JOIN Enrollments e ON e.id = p.enrollment_id
         SET p.amount = :importedAmount
         WHERE e.enrollment_channel IN ('otdc', 'saferoads', 'odep')
           AND p.payment_status = 'paid'
           AND CAST(p.amount AS DECIMAL(10,2)) <> :importedAmount`,
        {
          replacements: { importedAmount: IMPORTED_TDC_AMOUNT },
          transaction,
        }
      );

      console.log(`Normalized imported enrollments to ${IMPORTED_TDC_AMOUNT}:`, updatedEnrollments || 0);
      console.log(`Normalized imported payments to ${IMPORTED_TDC_AMOUNT}:`, updatedPayments || 0);

      const importedEnrollments = await sequelize.query(
        `SELECT e.id, e.student_id, e.fee_amount, e.payment_reference_number, e.external_application_ref, e.enrollment_channel, e.created_at
         FROM Enrollments e
         WHERE e.enrollment_channel IN ('otdc', 'saferoads', 'odep')
         AND NOT EXISTS (SELECT 1 FROM Payments p WHERE p.enrollment_id = e.id)`,
      {
        transaction,
        type: sequelize.QueryTypes.SELECT,
      }
      );

      console.log(`Found ${importedEnrollments.length} imported enrollments without payments`);

      let created = 0;

      for (const enrollment of importedEnrollments) {
        try {
          // Create a Payment record set to "paid" status
          const referenceNumber = enrollment.payment_reference_number || enrollment.external_application_ref || `imported-${enrollment.id}`;

          await Payment.create(
            {
              enrollment_id: enrollment.id,
              amount: IMPORTED_TDC_AMOUNT,
              payment_method: enrollment.enrollment_channel === "otdc" ? "bank_transfer" : "cash",
              payment_status: "paid",
              reference_number: referenceNumber,
              account_number: null,
              created_at: enrollment.created_at,
            },
            { transaction }
          );

          created += 1;
          if (created % 10 === 0) {
            console.log(`  Created ${created} payments...`);
          }
        } catch (err) {
          console.error(`  Error creating payment for enrollment ${enrollment.id}:`, err.message);
        }
      }

      console.log(`\nBackfill complete:`);
      console.log(`  Created: ${created}`);
      console.log(`  Total processed: ${created}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
}

// Run the backfill
backfillImportedPayments();
