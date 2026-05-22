const express = require("express");
const controller = require("./system-backup.controller");
const { authenticateToken, authorizeRoles } = require("../../shared/middleware/auth");

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRoles("admin"));

router.get("/status", controller.getStatus);
router.post("/run", controller.runManual);
router.post("/restore", controller.restoreLatest);

module.exports = router;
