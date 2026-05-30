const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
	const Enrollment = sequelize.define("Enrollment", {
		student_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		schedule_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		package_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		dl_code_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		client_type: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		is_already_driver: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: false,
		},
		target_vehicle: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		transmission_type: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		motorcycle_type: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		training_method: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		pdc_type: {
			type: DataTypes.ENUM("beginner", "experience"),
			allowNull: true,
			defaultValue: null,
		},
		enrolling_for: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		score: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		enrollment_channel: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: "walk_in",
		},
		external_application_ref: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		tdc_source: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		promo_package_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		promo_offer_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		qrCodeId: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		tdc_completion_deadline: {
			type: DataTypes.DATEONLY,
			allowNull: true,
		},
		pdc_eligibility_date: {
			type: DataTypes.DATEONLY,
			allowNull: true,
		},
		pdc_desired_date: {
			type: DataTypes.DATEONLY,
			allowNull: true,
		},
		pdc_desired_time_slot: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		pdc_valid_until: {
			type: DataTypes.DATEONLY,
			allowNull: true,
		},
		pdc_start_mode: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: "later",
		},
		fee_amount: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
		},
		discount_amount: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
		},
		additional_promos_amount: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0,
		},
		additional_promo_offer_ids: {
			type: DataTypes.JSON,
			allowNull: true,
			defaultValue: null,
		},
		payment_terms: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		payment_reference_number: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		payment_notes: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		enrollment_state: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: "active",
		},
		status: {
			type: DataTypes.ENUM("pending", "confirmed", "completed"),
			allowNull: true,
			defaultValue: "pending",
		},
		created_at: {
			type: DataTypes.DATE,
			allowNull: true,
		},
	});

	return Enrollment;
};
