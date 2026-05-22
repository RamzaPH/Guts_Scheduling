const service = require("./system-backup.service");
const { sendHttpError } = require("../../shared/http/response");
const { recordActivity } = require("../activity-logs/activity-logs.service");

async function runManual(req, res) {
  try {
    const payload = await service.runManualBackup({
      triggeredByUserId: req.user?.id || null,
    });

    await recordActivity({
      userId: req.user?.id,
      action: `Triggered manual backup (${payload.backupFileName || "backup"})`,
    });

    return res.status(201).json({
      message: "Backup completed successfully",
      ...payload,
    });
  } catch (error) {
    return sendHttpError(res, error, 500, "Failed to run backup");
  }
}

async function getStatus(req, res) {
  try {
    const payload = service.getBackupStatus();
    return res.status(200).json(payload);
  } catch (error) {
    return sendHttpError(res, error, 500, "Failed to load backup status");
  }
}

async function restoreLatest(req, res) {
  try {
    const payload = await service.restoreBackup({
      backupFileName: req.body?.backupFileName || null,
      triggeredByUserId: req.user?.id || null,
    });

    await recordActivity({
      userId: req.user?.id,
      action: `Triggered backup restore (${payload.restoredBackupFileName || "backup"})`,
    });

    return res.status(200).json({
      message: "Backup restored successfully",
      ...payload,
    });
  } catch (error) {
    return sendHttpError(res, error, 500, "Failed to restore backup");
  }
}

module.exports = {
  runManual,
  getStatus,
  restoreLatest,
};
