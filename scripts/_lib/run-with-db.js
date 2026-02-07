const dotenv = require('dotenv');
const mongoose = require('mongoose');
const database = require('../../config/database');

dotenv.config();

async function closeMongooseConnectionQuietly() {
  try {
    await mongoose.connection.close();
  } catch {
    // ignore
  }
}

/**
 * Run a script with DB connected and always close the mongoose connection.
 * - Sets `process.exitCode = 1` on error
 * - Logs the error via `console.error`
 * @param {(ctx: { mongoose: typeof import('mongoose') }) => Promise<void>} fn
 */
async function runDbScript(fn) {
  try {
    await database.connect();
    try {
      await fn({ mongoose });
    } finally {
      await closeMongooseConnectionQuietly();
    }
  } catch (err) {
    console.error(err);
    await closeMongooseConnectionQuietly();
    process.exitCode = 1;
  }
}

module.exports = {
  runDbScript
};
