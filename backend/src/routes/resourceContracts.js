const Joi = require("joi");

const optionalText = Joi.string().trim().allow("", null);

function promoPriceRangeSchema(schema) {
  return schema.custom((value, helpers) => {
    if (
      value.fixed_price !== null &&
      value.fixed_price !== undefined &&
      value.discounted_price !== null &&
      value.discounted_price !== undefined &&
      Number(value.discounted_price) > Number(value.fixed_price)
    ) {
      return helpers.error("any.custom", {
        message: "discounted_price cannot be greater than fixed_price",
      });
    }

    return value;
  });
}

const courseCreateSchema = Joi.object({
  course_name: Joi.string().trim().required(),
  description: optionalText,
});

const courseUpdateSchema = Joi.object({
  course_name: Joi.string().trim(),
  description: optionalText,
}).min(1);

const packageCreateSchema = Joi.object({
  package_name: Joi.string().trim().required(),
  price: Joi.number().min(0).allow(null),
});

const packageUpdateSchema = Joi.object({
  package_name: Joi.string().trim(),
  price: Joi.number().min(0).allow(null),
}).min(1);

const promoOfferCreateSchema = promoPriceRangeSchema(Joi.object({
  name: Joi.string().trim().required(),
  description: optionalText,
  status: Joi.string().valid("active", "inactive").default("active"),
  applies_to: Joi.string().valid("ALL", "TDC", "PDC", "PROMO").default("ALL"),
  fixed_price: Joi.number().min(0).allow(null),
  discounted_price: Joi.number().min(0).allow(null),
  notes: optionalText,
}));

const promoOfferUpdateSchema = promoPriceRangeSchema(Joi.object({
  name: Joi.string().trim(),
  description: optionalText,
  status: Joi.string().valid("active", "inactive"),
  applies_to: Joi.string().valid("ALL", "TDC", "PDC", "PROMO"),
  fixed_price: Joi.number().min(0).allow(null),
  discounted_price: Joi.number().min(0).allow(null),
  notes: optionalText,
}).min(1));

const paymentCreateSchema = Joi.object({
  enrollment_id: Joi.number().integer().positive().required(),
  amount: Joi.number().positive().required(),
  payment_method: Joi.string().valid("cash", "card", "bank_transfer", "ewallet").default("cash"),
  payment_status: Joi.string().valid("pending", "paid", "failed", "refunded").default("pending"),
  reference_number: optionalText,
  account_number: optionalText,
});

const paymentUpdateSchema = Joi.object({
  enrollment_id: Joi.number().integer().positive(),
  amount: Joi.number().positive(),
  payment_method: Joi.string().valid("cash", "card", "bank_transfer", "ewallet"),
  payment_status: Joi.string().valid("pending", "paid", "failed", "refunded"),
  reference_number: optionalText,
  account_number: optionalText,
}).min(1);

const dlCodeCreateSchema = Joi.object({
  code: Joi.string().trim().required(),
  description: optionalText,
});

const dlCodeUpdateSchema = Joi.object({
  code: Joi.string().trim(),
  description: optionalText,
}).min(1);

const instructorCreateSchema = Joi.object({
  name: Joi.string().trim().required(),
  license_number: Joi.string().trim().required(),
  specialization: Joi.string().trim().allow("", null),
  status: Joi.string().valid("Active", "On Leave").required(),
  assigned_vehicle_id: Joi.number().integer().positive().allow(null),
  assigned_vehicle_ids: Joi.array().items(Joi.number().integer().positive()).unique().default([]),
  phone: Joi.string().trim().max(20).allow("", null),
  tdc_cert_expiry: Joi.date().iso().allow(null, ""),
  pdc_cert_expiry: Joi.date().iso().allow(null, ""),
  certification_file_name: optionalText,
  tdc_certified: Joi.boolean().default(false),
  pdc_beginner_certified: Joi.boolean().default(false),
  pdc_experience_certified: Joi.boolean().default(false),
}).custom((value, helpers) => {
  if (value.tdc_certified || value.pdc_beginner_certified || value.pdc_experience_certified) {
    return value;
  }

  return helpers.error("any.custom", {
    message: "At least one instructor qualification is required",
  });
});

const instructorUpdateSchema = Joi.object({
  name: Joi.string().trim(),
  license_number: Joi.string().trim(),
  specialization: Joi.string().trim().allow("", null),
  status: Joi.string().valid("Active", "On Leave"),
  assigned_vehicle_id: Joi.number().integer().positive().allow(null),
  assigned_vehicle_ids: Joi.array().items(Joi.number().integer().positive()).unique(),
  phone: Joi.string().trim().max(20).allow("", null),
  tdc_cert_expiry: Joi.date().iso().allow(null, ""),
  pdc_cert_expiry: Joi.date().iso().allow(null, ""),
  certification_file_name: optionalText,
  tdc_certified: Joi.boolean(),
  pdc_beginner_certified: Joi.boolean(),
  pdc_experience_certified: Joi.boolean(),
}).min(1);

const vehicleCreateSchema = Joi.object({
  vehicle_name: Joi.string().trim().allow("", null),
  plate_number: Joi.string().trim().required(),
  vehicle_type: Joi.string().valid("Sedan", "Motorcycle", "Tricycle", "Car", "Motor").required(),
  transmission_type: Joi.string().valid("Automatic", "Manual").default("Automatic"),
  status: Joi.string().valid("Available", "In use", "In Service", "Maintenance", "Archived").default("Available"),
});

const vehicleUpdateSchema = Joi.object({
  vehicle_name: Joi.string().trim().allow("", null),
  plate_number: Joi.string().trim(),
  vehicle_type: Joi.string().valid("Sedan", "Motorcycle", "Tricycle", "Car", "Motor"),
  transmission_type: Joi.string().valid("Automatic", "Manual"),
  status: Joi.string().valid("Available", "In use", "In Service", "Maintenance", "Archived"),
}).min(1);

const maintenanceCreateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive().required(),
  service_type: Joi.string().trim().required(),
  date_of_service: Joi.date().iso().required(),
  next_schedule_date: Joi.date().iso().required(),
  maintenance_cost: Joi.number().min(0).allow(null),
  remarks: optionalText,
});

const maintenanceUpdateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive(),
  service_type: Joi.string().trim(),
  date_of_service: Joi.date().iso(),
  next_schedule_date: Joi.date().iso(),
  maintenance_cost: Joi.number().min(0).allow(null),
  remarks: optionalText,
}).min(1);

const fuelCreateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive().required(),
  station_name: optionalText,
  price_per_liter: Joi.number().min(0).allow(null),
  liters: Joi.number().positive().required(),
  amount_spent: Joi.number().positive().required(),
  odometer_reading: Joi.number().min(0).required(),
  odometer_start: Joi.number().min(0).allow(null),
  odometer_end: Joi.number().min(0).allow(null),
  logged_at: Joi.date().iso().allow(null, ""),
}).custom((value, helpers) => {
  if (value.odometer_start !== null && value.odometer_end !== null) {
    if (Number(value.odometer_end) < Number(value.odometer_start)) {
      return helpers.error("any.custom", {
        message: "odometer_end must be greater than or equal to odometer_start",
      });
    }
  }
  return value;
});

const fuelUpdateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive(),
  station_name: optionalText,
  price_per_liter: Joi.number().min(0).allow(null),
  liters: Joi.number().positive(),
  amount_spent: Joi.number().positive(),
  odometer_reading: Joi.number().min(0),
  odometer_start: Joi.number().min(0).allow(null),
  odometer_end: Joi.number().min(0).allow(null),
  logged_at: Joi.date().iso().allow(null, ""),
}).min(1);

const vehicleUsageCreateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive().required(),
  instructor_id: Joi.number().integer().positive().allow(null),
  start_odometer: Joi.number().min(0).required(),
  end_odometer: Joi.number().min(0).allow(null),
  start_date: Joi.date().iso().allow(null, ""),
  end_date: Joi.date().iso().allow(null, ""),
  notes: optionalText,
  created_by: Joi.number().integer().positive().allow(null),
});

const vehicleUsageUpdateSchema = Joi.object({
  vehicle_id: Joi.number().integer().positive(),
  instructor_id: Joi.number().integer().positive().allow(null),
  start_odometer: Joi.number().min(0),
  end_odometer: Joi.number().min(0).allow(null),
  start_date: Joi.date().iso().allow(null, ""),
  end_date: Joi.date().iso().allow(null, ""),
  notes: optionalText,
  created_by: Joi.number().integer().positive().allow(null),
}).min(1);

const certificateCreateSchema = Joi.object({
  certificate_number: Joi.string().trim().required(),
  issue_date: Joi.date().iso().allow(null, ""),
  remarks: optionalText,
});

const certificateUpdateSchema = Joi.object({
  certificate_number: Joi.string().trim(),
  issue_date: Joi.date().iso().allow(null, ""),
  remarks: optionalText,
}).min(1);

module.exports = {
  courses: {
    createSchema: courseCreateSchema,
    updateSchema: courseUpdateSchema,
  },
  packages: {
    createSchema: packageCreateSchema,
    updateSchema: packageUpdateSchema,
  },
  promoOffers: {
    createSchema: promoOfferCreateSchema,
    updateSchema: promoOfferUpdateSchema,
  },
  payments: {
    createSchema: paymentCreateSchema,
    updateSchema: paymentUpdateSchema,
  },
  dlCodes: {
    createSchema: dlCodeCreateSchema,
    updateSchema: dlCodeUpdateSchema,
  },
  instructors: {
    createSchema: instructorCreateSchema,
    updateSchema: instructorUpdateSchema,
  },
  vehicles: {
    createSchema: vehicleCreateSchema,
    updateSchema: vehicleUpdateSchema,
  },
  maintenanceLogs: {
    createSchema: maintenanceCreateSchema,
    updateSchema: maintenanceUpdateSchema,
  },
  fuelLogs: {
    createSchema: fuelCreateSchema,
    updateSchema: fuelUpdateSchema,
  },
  vehicleUsages: {
    createSchema: vehicleUsageCreateSchema,
    updateSchema: vehicleUsageUpdateSchema,
  },
  certificates: {
    createSchema: certificateCreateSchema,
    updateSchema: certificateUpdateSchema,
  },
};
