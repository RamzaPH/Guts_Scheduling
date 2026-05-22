const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function assertRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is required for database backups`);
    error.status = 500;
    throw error;
  }
  return value;
}

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function listBackupFiles(backupDir) {
  return fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const filePath = path.join(backupDir, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        filePath,
        modifiedAt: stats.mtime.toISOString(),
        modifiedAtMs: stats.mtimeMs,
        sizeBytes: stats.size,
      };
    })
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
}

function getBackupDir() {
  return path.resolve(process.env.BACKUP_DIR || "./backups");
}

function getLatestBackupFile(backupDir) {
  const backups = listBackupFiles(backupDir);
  return backups[0] || null;
}

function resolveBackupFile(backupDir, backupFileName) {
  const backups = listBackupFiles(backupDir);
  if (!backupFileName) {
    return backups[0] || null;
  }

  const match = backups.find((backup) => backup.name === backupFileName);
  return match || null;
}

function runMysqlImport({ backupFilePath, dbHost, dbUser, dbPassword, dbName, mysqlCommand = "mysql" }) {
  const args = [`--host=${dbHost}`, `--user=${dbUser}`, dbName];

  return new Promise((resolve, reject) => {
    const importProcess = spawn(mysqlCommand, args, {
      env: {
        ...process.env,
        MYSQL_PWD: dbPassword,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";

    importProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    importProcess.on("error", (error) => reject(error));
    importProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${mysqlCommand} exited with code ${code}. ${stderr}`));
    });

    fs.createReadStream(backupFilePath).pipe(importProcess.stdin);
  });
}

function cleanupOldBackups(backupDir, retentionDays) {
  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const now = Date.now();
  const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) {
      continue;
    }

    const filePath = path.join(backupDir, entry.name);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > cutoffMs) {
      fs.unlinkSync(filePath);
    }
  }
}

function writeBackupStatus(backupDir, statusPayload) {
  const statusPath = path.join(backupDir, "backup-status.json");
  fs.writeFileSync(statusPath, JSON.stringify(statusPayload, null, 2));
}

async function sendBackupAlert(statusPayload) {
  const webhookUrl = process.env.BACKUP_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(statusPayload),
    });
  } catch {
    // Backup flow should not fail because alert webhook is unavailable.
  }
}

async function runManualBackup({ triggeredByUserId = null } = {}) {
  const startedAt = new Date();
  const dbName = assertRequiredEnv("DB_NAME");
  const dbUser = assertRequiredEnv("DB_USER");
  const dbPassword = assertRequiredEnv("DB_PASSWORD");
  const dbHost = process.env.DB_HOST || "db";
  const dumpCommand = process.env.MYSQL_DUMP_COMMAND || "mysqldump";
  const dumpExtraArgs = (process.env.MYSQL_DUMP_EXTRA_ARGS || "")
    .split(/\s+/)
    .filter(Boolean);
  const backupDir = getBackupDir();
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);

  fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `${dbName}_${getTimestamp()}.sql`);
  const output = fs.createWriteStream(backupFile);

  const args = [...dumpExtraArgs, `--host=${dbHost}`, `--user=${dbUser}`, dbName];
  const dump = spawn(dumpCommand, args, {
    env: {
      ...process.env,
      MYSQL_PWD: dbPassword,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  dump.stdout.pipe(output);

  let stderr = "";
  dump.stderr.on("data", (chunk) => {
    const s = chunk.toString();
    stderr += s;
  });

  try {
    await new Promise((resolve, reject) => {
      dump.on("error", (error) => {
        reject(error);
      });

      dump.on("close", (code) => {
        output.close();
        if (code === 0) {
          resolve();
        } else {
          const err = new Error(`${dumpCommand} exited with code ${code}. ${stderr}`);
          reject(err);
        }
      });
    });

    cleanupOldBackups(backupDir, retentionDays);

    const statusPayload = {
      status: "success",
      timestamp: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      backupFile,
      backupFileName: path.basename(backupFile),
      database: dbName,
      host: dbHost,
      triggeredByUserId,
      mode: "manual",
    };

    writeBackupStatus(backupDir, statusPayload);
    await sendBackupAlert(statusPayload);

    return statusPayload;
  } catch (error) {
    const statusPayload = {
      status: "failed",
      timestamp: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      database: dbName,
      host: dbHost,
      error: error.message,
      triggeredByUserId,
      mode: "manual",
    };

    writeBackupStatus(backupDir, statusPayload);
    await sendBackupAlert(statusPayload);

    const wrapped = new Error(`Backup failed: ${error.message}`);
    wrapped.status = 500;
    throw wrapped;
  }
}

function getBackupStatus() {
  const backupDir = getBackupDir();
  const statusPath = path.join(backupDir, "backup-status.json");

  const result = {
    backupDir,
    status: null,
    latestBackup: null,
  };

  if (!fs.existsSync(backupDir)) {
    return result;
  }

  if (fs.existsSync(statusPath)) {
    try {
      const raw = fs.readFileSync(statusPath, "utf-8");
      result.status = JSON.parse(raw);
    } catch {
      result.status = {
        status: "failed",
        timestamp: new Date().toISOString(),
        error: "Failed to parse backup status file",
      };
    }
  }

  const backups = listBackupFiles(backupDir);
  result.backups = backups;
  result.latestBackup = getLatestBackupFile(backupDir);

  return result;
}

async function restoreBackup({ backupFileName = null, triggeredByUserId = null } = {}) {
  const startedAt = new Date();
  const dbName = assertRequiredEnv("DB_NAME");
  const dbUser = assertRequiredEnv("DB_USER");
  const dbPassword = assertRequiredEnv("DB_PASSWORD");
  const dbHost = process.env.DB_HOST || "db";
  const mysqlCommand = process.env.MYSQL_COMMAND || "mysql";
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    const error = new Error(`Backup directory not found: ${backupDir}`);
    error.status = 404;
    throw error;
  }

  const selectedBackup = resolveBackupFile(backupDir, backupFileName);
  if (!selectedBackup) {
    const error = new Error(backupFileName ? `Backup file not found: ${backupFileName}` : "No backup files found to restore");
    error.status = 404;
    throw error;
  }

  try {
    await runMysqlImport({
      backupFilePath: selectedBackup.filePath,
      dbHost,
      dbUser,
      dbPassword,
      dbName,
      mysqlCommand,
    });

    return {
      status: "success",
      timestamp: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      restoredBackupFile: selectedBackup.filePath,
      restoredBackupFileName: selectedBackup.name,
      database: dbName,
      host: dbHost,
      triggeredByUserId,
      mode: "restore",
    };
  } catch (error) {
    const wrapped = new Error(`Restore failed: ${error.message}`);
    wrapped.status = 500;
    throw wrapped;
  }
}

module.exports = {
  runManualBackup,
  getBackupStatus,
  restoreBackup,
};
