const test = require("node:test");
const assert = require("node:assert/strict");
const { QRCode, PromoOffer, Enrollment } = require("../../models");
const { getTestClient, loginAsAdmin } = require("../helpers/appTestHarness");

function uniqueToken(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

test.describe("Public enroll API contract", () => {
  let client;
  let adminToken;
  const cleanup = {
    qrIds: [],
    promoOfferIds: [],
    enrollmentIds: [],
  };

  test.before(async () => {
    client = await getTestClient();
    adminToken = await loginAsAdmin(client);
  });

  test.afterEach(async () => {
    if (cleanup.enrollmentIds.length) {
      await Enrollment.destroy({ where: { id: cleanup.enrollmentIds } });
      cleanup.enrollmentIds = [];
    }

    if (cleanup.qrIds.length) {
      await QRCode.destroy({ where: { id: cleanup.qrIds } });
      cleanup.qrIds = [];
    }

    if (cleanup.promoOfferIds.length) {
      await PromoOffer.destroy({ where: { id: cleanup.promoOfferIds } });
      cleanup.promoOfferIds = [];
    }
  });

  async function createQr(template) {
    const response = await client
      .post("/api/admin/qrcodes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: uniqueToken("QR"),
        template,
      });

    const qr = QRCode.build(response.body);
    cleanup.qrIds.push(qr.id);
    return qr;
  }

  async function createPromo({ name, applies_to }) {
    const promo = await PromoOffer.create({
      name,
      status: "active",
      applies_to,
      fixed_price: 1000,
      discounted_price: 900,
      description: name,
    });
    cleanup.promoOfferIds.push(promo.id);
    return promo;
  }

  test("GET /api/enroll/promo-offers returns only offers applicable to the QR form", async () => {
    const qr = await createQr({ enrollment_type: "TDC", name: "TDC QR" });
    const tdcPromo = await createPromo({ name: uniqueToken("TDC Promo"), applies_to: "TDC" });
    const pdcPromo = await createPromo({ name: uniqueToken("PDC Promo"), applies_to: "PDC" });
    const allPromo = await createPromo({ name: uniqueToken("All Promo"), applies_to: "ALL" });

    const response = await client.get(`/api/enroll/promo-offers?token=${qr.token}`);

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(Array.isArray(response.body), true);
    assert.ok(response.body.some((item) => item.id === tdcPromo.id));
    assert.ok(response.body.some((item) => item.id === allPromo.id));
    assert.equal(response.body.some((item) => item.id === pdcPromo.id), false);
  });

  test("POST /api/enroll/submit rejects missing emergency contacts", async () => {
    const qr = await createQr({ enrollment_type: "TDC", name: "TDC QR" });

    const response = await client.post("/api/enroll/submit").send({
      token: qr.token,
      data: {
        enrollment_type: "TDC",
        student: {
          first_name: "Public",
          last_name: "Student",
          email: "public.student@example.com",
        },
        profile: {},
        extras: {
          region: "NCR",
        },
        enrollment: {
          client_type: "GUTS Walk-in Application",
        },
      },
    });

    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.match(String(response.body?.message || response.body?.error || ""), /emergency_contact/i);
  });

  test("POST /api/enroll/submit persists public PDC desired date and slot", async () => {
    const qr = await createQr({ enrollment_type: "PDC", name: "PDC QR" });
    const desiredDate = "2026-06-10";

    const response = await client.post("/api/enroll/submit").send({
      token: qr.token,
      data: {
        enrollment_type: "PDC",
        student: {
          first_name: "Public",
          last_name: "PDC",
          email: "public.pdc@example.com",
          phone: "09170000002",
        },
        profile: {
          gmail_account: "public.pdc@example.com",
        },
        extras: {
          region: "NCR",
          emergency_contact_person: "Parent",
          emergency_contact_number: "09170000003",
          lto_portal_account: "1234567890",
          enrolling_for: "PDC Beginner",
        },
        enrollment: {
          client_type: "GUTS Walk-in Application",
          pdc_category: "Beginner",
          is_already_driver: false,
          enrollment_channel: "qr_public",
        },
        schedule: {
          enabled: false,
          schedule_date: desiredDate,
          slot: "morning",
        },
      },
    });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.ok(response.body.enrollmentId);

    const savedEnrollment = await Enrollment.findByPk(response.body.enrollmentId);
    assert.ok(savedEnrollment);
    assert.equal(savedEnrollment.pdc_desired_date, desiredDate);
    assert.equal(savedEnrollment.pdc_desired_time_slot, "morning");

    cleanup.enrollmentIds.push(savedEnrollment.id);
  });
});