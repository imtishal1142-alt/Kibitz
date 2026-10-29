// Writing automatic backups from the desktop app. Kept free of Electron imports so it can be tested on its own.
//
// Only files named kibitz-backup-YYYY-MM-DD.json are ever created, replaced or deleted. Anything else in the chosen
// folder is left alone, and a name that is not of that exact form is refused (so the page cannot make the app write
// elsewhere through a crafted file name).
const fs = require('node:fs');
const path = require('node:path');

const BACKUP_NAME = /^kibitz-backup-\d{4}-\d{2}-\d{2}\.json$/;
const MAX_BYTES = 512 * 1024 * 1024;

const isBackupName = (name) => typeof name === 'string' && BACKUP_NAME.test(name);

/** Backup file names to delete so that only the newest `keep` remain (names sort by date). */
function toRemove(names, keep) {
  const mine = names.filter(isBackupName).sort();
  return mine.slice(0, Math.max(0, mine.length - keep));
}

/** Write one backup (via a temporary file, so a crash never leaves a half-written backup) and rotate old ones. */
function writeBackup(folder, name, text, keep) {
  if (!isBackupName(name)) throw new Error('That is not a backup file name.');
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BYTES) throw new Error('The backup is empty or too large.');
  const keepN = Number.isInteger(keep) && keep >= 1 && keep <= 365 ? keep : 7;
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('The backup folder does not exist any more. Choose it again.');
  const target = path.join(folder, name);
  const tmp = path.join(folder, `${name}.tmp`);
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
  const removed = toRemove(fs.readdirSync(folder), keepN);
  for (const old of removed) fs.unlinkSync(path.join(folder, old));
  return { folder, removed };
}

module.exports = { isBackupName, toRemove, writeBackup };
