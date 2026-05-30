const test = require("node:test");
const assert = require("node:assert/strict");
const { Course, Instructor, Vehicle, Schedule, Enrollment } = require("../../models");
const { getTestClient, loginAsAdmin } = require("../helpers/appTestHarness");
const { uniqueLabel, toIsoDate, addDaysIso, nextWeekdayIso } = require("../helpers/dateUtils");

test.describe("Scheduling live verification matrix", () => {
  let client;
  let token;
  const cleanup = {
    scheduleIds: [],
    courseIds: [],
    instructorIds: [],
    vehicleIds: [],
  };

  test.before(async () => {
    client = await getTestClient();
    token = await loginAsAdmin(client);
  });

  test.afterEach(async () => {
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
  });

  async function createInstructorForCourse(courseType) {
    const payload = {
      name: uniqueLabel(`Instructor-${courseType}`),
      license_number: uniqueLabel(`LIC-${courseType}`),
      specialization: courseType.includes("tdc") ? "TDC Certified" : "PDC Certified",
      status: "Active",
      phone: "09170000000",
      tdc_certified: false,
      pdc_beginner_certified: false,
      pdc_experience_certified: false,
    };

    if (courseType === "tdc") payload.tdc_certified = true;
    if (courseType === "pdc_beginner") payload.pdc_beginner_certified = true;
    if (courseType === "pdc_experience") payload.pdc_experience_certified = true;

    const instructor = await Instructor.create(payload);
    cleanup.instructorIds.push(instructor.id);
    return instructor;
  }

  async function createVehicle(label = "Vehicle") {
    const vehicle = await Vehicle.create({
      vehicle_name: uniqueLabel(label),
      plate_number: uniqueLabel("PLATE"),
      vehicle_type: "Sedan",
    });

    cleanup.vehicleIds.push(vehicle.id);
    return vehicle;
  }

  async function findFirstAvailableDate({
    courseType,
    instructorId,
    vehicleId,
    weekday = 1,
    startWeeksAhead = 6,
    maxWeeksAhead = 24,
  }) {
    for (let weeksAhead = startWeeksAhead; weeksAhead <= maxWeeksAhead; weeksAhead += 1) {
      const candidate = nextWeekdayIso(weekday, weeksAhead);
      const query = new URLSearchParams({
        date: candidate,
        course_type: courseType,
      });

      if (instructorId) {
        query.set("instructor_id", String(instructorId));
      }
      if (vehicleId) {
        query.set("vehicle_id", String(vehicleId));
      }

      const dayResponse = await client
        .get(`/api/schedules/day?${query.toString()}`)
        .set("Authorization", `Bearer ${token}`);

      if (dayResponse.status !== 200) {
        continue;
      }

      if (dayResponse.body?.data?.dayRestriction?.operational === false) {
        continue;
      }

      const morning = (dayResponse.body?.data?.slots || []).find((slot) => slot.slot === "morning");
      if (!morning || morning.full) {
        continue;
      }

      if (courseType === "pdc_beginner") {
        const nextDay = addDaysIso(candidate, 1);
        const nextQuery = new URLSearchParams({
          date: nextDay,
          course_type: courseType,
        });
        if (instructorId) {
          nextQuery.set("instructor_id", String(instructorId));
        }
        if (vehicleId) {
          nextQuery.set("vehicle_id", String(vehicleId));
        }

        const nextDayResponse = await client
          .get(`/api/schedules/day?${nextQuery.toString()}`)
          .set("Authorization", `Bearer ${token}`);
        if (nextDayResponse.status !== 200) {
          continue;
        }
        if (nextDayResponse.body?.data?.dayRestriction?.operational === false) {
          continue;
        }

        const nextMorning = (nextDayResponse.body?.data?.slots || []).find((slot) => slot.slot === "morning");
        if (!nextMorning || nextMorning.full) {
          continue;
        }
      }

      return candidate;
    }

    return nextWeekdayIso(weekday, startWeeksAhead);
  }

  test("Scenario 1: TDC booking works without vehicle", async () => {
    const instructor = await createInstructorForCourse("tdc");
    const scheduleDate = nextWeekdayIso(1, 5); // Monday
    const nextOperationalDate = addDaysIso(scheduleDate, 1);

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "tdc",
        instructor_id: instructor.id,
        vehicle_id: null,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "Matrix TDC no vehicle",
      });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.data?.courseType, "tdc");
    assert.equal(Array.isArray(response.body.data?.reservedDates), true);
    assert.deepEqual(response.body.data?.reservedDates, [scheduleDate, nextOperationalDate]);

    const createdIds = (response.body.data?.createdItems || []).map((item) => item.id);
    assert.equal(createdIds.length, 4);
    cleanup.scheduleIds.push(...createdIds);

    const dayResponse = await client
      .get(`/api/schedules/day?date=${scheduleDate}&course_type=tdc&instructor_id=${instructor.id}`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(dayResponse.status, 200);
    assert.equal(dayResponse.body.data?.slots?.length > 0, true);
    assert.equal(dayResponse.body.data?.slots?.some((slot) => slot.full === true), true);
  });

  test("Scenario 2A: PDC Beginner creates two consecutive-day rows", async () => {
    const instructor = await createInstructorForCourse("pdc_beginner");
    const vehicle = await createVehicle("BeginnerVehicle");
    const scheduleDate = await findFirstAvailableDate({
      courseType: "pdc_beginner",
      instructorId: instructor.id,
      vehicleId: vehicle.id,
      weekday: 1,
      startWeeksAhead: 6,
      maxWeeksAhead: 28,
    });
    const plusOne = new Date(`${scheduleDate}T00:00:00Z`);
    plusOne.setUTCDate(plusOne.getUTCDate() + 1);
    const dayTwoIso = toIsoDate(plusOne);

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "pdc_beginner",
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: scheduleDate,
        slot: "morning",
        remarks: "Matrix beginner two day",
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.data?.courseType, "pdc_beginner");
    assert.deepEqual(response.body.data?.reservedDates, [scheduleDate, dayTwoIso]);

    const createdItems = response.body.data?.createdItems || [];
    assert.equal(createdItems.length, 2);

    cleanup.scheduleIds.push(...createdItems.map((item) => item.id));
  });

  test("Scenario 2B: Thursday beginner booking is blocked (Option A)", async () => {
    const instructor = await createInstructorForCourse("pdc_beginner");
    const vehicle = await createVehicle("BeginnerEdgeVehicle");
    const thursdayDate = nextWeekdayIso(4, 6); // Thursday

    const response = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "pdc_beginner",
        instructor_id: instructor.id,
        vehicle_id: vehicle.id,
        schedule_date: thursdayDate,
        slot: "morning",
        remarks: "Matrix Thursday beginner edge",
      });

    assert.equal(response.status, 400);
    assert.match(String(response.body?.message || ""), /Second beginner session|non-operational|Monday to Thursday/i);
  });

  test("Scenario 3: PDC Experience allows up to three bookings per day", async () => {
    const lockDate = nextWeekdayIso(2, 7); // Tuesday
    const resources = await Promise.all([
      createInstructorForCourse("pdc_experience").then((instructor) => createVehicle("ExperiencedVehicleA").then((vehicle) => ({ instructor, vehicle }))),
      createInstructorForCourse("pdc_experience").then((instructor) => createVehicle("ExperiencedVehicleB").then((vehicle) => ({ instructor, vehicle }))),
      createInstructorForCourse("pdc_experience").then((instructor) => createVehicle("ExperiencedVehicleC").then((vehicle) => ({ instructor, vehicle }))),
      createInstructorForCourse("pdc_experience").then((instructor) => createVehicle("ExperiencedVehicleD").then((vehicle) => ({ instructor, vehicle }))),
    ]);

    const responses = [];
    for (let index = 0; index < 3; index += 1) {
      const { instructor, vehicle } = resources[index];
      const response = await client
        .post("/api/schedules")
        .set("Authorization", `Bearer ${token}`)
        .send({
          course_type: "pdc_experience",
          instructor_id: instructor.id,
          vehicle_id: vehicle.id,
          schedule_date: lockDate,
          slot: "morning",
          remarks: `Matrix experience ${index + 1}`,
        });
      responses.push(response);
    }

    const fourthResponse = await client
      .post("/api/schedules")
      .set("Authorization", `Bearer ${token}`)
      .send({
        course_type: "pdc_experience",
        instructor_id: resources[3].instructor.id,
        vehicle_id: resources[3].vehicle.id,
        schedule_date: lockDate,
        slot: "morning",
        remarks: "Matrix experience 4",
      });

    responses.forEach((response) => {
      assert.equal(response.status, 201, JSON.stringify(response.body));
      cleanup.scheduleIds.push(...(response.body.data?.createdItems || []).map((item) => item.id));
    });

    assert.equal(fourthResponse.status, 400, JSON.stringify(fourthResponse.body));
    assert.match(String(fourthResponse.body?.message || ""), /No instructors available|time slot|Resource unavailable/i);

    const dayResponse = await client
      .get(`/api/schedules/day?date=${lockDate}&course_type=pdc_experience&instructor_id=${resources[0].instructor.id}&vehicle_id=${resources[0].vehicle.id}`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(dayResponse.status, 200);
    const morning = dayResponse.body?.data?.slots?.find((slot) => slot.slot === "morning");
    assert.equal(Boolean(morning?.full), true);
    assert.match(String(morning?.fullLabel || ""), /Fully Booked|Resource Full/i);
  });
});
