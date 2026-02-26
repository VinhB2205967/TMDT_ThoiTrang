const mongoose = require('mongoose');
const Danhmuc = require('../models/category_model');

function normalizeCategory(item) {
  const name = item.name || item.tendanhmuc || '';
  const parentId = item.parent_id || item.danhmuccha || null;
  const order = Number(item.order ?? item.thutu ?? 0);
  const isActive = item.isActive !== undefined
    ? Boolean(item.isActive)
    : String(item.trangthai || 'active') === 'active';

  return {
    ...item,
    name,
    parent_id: parentId,
    order,
    isActive,
    type: item.type || 'category',
    level: Number(item.level || 1),
    path: item.path || ''
  };
}

function buildCategoryTree(list) {
  const nodes = new Map();
  const roots = [];

  (list || []).forEach((raw) => {
    const node = normalizeCategory(raw);
    nodes.set(String(node._id), { ...node, children: [] });
  });

  nodes.forEach((node) => {
    if (node.parent_id) {
      const parent = nodes.get(String(node.parent_id));
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
      return;
    }
    roots.push(node);
  });

  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      const orderA = Number(a.order || 0);
      const orderB = Number(b.order || 0);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    });
    arr.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

async function getCategoryTree({ type, isActive = undefined, includeDeleted = false } = {}) {
  const query = {
    ...(includeDeleted ? {} : { daxoa: { $ne: true } }),
    ...(type ? { type } : {}),
    ...(isActive === undefined ? {} : { isActive: Boolean(isActive) })
  };

  const rows = await Danhmuc.find(query)
    .sort({ level: 1, order: 1, thutu: 1, name: 1, tendanhmuc: 1 })
    .lean();

  return buildCategoryTree(rows);
}

async function getDescendantCategoryIds(parentId, { includeSelf = true, onlyActive = true } = {}) {
  if (!mongoose.Types.ObjectId.isValid(parentId)) return [];

  const parent = await Danhmuc.findById(parentId).select('_id path isActive').lean();
  if (!parent) return [];

  const byAncestors = await Danhmuc.find({
    daxoa: { $ne: true },
    $or: [
      { _id: new mongoose.Types.ObjectId(parentId) },
      { ancestors: new mongoose.Types.ObjectId(parentId) }
    ],
    ...(onlyActive ? { isActive: true } : {})
  }).select('_id').lean();

  if (byAncestors.length) {
    const ids = byAncestors.map((item) => String(item._id));
    if (!includeSelf) return ids.filter((id) => id !== String(parent._id));
    return ids;
  }

  if (!parent.path) {
    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(parentId), daxoa: { $ne: true } } },
      {
        $graphLookup: {
          from: 'categories',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent_id',
          as: 'descendants',
          restrictSearchWithMatch: {
            daxoa: { $ne: true },
            ...(onlyActive ? { isActive: true } : {})
          }
        }
      },
      {
        $project: {
          ids: {
            $concatArrays: [
              includeSelf ? ['$_id'] : [],
              '$descendants._id'
            ]
          }
        }
      }
    ];

    const data = await Danhmuc.aggregate(pipeline);
    return (data[0]?.ids || []).map((id) => String(id));
  }

  const escaped = String(parent.path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathRegex = new RegExp(`^${escaped}(/|$)`);

  const descendants = await Danhmuc.find({
    daxoa: { $ne: true },
    path: pathRegex,
    ...(onlyActive ? { isActive: true } : {})
  }).select('_id').lean();

  const ids = descendants.map((d) => String(d._id));
  if (includeSelf && !ids.includes(String(parent._id))) ids.unshift(String(parent._id));
  return ids;
}

function flattenTreeOptions(tree, level = 0, out = []) {
  (tree || []).forEach((node) => {
    out.push({
      _id: node._id,
      name: node.name,
      type: node.type,
      level,
      isActive: node.isActive
    });
    if (node.children && node.children.length) {
      flattenTreeOptions(node.children, level + 1, out);
    }
  });
  return out;
}

module.exports = {
  normalizeCategory,
  buildCategoryTree,
  getCategoryTree,
  getDescendantCategoryIds,
  flattenTreeOptions
};
