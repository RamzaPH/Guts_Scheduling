"use strict";

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const table = await queryInterface.describeTable(tableName);
  if (!table[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const table = await queryInterface.describeTable(tableName);
  if (table[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumnIfMissing(queryInterface, "enrollments", "pdc_desired_date", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });

    await addColumnIfMissing(queryInterface, "enrollments", "pdc_desired_time_slot", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await removeColumnIfExists(queryInterface, "enrollments", "pdc_desired_time_slot");
    await removeColumnIfExists(queryInterface, "enrollments", "pdc_desired_date");
  },
};