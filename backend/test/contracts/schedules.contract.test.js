const test = require("node:test");
const assert = require("node:assert/strict");
const { Course, Instructor, Vehicle, Schedule, Enrollment, Student, DLCode } = require("../../models");
const { getTestClient, loginAsAdmin, loginAsStaff } = require("../helpers/appTestHarness");
const { uniqueLabel, addDaysIso, nextWeekdayIso } = require("../helpers/dateUtils");

test.describe("Schedules API contract", () => {
  let client;
  let token;
  let staffToken;
  const cleanup = {
    scheduleIds: [],
    enrollmentIds: [],
    studentIds: [],
    dlCodeIds: [],
    courseIds: [],
    instructorIds: [],
    vehicleIds: [],
  };

  test.before(async () => {
    client = await getTestClient();
    token = await loginAsAdmin(client);
    staffToken = await loginAsStaff(client);
  });

  test.afterEach(async () => {
    if (cleanup.enrollmentIds.length) {
      await Enrollment.update(
        { schedule_id: null },
        { where: { id: cleanup.enrollmentIds } }
      );
      await Enrollment.destroy({ where: { id: cleanup.enrollmentIds } });
      cleanup.enrollmentIds = [];
    }

    if (cleanup.scheduleIds.length) {
      await Enrollment.update(
        { schedule_id: null },
        { where: { schedule_id: cleanup.scheduleIds } }
      );
      await Schedule.destroy({ where: { id: cleanup.scheduleIds } });
      cleanup.scheduleIds = [];
    }

    if (cleanup.courseIds.length) {
      await Course.destroy({ where: { id: cleanup.courseIds } });
      cleanup.courseIds = [];
    }

    if (cleanup.instructorIds.length) {
      await Instructor.destroy({ where: { id: cleanup.instructorIds } });
      cleanup.instructorIds = [];
    }

    if (cleanup.vehicleIds.length) {
      await Vehicle.destroy({ where: { id: cleanup.vehicleIds } });
      cleanup.vehicleIds = [];
    }

    if (cleanup.studentIds.length) {
      await Student.destroy({ where: { id: cleanup.studentIds } });
      cleanup.studentIds = [];
    }

    if (cleanup.dlCodeIds.length) {
      await DLCode.destroy({ where: { id: cleanup.dlCodeIds } });
      cleanup.dlCodeIds = [];
    }
  });

  async function createScheduleDependencies({
    courseName = uniqueLabel("Course"),
    specialization = "PDC Certified",
    tdcCertified = false,
    pdcBeginnerCertified = false,
    pdcExperienceCertified = false,
  } = {}) {
    const course = await Course.create({
      course_name: courseName,
      description: "Schedule contract test",
    });
    const instructor = await Instructor.create({
      name: uniqueLabel("Instructor"),
      license_number: uniqueLabel("LIC"),
      specialization,
      status: "Active",
      tdc_certified: tdcCertified,
      pdc_beginner_certified: pdcBeginnerCertified,
      pdc_experience_certified: pdcExperienceCertified,
      phone: "09170000000",
    });
    const vehicle = await Vehicle.create({
      vehicle_name: uniqueLabel("Vehicle"),
      plate_number: uniqueLabel("PLATE"),
      vehicle_type: "Sedan",
    });

    cleanup.courseIds.push(course.id);
    cleanup.instructorIds.push(instructor.id);
    cleanup.vehicleIds.push(vehicle.id);

    return { course, instructor, vehicle };
  }

  async function createEnrollmentForScheduling({
    status = "confirmed",
    dlCode = "PDC",
    pdcType = "beginner",
  } = {}) {
    const student = await Student.create({
      first_name: uniqueLabel("StudentFirst"),
      last_name: uniqueLabel("StudentLast"),
      email: `${uniqueLabel("student")}@example.com`,
      phone: "09170000001",
    });

    let dlCodeRow = await DLCode.findOne({ where: { code: dlCode } });
    if (!dlCodeRow) {
      dlCodeRow = await DLCode.create({
        code: dlCode,
        description: `DL code ${dlCode}`,
      });
      cleanup.dlCodeIds.push(dlCodeRow.id);
    }

    const enrollment = await Enrollment.create({
      student_id: student.id,
      dl_code_id: dlCodeRow.id,
      status,
      pdc_type: pdcType,
      created_at: new Date(),
    });

    cleanup.studentIds.push(student.id);
    cleanup.enrollmentIds.push(enrollment.id);

    return { student, enrollment };
  }

  async function findAvailableBeginnerStartDate(instructorId, vehicleId) {
    for (let weeksAhead = 6; weeksAhead <= 28; weeksAhead += 1) {
      const dayOne = nextWeekdayIso(1, weeksAhead); // Monday
      const dayTwo = addDaysIso(dayOne, 1);

      const dayOneQuery = new URLSearchParams({
        date: dayOne,
        course_type: "pdc_beginner",
        instructor_id: String(instructorId),
        vehicle_id: String(vehicleId),
      });
      const dayTwoQuery = new URLSearchParams({
        date: dayTwo,
        course_type: "pdc_beginner",
        instructor_id: String(instructorId),
        vehicle_id: String(vehicleId),
      });

      const [dayOneResponse, dayTwoResponse] = await Promise.all([
        client
          .get(`/api/schedules/day?${dayOneQuery.toString()}`)
          .set("Authorization", `Bearer ${token}`),
        client
          .get(`/api/schedules/day?${dayTwoQuery.toString()}`)
          .set("Authorization", `Bearer ${token}`),
      ]);

      if (dayOneResponse.status !== 200 || dayTwoResponse.status !== 200) {
        continue;
      }

      const dayOneMorning = (dayOneResponse.body?.data?.slots || []).find((slot) => slot.slot === "morning");
      const dayTwoMorning = (dayTwoResponse.body?.data?.slots || []).find((slot) => slot.slot === "morning");
      if (!dayOneMorning || !dayTwoMorning || dayOneMorning.full || dayTwoMorning.full) {
        continue;
      }

      return dayOne;
    }

    return nextWeekdayIso(1, 6);
  }

  test("POST /api/schedules returns wrapped success payload with mapped item", async () => {
    const { course, instructor, vehicle } = await createScheduleDependencies({
      courseName: "PDC Beginner",
      specialization: "PDC Certified",
      pdcBeginnerCertified: true,
    });
    const scheduleDate = await findAvailableBeginnerStartDate(instructor.id, vehicle.id);

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_id: course.id,
        course_type: "pdc_beginner",
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "Morning session",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.meta?.type, "schedule-create");
    assert.equal(response.body.meta?.date, scheduleDate);
    assert.equal(response.body.meta?.slot, "morning");
    assert.ok(response.body.data?.item);
    assert.equal(response.body.data.item.scheduleDate, scheduleDate);
    assert.equal(response.body.data.item.slot, "morning");
    assert.equal(response.body.data.item.course, course.course_name);
    assert.equal(response.body.data.item.instructor, instructor.name);
    assert.match(response.body.data.item.vehicleType, /Sedan|Vehicle/i);

    cleanup.scheduleIds.push(response.body.data.item.id);
  });

  test("POST /api/schedules accepts course_type and returns canonical course label", async () => {
    const scheduleDate = nextWeekdayIso(1, 5); // Monday
    const { instructor } = await createScheduleDependencies({
      courseName: "TDC",
      specialization: "TDC Certified",
      tdcCertified: true,
    });

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "Type-based schedule",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.meta?.type, "schedule-create");
    assert.equal(response.body.data?.item?.course, "TDC");

    cleanup.scheduleIds.push(response.body.data.item.id);
  });

  test("POST /api/schedules allows repeated TDC instructor usage while capacity remains", async () => {
    const scheduleDate = nextWeekdayIso(1, 6); // Monday
    const { instructor } = await createScheduleDependencies({
      courseName: "TDC",
      specialization: "TDC Certified",
      tdcCertified: true,
    });

    const first = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "First TDC booking",
      });

    const second = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "Second TDC booking",
      });

    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));

    cleanup.scheduleIds.push(first.body.data.item.id, second.body.data.item.id);
  });

  test("POST /api/schedules allows bookings on configured holidays", async () => {
    const { instructor } = await createScheduleDependencies({
      courseName: "TDC",
      specialization: "TDC Certified",
      tdcCertified: true,
    });
    const holidayDate = nextWeekdayIso(2, 7);
    const originalHolidays = process.env.SCHEDULE_HOLIDAYS || "";

    process.env.SCHEDULE_HOLIDAYS = holidayDate;

    try {
      const response = await client
        .post("/api/schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          course_type: "tdc",
          instructor_id: instructor.id,
          vehicle_id: null,
          schedule_date: holidayDate,
          slot: "morning",
          remarks: "Holiday booking",
        });

      assert.equal(response.status, 201, JSON.stringify(response.body));
      cleanup.scheduleIds.push(response.body.data.item.id);
    } finally {
      process.env.SCHEDULE_HOLIDAYS = originalHolidays;
    }
  });

  test("POST /api/schedules links selected enrollment and student with inferred course type", async () => {
    const { instructor, vehicle } = await createScheduleDependencies({
      courseName: "PDC Beginner",
      specialization: "PDC Certified",
      pdcBeginnerCertified: true,
    });
    const { student, enrollment } = await createEnrollmentForScheduling({
      status: "confirmed",
      dlCode: "PDC",
      pdcType: "beginner",
    });
    const scheduleDate = await findAvailableBeginnerStartDate(instructor.id, vehicle.id);

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        enrollment_id: enrollment.id,
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: scheduleDate,
        slot: "morning",
      });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data?.item?.course, "PDC Beginner");
    assert.equal(response.body.data?.item?.studentId, student.id);
    assert.equal(response.body.data?.item?.enrollmentId, enrollment.id);
    assert.match(response.body.data?.item?.studentName || "", new RegExp(student.first_name));

    const reloadedEnrollment = await Enrollment.findByPk(enrollment.id);
    assert.equal(reloadedEnrollment?.schedule_id, response.body.data.item.id);

    cleanup.scheduleIds.push(response.body.data.item.id);
  });

  test("GET /api/schedules/day returns wrapped day payload", async () => {
    const scheduleDate = nextWeekdayIso(2, 5); // Tuesday
    const { course, instructor, vehicle } = await createScheduleDependencies({
      courseName: "PDC Beginner",
      specialization: "PDC Certified",
      pdcBeginnerCertified: true,
    });

    const created = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_id: course.id,
        course_type: "pdc_beginner",
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: scheduleDate,
        slot: "afternoon",
        remarks: "Afternoon session",
      });

    cleanup.scheduleIds.push(created.body.data.item.id);

    const response = await client
      .get(`/api/schedules/day?date=${scheduleDate}`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.meta?.type, "schedule-day");
    assert.equal(response.body.meta?.date, scheduleDate);
    assert.equal(response.body.data?.date, scheduleDate);
    assert.equal(Array.isArray(response.body.data?.slots), true);
    assert.equal(Array.isArray(response.body.data?.items), true);
    assert.ok(response.body.data.items.some((item) => item.id === created.body.data.item.id));
  });

  test("GET /api/schedules/month-status returns wrapped month payload", async () => {
    const response = await client
      .get("/api/schedules/month-status?year=2026&month=3")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.meta?.type, "schedule-month-status");
    assert.equal(response.body.data?.year, 2026);
    assert.equal(response.body.data?.month, 3);
    assert.equal(Array.isArray(response.body.data?.items), true);
  });

  test("POST /api/schedules rejects invalid slot with validation error details", async () => {
    const { course, instructor, vehicle } = await createScheduleDependencies();

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_id: course.id,
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: "2026-03-20",
        slot: "evening",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Validation error");
    assert.equal(Array.isArray(response.body.details), true);
  });

  test("DELETE /api/schedules/:id rejects non-admin direct modifications", async () => {
    const scheduleDate = nextWeekdayIso(1, 8);
    const { instructor } = await createScheduleDependencies({
      courseName: "TDC",
      specialization: "TDC Certified",
      tdcCertified: true,
    });

    const created = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
      });

    cleanup.scheduleIds.push(created.body.data.item.id);

    const response = await client
      .delete(`/api/schedules/${created.body.data.item.id}?scope=single`)
      .set("Authorization", `Bearer ${staffToken}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Unauthorized: Admin approval required for schedule modifications.");
  });

  test("staff can request a schedule change and admin can approve it", async () => {
    const scheduleDate = nextWeekdayIso(2, 8);
    const newScheduleDate = nextWeekdayIso(3, 9);
    const { instructor } = await createScheduleDependencies({
      courseName: "TDC",
      specialization: "TDC Certified",
      tdcCertified: true,
    });

    const created = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
      });

    const scheduleId = created.body.data.item.id;
    cleanup.scheduleIds.push(scheduleId);

    const requestResponse = await client
      .post("/api/schedule-change-requests")
      .set("Authorization", `Bearer ${staffToken}`)
      .send({
        schedule_id: scheduleId,
        requested_schedule_date: newScheduleDate,
        requested_slot: "afternoon",
        reason: "Student requested a new session time.",
      });

    assert.equal(requestResponse.status, 201, JSON.stringify(requestResponse.body));
    assert.equal(requestResponse.body.data.item.status, "pending");

    const pendingResponse = await client
      .get("/api/schedule-change-requests/pending")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(pendingResponse.status, 200);
    assert.ok((pendingResponse.body.data.items || []).some((item) => item.id === requestResponse.body.data.item.id));

    const approveResponse = await client
      .post(`/api/schedule-change-requests/${requestResponse.body.data.item.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    assert.equal(approveResponse.status, 200, JSON.stringify(approveResponse.body));
    assert.equal(approveResponse.body.data.item.status, "approved");

    const dayResponse = await client
      .get(`/api/schedules/day?date=${newScheduleDate}&course_type=tdc`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(dayResponse.status, 200);
    const rescheduledItem = (dayResponse.body.data.items || []).find((item) => item.slot === "afternoon");
    assert.ok(rescheduledItem);

    cleanup.scheduleIds = cleanup.scheduleIds.filter((id) => id !== scheduleId);
    cleanup.scheduleIds.push(rescheduledItem.id);
  });
});
