const { Student } = require("../models");
const service = require("../src/modules/students/students.service");

const getAllStudents = async (req, res) => {
  try {
    const students = await Student.findAll({ order: [["id", "DESC"]] });
    return res.status(200).json(students);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch students", error: error.message });
  }
};

const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByPk(id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    return res.status(200).json(student);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch student", error: error.message });
  }
};

const createStudent = async (req, res) => {
  try {
    const { first_name, last_name, email, phone } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ message: "first_name and last_name are required" });
    }

    const student = await Student.create({ first_name, last_name, email, phone });
    return res.status(201).json(student);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create student", error: error.message });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone } = req.body;

    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    await student.update({ first_name, last_name, email, phone });
    return res.status(200).json(student);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update student", error: error.message });
  }
};

const deleteStudent = async (req, res) => {
  try {
    await service.removeStudent(req.params.id);
    return res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete student", error: error.message });
  }
};

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
};
