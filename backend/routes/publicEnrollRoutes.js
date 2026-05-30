const express = require("express");
const { QRCode, PromoOffer, Instructor, Vehicle } = require("../models");
const rateLimit = require("express-rate-limit");
const enrollmentsService = require("../src/modules/enrollments/enrollments.service");

const router = express.Router();

function createPublicLimiter(maxRequests) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: "Too many requests. Please wait a minute and try again.",
      });
    },
  });
}

// Use a higher read limit because opening a public form can trigger multiple requests in quick succession.
const publicReadLimiter = createPublicLimiter(60);
const publicSubmitLimiter = createPublicLimiter(20);
router.use(["/enroll", "/enroll/promo-offers", "/enroll/schedule-options"], publicReadLimiter);
router.use("/enroll/submit", publicSubmitLimiter);

function resolveEnrollmentType(template) {
  const explicitType = String(template?.enrollment_type || "").trim().toUpperCase();
  if (explicitType === "TDC" || explicitType === "PDC" || explicitType === "PROMO") {
    return explicitType;
  }

  const normalizedName = String(template?.name || "").toLowerCase();
  if (normalizedName.includes("promo")) {
    return "PROMO";
  }
  if (normalizedName.includes("pdc")) {
    return "PDC";
  }
  if (normalizedName.includes("tdc")) {
    return "TDC";
  }

  return null;
}

// GET /enroll?token=... - fetch QR template (public)
router.get("/enroll", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });
  const qr = await QRCode.findOne({ where: { token, revoked: false } });
  if (!qr) return res.status(404).json({ error: "QR code not found or revoked" });
  res.json({ name: qr.name, template: qr.template });
});

// GET /enroll/promo-offers?token=... - list active promo offers scoped to this QR form type
router.get("/enroll/promo-offers", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const qr = await QRCode.findOne({ where: { token, revoked: false } });
    if (!qr) return res.status(404).json({ error: "QR code not found or revoked" });

    const offers = await PromoOffer.findAll({
      where: {
        status: "active",
      },
      attributes: ["id", "name", "description", "fixed_price", "discounted_price", "applies_to"],
      order: [["id", "DESC"]],
    });

    const enrollmentType = resolveEnrollmentType(qr.template);
    const normalizedEnrollmentType = String(enrollmentType || "").toUpperCase();

    const mapped = offers.map((offer) => ({
      ...offer.toJSON(),
      is_applicable: !offer.applies_to || offer.applies_to === "ALL" || offer.applies_to === normalizedEnrollmentType,
    }));

    const applicableOffers = mapped.filter((offer) => offer.is_applicable);

    // Sort by name ascending for stable display.
    applicableOffers.sort((a, b) => {
      if (a.is_applicable === b.is_applicable) return String(a.name || "").localeCompare(String(b.name || ""));
      return a.is_applicable ? -1 : 1;
    });

    res.json(applicableOffers);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load promo offers" });
  }
});

// GET /enroll/schedule-options?token=... - fetch instructors and vehicles for scheduling fields
router.get("/enroll/schedule-options", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const qr = await QRCode.findOne({ where: { token, revoked: false } });
    if (!qr) return res.status(404).json({ error: "QR code not found or revoked" });

    // Fetch active instructors (status is "Active" capitalized)
    const instructors = await Instructor.findAll({
      where: { status: "Active" },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    // Fetch available vehicles (status is "Available" capitalized)
    const vehicles = await Vehicle.findAll({
      where: { status: "Available" },
      attributes: ["id", "plate_number", "vehicle_type"],
      order: [["plate_number", "ASC"]],
    });

    res.json({
      instructors: instructors.map((inst) => ({ value: String(inst.id), label: inst.name })),
      vehicles: vehicles.map((veh) => ({ value: String(veh.id), label: `${veh.plate_number} (${veh.vehicle_type})` })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to load schedule options" });
  }
});

// POST /enroll/submit - submit enrollment (public)
router.post("/enroll/submit", async (req, res) => {
  const { token, data } = req.body;
  if (!token || !data) return res.status(400).json({ error: "Missing token or data" });
  const qr = await QRCode.findOne({ where: { token, revoked: false } });
  if (!qr) return res.status(404).json({ error: "QR code not found or revoked" });

  const enrollment = await enrollmentsService.addEnrollment({
    ...data,
    qrCodeId: qr.id,
    enrollment: {
      ...(data.enrollment || {}),
      status: "pending",
    },
  });

  res.status(201).json({
    success: true,
    enrollmentId: enrollment.id,
    status: enrollment.status,
  });
});

module.exports = router;
