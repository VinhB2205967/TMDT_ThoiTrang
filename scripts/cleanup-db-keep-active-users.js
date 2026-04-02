const mongoose = require('mongoose');
const { runDbScript } = require('./_lib/run-with-db');

const KEEP_COLLECTIONS = new Set(['users', 'accounts', 'sessions', 'admin_sessions']);

function toObjectId(id) {
  const value = String(id || '').trim();
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function parseSessionPayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractUserIdsFromSessionDoc(doc) {
  const payload = parseSessionPayload(doc?.session);
  if (!payload || typeof payload !== 'object') return [];

  const ids = [];
  const clientUserId = payload?.passport?.user;
  const adminUserId = payload?.adminUserId;

  if (clientUserId) ids.push(String(clientUserId));
  if (adminUserId) ids.push(String(adminUserId));

  return ids;
}

async function collectActiveSessionState(db) {
  const now = new Date();
  const keepUserIds = new Set();
  const keepSessionDocIds = {
    sessions: new Set(),
    admin_sessions: new Set()
  };

  for (const collectionName of ['sessions', 'admin_sessions']) {
    const exists = await db.listCollections({ name: collectionName }).hasNext();
    if (!exists) continue;

    const docs = await db.collection(collectionName).find({}).toArray();
    for (const doc of docs) {
      if (doc?.expires && new Date(doc.expires) <= now) continue;

      const userIds = extractUserIdsFromSessionDoc(doc);
      if (userIds.length === 0) continue;

      let hasValidUser = false;
      for (const userId of userIds) {
        const objectId = toObjectId(userId);
        if (!objectId) continue;
        keepUserIds.add(String(objectId));
        hasValidUser = true;
      }

      if (hasValidUser && doc?._id) {
        keepSessionDocIds[collectionName].add(doc._id);
      }
    }
  }

  return { keepUserIds, keepSessionDocIds };
}

async function countDocumentsSafe(db, collectionName) {
  const exists = await db.listCollections({ name: collectionName }).hasNext();
  if (!exists) return 0;
  return db.collection(collectionName).countDocuments({});
}

runDbScript(async ({ mongoose }) => {
  const db = mongoose.connection.db;
  const { keepUserIds, keepSessionDocIds } = await collectActiveSessionState(db);

  if (keepUserIds.size === 0) {
    throw new Error('Khong tim thay user nao dang dang nhap trong sessions/admin_sessions. Da dung de tranh xoa nham.');
  }

  const keepUserObjectIds = Array.from(keepUserIds)
    .map((id) => toObjectId(id))
    .filter(Boolean);

  console.log(`Giữ lại ${keepUserObjectIds.length} user dang co session hoat dong.`);
  console.log(`User IDs: ${keepUserObjectIds.map((id) => String(id)).join(', ')}`);

  const collections = await db.listCollections().toArray();
  const summary = [];

  for (const { name } of collections) {
    if (KEEP_COLLECTIONS.has(name)) continue;

    const result = await db.collection(name).deleteMany({});
    summary.push({ collection: name, deletedCount: result.deletedCount || 0 });
  }

  const userDeleteResult = await db.collection('users').deleteMany({
    _id: { $nin: keepUserObjectIds }
  });
  summary.push({ collection: 'users', deletedCount: userDeleteResult.deletedCount || 0 });

  const accountDeleteResult = await db.collection('accounts').deleteMany({
    nguoidung_id: { $nin: keepUserObjectIds }
  });
  summary.push({ collection: 'accounts', deletedCount: accountDeleteResult.deletedCount || 0 });

  for (const collectionName of ['sessions', 'admin_sessions']) {
    const exists = await db.listCollections({ name: collectionName }).hasNext();
    if (!exists) continue;

    const keepIds = Array.from(keepSessionDocIds[collectionName] || []);
    const sessionDeleteResult = await db.collection(collectionName).deleteMany({
      _id: { $nin: keepIds }
    });
    summary.push({ collection: collectionName, deletedCount: sessionDeleteResult.deletedCount || 0 });
  }

  console.log('Da xoa du lieu theo tung collection:');
  for (const item of summary) {
    console.log(`- ${item.collection}: ${item.deletedCount}`);
  }

  console.log('So luong con lai sau khi don:');
  for (const collectionName of ['users', 'accounts', 'sessions', 'admin_sessions']) {
    const count = await countDocumentsSafe(db, collectionName);
    console.log(`- ${collectionName}: ${count}`);
  }
});
