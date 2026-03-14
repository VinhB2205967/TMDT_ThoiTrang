const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OPENCLIP_ENABLED = String(process.env.OPENCLIP_ENABLED || '1') !== '0';
const OPENCLIP_PYTHON_BIN = String(process.env.OPENCLIP_PYTHON_BIN || 'python').trim() || 'python';
const OPENCLIP_SCRIPT_PATH = String(
  process.env.OPENCLIP_SCRIPT_PATH || path.join(process.cwd(), 'scripts', 'openclip_rank_products.py')
).trim();
const OPENCLIP_MODEL_NAME = String(process.env.OPENCLIP_MODEL_NAME || 'ViT-B-32').trim() || 'ViT-B-32';
const OPENCLIP_PRETRAINED = String(process.env.OPENCLIP_PRETRAINED || 'laion2b_s34b_b79k').trim() || 'laion2b_s34b_b79k';
const OPENCLIP_TIMEOUT_MS = Number(process.env.OPENCLIP_TIMEOUT_MS || 40000);
const OPENCLIP_TEXT_CANDIDATE_LIMIT = Number(process.env.OPENCLIP_TEXT_CANDIDATE_LIMIT || process.env.OPENCLIP_CANDIDATE_LIMIT || 120);
const OPENCLIP_IMAGE_CANDIDATE_LIMIT = Number(process.env.OPENCLIP_IMAGE_CANDIDATE_LIMIT || 900);
const OPENCLIP_TOP_K = Number(process.env.OPENCLIP_TOP_K || 6);

const WINDOWS_PYTHON_FALLBACK = 'C:/Users/ADMIN/AppData/Local/Programs/Python/Python310/python.exe';

function isEnabled() {
  return OPENCLIP_ENABLED;
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return '';
  if (!raw.startsWith('/')) return `/${raw.replace(/^\/+/, '')}`;
  return raw;
}

function resolveLocalImagePath(imageUrl) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) return '';
  if (!normalized.startsWith('/uploads/') && !normalized.startsWith('/images/')) return '';
  const relative = normalized.replace(/^\/+/, '').replace(/\//g, path.sep);
  return path.join(process.cwd(), 'public', relative);
}

function toCandidates(products, limit) {
  const maxRows = Number(limit || OPENCLIP_TEXT_CANDIDATE_LIMIT);
  if (!Array.isArray(products) || products.length === 0) return [];

  const rows = [];

  // Main images first so every product gets at least one chance to rank.
  for (const item of products) {
    const id = String(item && item.id ? item.id : '').trim();
    if (!id) continue;
    const mainImagePath = resolveLocalImagePath(item && item.imageUrl);
    if (mainImagePath && fs.existsSync(mainImagePath)) {
      rows.push({ id, imagePath: mainImagePath, source: 'main' });
    }

    if (rows.length >= maxRows) return rows;
  }

  // Variant images are bonus signals and should not crowd out product coverage.
  for (const item of products) {
    if (rows.length >= maxRows) break;
    const id = String(item && item.id ? item.id : '').trim();
    if (!id) continue;
    const variantImages = Array.isArray(item.variantImages) ? item.variantImages : [];
    for (const varImg of variantImages.slice(0, 4)) {
      if (rows.length >= maxRows) break;
      const varPath = resolveLocalImagePath(varImg);
      if (varPath && fs.existsSync(varPath)) {
        rows.push({ id, imagePath: varPath, source: 'variant' });
      }
    }
  }

  return rows;
}

function aggregateScoresByPriority(products, rawMatches, topK) {
  const scoreById = new Map();

  for (const m of (rawMatches || [])) {
    const id = String(m && m.id ? m.id : '');
    if (!id) continue;
    const score = Number(m && m.score ? m.score : 0);
    const source = String(m && m.source ? m.source : 'main');
    const current = scoreById.get(id) || {
      mainScore: Number.NEGATIVE_INFINITY,
      variantScore: Number.NEGATIVE_INFINITY
    };

    if (source === 'variant') {
      current.variantScore = Math.max(current.variantScore, score);
    } else {
      current.mainScore = Math.max(current.mainScore, score);
    }

    scoreById.set(id, current);
  }

  return products
    .filter((item) => scoreById.has(String(item.id || '')))
    .map((item) => {
      const ranked = scoreById.get(String(item.id || ''));
      const mainScore = Number.isFinite(ranked.mainScore) ? ranked.mainScore : Number.NEGATIVE_INFINITY;
      const variantScore = Number.isFinite(ranked.variantScore) ? ranked.variantScore : Number.NEGATIVE_INFINITY;
      const bestScore = Math.max(mainScore, variantScore);
      return {
        ...item,
        openClipScore: bestScore,
        openClipBestScore: bestScore,
        openClipMainScore: mainScore,
        openClipVariantScore: variantScore
      };
    })
    .sort((a, b) => {
      const bestDiff = Number(b.openClipBestScore || Number.NEGATIVE_INFINITY) - Number(a.openClipBestScore || Number.NEGATIVE_INFINITY);
      if (Math.abs(bestDiff) > 0.0001) return bestDiff;

      // If scores are effectively tied, prefer the product whose main image matches better.
      const mainDiff = Number(b.openClipMainScore || Number.NEGATIVE_INFINITY) - Number(a.openClipMainScore || Number.NEGATIVE_INFINITY);
      if (Math.abs(mainDiff) > 0.0001) return mainDiff;

      return Number(b.openClipVariantScore || Number.NEGATIVE_INFINITY) - Number(a.openClipVariantScore || Number.NEGATIVE_INFINITY);
    })
    .slice(0, Math.max(1, topK));
}

function getPythonCandidates() {
  const bins = [];

  if (process.platform === 'win32') {
    const hasPinnedWindowsPython = fs.existsSync(WINDOWS_PYTHON_FALLBACK);
    const normalizedConfigured = String(OPENCLIP_PYTHON_BIN || '').toLowerCase();
    if (hasPinnedWindowsPython && (!normalizedConfigured || normalizedConfigured === 'python')) {
      bins.push(WINDOWS_PYTHON_FALLBACK);
    }
    if (OPENCLIP_PYTHON_BIN) bins.push(OPENCLIP_PYTHON_BIN);
    if (hasPinnedWindowsPython) bins.push(WINDOWS_PYTHON_FALLBACK);
    bins.push('python');
    bins.push('py');
  } else {
    if (OPENCLIP_PYTHON_BIN) bins.push(OPENCLIP_PYTHON_BIN);
    bins.push('python3');
    bins.push('python');
  }

  return Array.from(new Set(bins.filter(Boolean)));
}

function runPythonRankWithBin({ pythonBin, query, imageQueryPath, candidates, topK = OPENCLIP_TOP_K }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(OPENCLIP_SCRIPT_PATH)) {
      reject(new Error('OPENCLIP_SCRIPT_NOT_FOUND'));
      return;
    }

    const child = spawn(pythonBin, [OPENCLIP_SCRIPT_PATH], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('OPENCLIP_TIMEOUT'));
    }, Math.max(5000, OPENCLIP_TIMEOUT_MS));

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      let parsed = null;
      try {
        parsed = JSON.parse(String(stdout || '{}'));
      } catch {
        reject(new Error(`OPENCLIP_INVALID_OUTPUT:${pythonBin}:${stderr || stdout}`));
        return;
      }

      if (!parsed || parsed.success !== true) {
        reject(new Error(parsed && parsed.error ? String(parsed.error) : `OPENCLIP_RANK_FAILED:${pythonBin}`));
        return;
      }

      resolve({ ...parsed, pythonBin });
    });

    const payload = {
      query: String(query || '').trim(),
      imageQueryPath: String(imageQueryPath || '').trim(),
      candidates,
      topK,
      modelName: OPENCLIP_MODEL_NAME,
      pretrained: OPENCLIP_PRETRAINED,
      rootDir: process.cwd()
    };

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runPythonRank({ query, imageQueryPath, candidates, topK = OPENCLIP_TOP_K }) {
  const candidatesBin = getPythonCandidates();
  let lastError = null;

  for (const pythonBin of candidatesBin) {
    try {
      return await runPythonRankWithBin({ pythonBin, query, imageQueryPath, candidates, topK });
    } catch (error) {
      lastError = error;
      const msg = String(error && error.message ? error.message : '').toLowerCase();
      const shouldRetry = msg.includes('enoent')
        || msg.includes('is not recognized')
        || msg.includes('no module named')
        || msg.includes('import_error');
      if (!shouldRetry) throw error;
    }
  }

  throw lastError || new Error('OPENCLIP_PYTHON_NOT_AVAILABLE');
}

async function rankProductsByQuery({ query, products, topK = OPENCLIP_TOP_K }) {
  if (!isEnabled()) {
    return { used: false, reason: 'OPENCLIP_DISABLED', matches: [], meta: {} };
  }

  const candidates = toCandidates(products, OPENCLIP_TEXT_CANDIDATE_LIMIT);
  if (candidates.length === 0) {
    return { used: false, reason: 'NO_VALID_CANDIDATES', matches: [], meta: {} };
  }

  const result = await runPythonRank({ query, candidates, topK: Math.max(1, candidates.length) });
  const matches = aggregateScoresByPriority(products, result.matches || [], topK);

  return {
    used: true,
    matches,
    meta: {
      model: String(result.model || OPENCLIP_MODEL_NAME),
      pretrained: String(result.pretrained || OPENCLIP_PRETRAINED),
      device: String(result.device || ''),
      pythonBin: String(result.pythonBin || ''),
      candidates: candidates.length
    }
  };
}

async function rankProductsByImage({ imagePath, products, topK = OPENCLIP_TOP_K }) {
  if (!isEnabled()) {
    return { used: false, reason: 'OPENCLIP_DISABLED', matches: [], meta: {} };
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    return { used: false, reason: 'QUERY_IMAGE_NOT_FOUND', matches: [], meta: {} };
  }

  const candidates = toCandidates(products, OPENCLIP_IMAGE_CANDIDATE_LIMIT);
  if (candidates.length === 0) {
    return { used: false, reason: 'NO_VALID_CANDIDATES', matches: [], meta: {} };
  }

  const result = await runPythonRank({ imageQueryPath: imagePath, candidates, topK: Math.max(1, candidates.length) });
  const matches = aggregateScoresByPriority(products, result.matches || [], topK);

  return {
    used: true,
    matches,
    meta: {
      model: String(result.model || OPENCLIP_MODEL_NAME),
      pretrained: String(result.pretrained || OPENCLIP_PRETRAINED),
      device: String(result.device || ''),
      mode: String(result.mode || 'image'),
      pythonBin: String(result.pythonBin || ''),
      candidates: candidates.length
    }
  };
}

module.exports = {
  rankProductsByQuery,
  rankProductsByImage,
  isEnabled
};
