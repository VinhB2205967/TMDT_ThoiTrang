const { getCategoryTree } = require('../services/category.service');

let cache = {
  expiresAt: 0,
  data: {
    roots: [],
    byKey: {}
  }
};

function identifyKey(node) {
  const slug = String(node.slug || '').toLowerCase();
  const name = String(node.name || '').toLowerCase();

  if (slug.includes('nam') || name === 'nam') return 'nam';
  if (slug.includes('nu') || name === 'nữ' || name === 'nu') return 'nu';
  if (slug.includes('tre-em') || slug.includes('treem') || name.includes('trẻ em')) return 'tre-em';
  if (slug.includes('giay') || name.includes('giày')) return 'giay-dep';
  if (slug.includes('phu-kien') || name.includes('phụ kiện')) return 'phu-kien';
  return '';
}

async function buildMenuData() {
  const fullTree = await getCategoryTree({ isActive: true, includeDeleted: false });
  const roots = (fullTree || []).filter((node) => Number(node.level || 1) === 1);
  const byKey = {};

  roots.forEach((node) => {
    const key = identifyKey(node);
    if (key) byKey[key] = node;
  });

  return { roots, byKey };
}

async function attachCategoryMenu(req, res, next) {
  try {
    const now = Date.now();
    if (cache.expiresAt < now) {
      const data = await buildMenuData();
      cache = {
        expiresAt: now + 5 * 60 * 1000,
        data
      };
    }

    res.locals.categoryMenu = cache.data;
  } catch {
    res.locals.categoryMenu = { roots: [], byKey: {} };
  }
  next();
}

module.exports = {
  attachCategoryMenu
};
