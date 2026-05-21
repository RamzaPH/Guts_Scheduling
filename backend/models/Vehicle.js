const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
	const Vehicle = sequelize.define("Vehicle", {
		vehicle_name: {
			type: DataTypes.STRING(100),
			allowNull: true,
		},
		plate_number: {
			type: DataTypes.STRING(50),
			allowNull: true,
		},
		vehicle_type: {
			type: DataTypes.STRING(50),
			allowNull: true,
			validate: {
				isIn: [["Sedan", "Motorcycle", "Tricycle", "Car", "Motor"]],
			},
		},
		transmission_type: {
			type: DataTypes.STRING(20),
			allowNull: false,
			defaultValue: "Automatic",
			validate: {
				isIn: [["Automatic", "Manual"]],
			},
		},
		status: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: "Available",
			validate: {
				isIn: [["Available", "In use", "In Service", "Maintenance", "Archived"]],
			},
		},
		created_at: {
			type: DataTypes.DATE,
			allowNull: true,
		},
	});

	return Vehicle;
};
