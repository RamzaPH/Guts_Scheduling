const Joi = require("joi");

const sourceSchema = Joi.string().valid("saferoads", "otdc", "odep", "partner").required();

const manualIngestSchema = Joi.object({
  source: sourceSchema,
  applications: Joi.array()
    .items(
      Joi.object({
        external_ref: Joi.string().trim().min(1).required(),
        raw_payload: Joi.object().unknown(true).default({}),
        mapped_payload: Joi.object().unknown(true).allow(null).default(null),
      })
    )
    .min(1)
    .required(),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const approveMatchSchema = Joi.object({
  student_id: Joi.number().integer().positive().required(),
  reviewer_note: Joi.string().trim().allow("", null),
});

const approveCreateSchema = Joi.object({
  override_mapped_payload: Joi.object().unknown(true).allow(null),
  reviewer_note: Joi.string().trim().allow("", null),
});

module.exports = {
  manualIngestSchema,
  idParamSchema,
  approveMatchSchema,
  approveCreateSchema,
};
