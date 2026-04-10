const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const crypto = require('crypto');

const OPENCLIP_ENABLED = String(process.env.OPENCLIP_ENABLED || '1') !== '0';
const OPENCLIP_PYTHON_BIN = String(process.env.OPENCLIP_PYTHON_BIN || 'python').trim() || 'python';
const OPENCLIP_SCRIPT_PATH = String(
  process.env.OPENCLIP_SCRIPT_PATH || path.join(process.cwd(), 'scripts', 'openclip_rank_products.py')
).trim();
const OPENCLIP_MODEL_NAME = String(process.env.OPENCLIP_MODEL_NAME || 'ViT-B-32').trim() || 'ViT-B-32';
const OPENCLIP_PRETRAINED = String(process.env.OPENCLIP_PRETRAINED || 'laion2b_s34b_b79k').trim() || 'laion2b_s34b_b79k';
const OPENCLIP_TIMEOUT_MS = Number(process.env.OPENCLIP_TIMEOUT_MS || 40000);
const OPENCLIP_STARTUP_TIMEOUT_MS = Number(process.env.OPENCLIP_STARTUP_TIMEOUT_MS || Math.max(OPENCLIP_TIMEOUT_MS, 300000));
const OPENCLIP_TEXT_CANDIDATE_LIMIT = Number(process.env.OPENCLIP_TEXT_CANDIDATE_LIMIT || process.env.OPENCLIP_CANDIDATE_LIMIT || 120);
const OPENCLIP_IMAGE_CANDIDATE_LIMIT = Number(process.env.OPENCLIP_IMAGE_CANDIDATE_LIMIT || 220);
const OPENCLIP_TOP_K = Number(process.env.OPENCLIP_TOP_K || 6);
const OPENCLIP_IMAGE_CACHE_TTL_MS = Number(process.env.OPENCLIP_IMAGE_CACHE_TTL_MS || 120000);
const OPENCLIP_IMAGE_CACHE_MAX = Number(process.env.OPENCLIP_IMAGE_CACHE_MAX || 80);

const WINDOWS_PYTHON_FALLBACK = 'C:/Users/ADMIN/AppData/Local/Programs/Python/Python310/python.exe';
const MAX_STDERR_BUFFER = 16000;

let activeWorker = null;
let activeWorkerStartup = null;
let activeWorkerStartupBin = '';
let requestSequence = 0;
let workingPythonBin = '';
let processCleanupBound = false;
const imageRankCache = new Map();

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

function computeImageCacheKey(imagePath, products, topK, candidateLimit) {
  try {
    const stat = fs.statSync(imagePath);
    const data = fs.readFileSync(imagePath);
    const imageHash = crypto.createHash('sha1').update(data).digest('hex');
    const productSample = (Array.isArray(products) ? products : [])
      .slice(0, 40)
      .map((p) => String(p && p.id ? p.id : ''))
      .join(',');
    return `${imageHash}:${Number(stat.size || 0)}:${Number(topK || 0)}:${Number(candidateLimit || 0)}:${productSample}`;
  } catch {
    return '';
  }
}

function getCachedImageRank(cacheKey) {
  if (!cacheKey || !imageRankCache.has(cacheKey)) return null;
  const record = imageRankCache.get(cacheKey);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    imageRankCache.delete(cacheKey);
    return null;
  }
  // Refresh LRU position.
  imageRankCache.delete(cacheKey);
  imageRankCache.set(cacheKey, record);
  return record.value || null;
}

function setCachedImageRank(cacheKey, value) {
  if (!cacheKey) return;
  if (imageRankCache.size >= Math.max(10, OPENCLIP_IMAGE_CACHE_MAX)) {
    const oldestKey = imageRankCache.keys().next().value;
    if (oldestKey) imageRankCache.delete(oldestKey);
  }
  imageRankCache.set(cacheKey, {
    expiresAt: Date.now() + Math.max(10000, OPENCLIP_IMAGE_CACHE_TTL_MS),
    value
  });
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

  if (workingPythonBin) bins.push(workingPythonBin);

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

function buildWorkerError(message, state, rawPayload) {
  const stderr = String(state && state.stderr ? state.stderr : '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      if (lower.includes('you are sending unauthenticated requests to the hf hub')) return false;
      if (lower.startsWith('warning:huggingface_hub.utils._http:warning:')) return false;
      return true;
    })
    .join('\n');

  const suffix = stderr
    ? `:${stderr}`
    : '';
  const error = new Error(`${message}${suffix}`);
  error.rawPayload = rawPayload;
  return error;
}

function isRetryableWorkerError(error) {
  const msg = String(error && error.message ? error.message : '').toLowerCase();
  return msg.includes('enoent')
    || msg.includes('is not recognized')
    || msg.includes('no module named')
    || msg.includes('import_error')
    || msg.includes('model_init_error')
    || msg.includes('worker_exited')
    || msg.includes('worker_start_failed');
}

function bindCleanupHandlers() {
  if (processCleanupBound) return;
  processCleanupBound = true;

  const cleanup = () => {
    if (!activeWorker || !activeWorker.child || activeWorker.exited) return;
    try {
      activeWorker.child.kill();
    } catch {}
  };

  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}

function createWorkerState(pythonBin) {
  if (!fs.existsSync(OPENCLIP_SCRIPT_PATH)) {
    throw new Error('OPENCLIP_SCRIPT_NOT_FOUND');
  }

  const child = spawn(pythonBin, ['-u', OPENCLIP_SCRIPT_PATH], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  const state = {
    pythonBin,
    child,
    stderr: '',
    pending: new Map(),
    exited: false,
    stdout: readline.createInterface({ input: child.stdout })
  };

  state.stdout.on('line', (line) => {
    let parsed;
    try {
      parsed = JSON.parse(String(line || '').trim());
    } catch {
      return;
    }

    const requestId = String(parsed && parsed.requestId ? parsed.requestId : '').trim();
    if (!requestId || !state.pending.has(requestId)) return;

    const pending = state.pending.get(requestId);
    state.pending.delete(requestId);
    clearTimeout(pending.timer);

    if (!parsed || parsed.success !== true) {
      pending.reject(buildWorkerError(
        parsed && parsed.error ? String(parsed.error) : `OPENCLIP_RANK_FAILED:${pythonBin}`,
        state,
        parsed
      ));
      return;
    }

    pending.resolve({ ...parsed, pythonBin });
  });

  child.stderr.on('data', (chunk) => {
    state.stderr += chunk.toString('utf8');
    if (state.stderr.length > MAX_STDERR_BUFFER) {
      state.stderr = state.stderr.slice(-MAX_STDERR_BUFFER);
    }
  });

  child.on('error', (error) => {
    state.stderr += String(error && error.message ? error.message : error);
  });

  child.on('close', (code, signal) => {
    state.exited = true;
    if (activeWorker === state) activeWorker = null;
    if (activeWorkerStartupBin === pythonBin) {
      activeWorkerStartup = null;
      activeWorkerStartupBin = '';
    }

    for (const [requestId, pending] of state.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(buildWorkerError(`OPENCLIP_WORKER_EXITED:${pythonBin}:${code ?? 'null'}:${signal ?? 'null'}`, state, { requestId }));
    }
    state.pending.clear();

    try {
      state.stdout.close();
    } catch {}
  });

  return state;
}

function stopWorker(state) {
  if (!state || !state.child || state.exited) return;
  try {
    state.child.kill();
  } catch {}
}

function sendWorkerRequest(state, payload, timeoutMs = OPENCLIP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!state || !state.child || state.exited) {
      reject(new Error('OPENCLIP_WORKER_NOT_RUNNING'));
      return;
    }

    const requestId = String(++requestSequence);
    const timer = setTimeout(() => {
      state.pending.delete(requestId);
      reject(buildWorkerError('OPENCLIP_TIMEOUT', state, { requestId }));
    }, Math.max(5000, timeoutMs));

    state.pending.set(requestId, { resolve, reject, timer });

    const message = JSON.stringify({
      ...payload,
      requestId,
      modelName: OPENCLIP_MODEL_NAME,
      pretrained: OPENCLIP_PRETRAINED,
      rootDir: process.cwd()
    }) + '\n';

    state.child.stdin.write(message, (error) => {
      if (!error) return;
      const pending = state.pending.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      state.pending.delete(requestId);
      pending.reject(buildWorkerError(`OPENCLIP_WRITE_FAILED:${error.message}`, state, { requestId }));
    });
  });
}

async function ensureWorker(pythonBin) {
  bindCleanupHandlers();

  if (activeWorker && activeWorker.pythonBin === pythonBin && !activeWorker.exited) {
    return activeWorker;
  }

  if (activeWorkerStartup && activeWorkerStartupBin === pythonBin) {
    return activeWorkerStartup;
  }

  const nextWorker = createWorkerState(pythonBin);
  activeWorkerStartupBin = pythonBin;
  activeWorkerStartup = sendWorkerRequest(nextWorker, { command: 'ping', warm: true }, OPENCLIP_STARTUP_TIMEOUT_MS)
    .then(() => {
      const previous = activeWorker;
      activeWorker = nextWorker;
      activeWorkerStartup = null;
      activeWorkerStartupBin = '';
      workingPythonBin = pythonBin;
      if (previous && previous !== nextWorker) stopWorker(previous);
      return nextWorker;
    })
    .catch((error) => {
      activeWorkerStartup = null;
      activeWorkerStartupBin = '';
      stopWorker(nextWorker);
      throw buildWorkerError(`OPENCLIP_WORKER_START_FAILED:${pythonBin}:${error.message}`, nextWorker, error.rawPayload);
    });

  return activeWorkerStartup;
}

async function runPythonRankWithBin({ pythonBin, query, imageQueryPath, candidates, topK = OPENCLIP_TOP_K }) {
  const worker = await ensureWorker(pythonBin);
  return sendWorkerRequest(worker, {
    command: 'rank',
    query: String(query || '').trim(),
    imageQueryPath: String(imageQueryPath || '').trim(),
    candidates,
    topK
  });
}

async function runPythonClassifyWithBin({ pythonBin, imageQueryPath, labels }) {
  const worker = await ensureWorker(pythonBin);
  return sendWorkerRequest(worker, {
    command: 'classify',
    imageQueryPath: String(imageQueryPath || '').trim(),
    labels: Array.isArray(labels) ? labels : []
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
      const shouldRetry = isRetryableWorkerError(error);
      if (!shouldRetry) throw error;
      if (activeWorker && activeWorker.pythonBin === pythonBin) {
        stopWorker(activeWorker);
        activeWorker = null;
      }
    }
  }

  throw lastError || new Error('OPENCLIP_PYTHON_NOT_AVAILABLE');
}

async function runPythonClassify({ imageQueryPath, labels }) {
  const candidatesBin = getPythonCandidates();
  let lastError = null;

  for (const pythonBin of candidatesBin) {
    try {
      return await runPythonClassifyWithBin({ pythonBin, imageQueryPath, labels });
    } catch (error) {
      lastError = error;
      const shouldRetry = isRetryableWorkerError(error);
      if (!shouldRetry) throw error;
      if (activeWorker && activeWorker.pythonBin === pythonBin) {
        stopWorker(activeWorker);
        activeWorker = null;
      }
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

async function rankProductsByImage({ imagePath, products, topK = OPENCLIP_TOP_K, candidateLimit }) {
  if (!isEnabled()) {
    return { used: false, reason: 'OPENCLIP_DISABLED', matches: [], meta: {} };
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    return { used: false, reason: 'QUERY_IMAGE_NOT_FOUND', matches: [], meta: {} };
  }

  const resolvedCandidateLimit = Number.isFinite(Number(candidateLimit))
    ? Math.max(24, Number(candidateLimit))
    : OPENCLIP_IMAGE_CANDIDATE_LIMIT;

  const cacheKey = computeImageCacheKey(imagePath, products, topK, resolvedCandidateLimit);
  const cached = getCachedImageRank(cacheKey);
  if (cached) {
    return {
      ...cached,
      meta: {
        ...(cached.meta || {}),
        cacheHit: true
      }
    };
  }

  const candidates = toCandidates(products, resolvedCandidateLimit);
  if (candidates.length === 0) {
    return { used: false, reason: 'NO_VALID_CANDIDATES', matches: [], meta: {} };
  }

  const workerTopK = Math.min(
    Math.max(1, candidates.length),
    Math.max(80, Number(topK || 1) * 10)
  );

  const result = await runPythonRank({ imageQueryPath: imagePath, candidates, topK: workerTopK });
  const matches = aggregateScoresByPriority(products, result.matches || [], topK);

  const output = {
    used: true,
    matches,
    meta: {
      model: String(result.model || OPENCLIP_MODEL_NAME),
      pretrained: String(result.pretrained || OPENCLIP_PRETRAINED),
      device: String(result.device || ''),
      mode: String(result.mode || 'image'),
      pythonBin: String(result.pythonBin || ''),
      candidates: candidates.length,
      candidateLimit: resolvedCandidateLimit,
      workerTopK,
      cacheHit: false
    }
  };

  setCachedImageRank(cacheKey, output);
  return output;
}

async function classifyImageCategory({ imagePath, labels }) {
  if (!isEnabled()) {
    return { used: false, reason: 'OPENCLIP_DISABLED', predictedKey: '', labels: [], meta: {} };
  }

  if (!imagePath || !fs.existsSync(imagePath)) {
    return { used: false, reason: 'QUERY_IMAGE_NOT_FOUND', predictedKey: '', labels: [], meta: {} };
  }

  const normalizedLabels = Array.isArray(labels)
    ? labels
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const key = String(item.key || '').trim();
        const prompts = Array.isArray(item.prompts)
          ? item.prompts.map((prompt) => String(prompt || '').trim()).filter(Boolean)
          : [];
        if (!key || prompts.length === 0) return null;
        return { key, prompts };
      })
      .filter(Boolean)
    : [];

  if (normalizedLabels.length === 0) {
    return { used: false, reason: 'NO_LABELS', predictedKey: '', labels: [], meta: {} };
  }

  const result = await runPythonClassify({ imageQueryPath: imagePath, labels: normalizedLabels });
  return {
    used: true,
    predictedKey: String(result.predictedKey || '').trim(),
    labels: Array.isArray(result.labels) ? result.labels : [],
    meta: {
      model: String(result.model || OPENCLIP_MODEL_NAME),
      pretrained: String(result.pretrained || OPENCLIP_PRETRAINED),
      device: String(result.device || ''),
      mode: String(result.mode || 'classify')
    }
  };
}

async function prewarmOpenClipWorker() {
  if (!isEnabled()) {
    return { ok: false, reason: 'OPENCLIP_DISABLED' };
  }

  const candidatesBin = getPythonCandidates();
  let lastError = null;

  for (const pythonBin of candidatesBin) {
    try {
      const worker = await ensureWorker(pythonBin);
      await sendWorkerRequest(worker, { command: 'ping', warm: true });
      return {
        ok: true,
        pythonBin,
        model: OPENCLIP_MODEL_NAME,
        pretrained: OPENCLIP_PRETRAINED
      };
    } catch (error) {
      lastError = error;
      if (activeWorker && activeWorker.pythonBin === pythonBin) {
        stopWorker(activeWorker);
        activeWorker = null;
      }
    }
  }

  return {
    ok: false,
    reason: 'OPENCLIP_PREWARM_FAILED',
    error: String(lastError && lastError.message ? lastError.message : 'UNKNOWN')
  };
}

module.exports = {
  rankProductsByQuery,
  rankProductsByImage,
  classifyImageCategory,
  isEnabled,
  prewarmOpenClipWorker
};

