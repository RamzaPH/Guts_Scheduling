const test = require("node:test");
const assert = require("node:assert/strict");
const { Course, Instructor, Schedule, Student } = require("../../models");
const { getTestClient, loginAsAdmin } = require("../helpers/appTestHarness");
const { uniqueLabel, nextWeekdayIso } = require("../helpers/dateUtils");

test.describe("Students API contract", () => {
  let client;
  let token;
  const cleanup = {
    studentIds: [],
    scheduleIds: [],
    courseIds: [],
    instructorIds: [],
  };

  test.before(async () => {
    client = await getTestClient();
    token = await loginAsAdmin(client);
  });

  test.afterEach(async () => {
    if (cleanup.scheduleIds.length) {
      await Schedule.destroy({ where: { id: cleanup.scheduleIds } });
      cleanup.scheduleIds = [];
    }

    if (cleanup.studentIds.length) {
      await Student.destroy({ where: { id: cleanup.studentIds } });
      cleanup.studentIds = [];
    }

    if (cleanup.instructorIds.length) {
      await Instructor.destroy({ where: { id: cleanup.instructorIds } });
      cleanup.instructorIds = [];
    }

    if (cleanup.courseIds.length) {
      await Course.destroy({ where: { id: cleanup.courseIds } });
      cleanup.courseIds = [];
    }
  });

  test("DELETE /api/students/:id removes student-linked schedules", async () => {
    const student = await Student.create({
      first_name: uniqueLabel("StudentFirst"),
      last_name: uniqueLabel("StudentLast"),
      email: `${uniqueLabel("student")}@example.com`,
      phone: "09170000002",
    });

    const course = await Course.create({
      course_name: uniqueLabel("Course"),
      description: "Student delete contract test",
    });

    const instructor = await Instructor.create({
      name: uniqueLabel("Instructor"),
      license_number: uniqueLabel("LIC"),
      specialization: "PDC Certified",
      status: "Active",
      tdc_certified: true,
      pdc_beginner_certified: true,
      phone: "09170000003",
    });

    const scheduleDate = nextWeekdayIso(1, 4);
    const schedule = await Schedule.create({
      course_id: course.id,
      instructor_id: instructor.id,
      student_id: student.id,
      schedule_date: scheduleDate,
      start_time: "08:00:00",
      end_time: "10:00:00",
      slots: 1,
      remarks: "Orphan schedule regression test",
    });

    cleanup.studentIds.push(student.id);
    cleanup.scheduleIds.push(schedule.id);
    cleanup.courseIds.push(course.id);
    cleanup.instructorIds.push(instructor.id);

    const deleteResponse = await client
      .delete(`/api/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(deleteResponse.status, 200);

    const deletedStudent = await Student.findByPk(student.id);
    const deletedSchedule = await Schedule.findByPk(schedule.id);

    assert.equal(deletedStudent, null);
    assert.equal(deletedSchedule, null);
  });
});