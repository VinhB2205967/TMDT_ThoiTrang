function scoreMojibake(text) {
  const value = String(text || '');
  if (!value) return 0;
  const matches = value.match(/(Ã.|Â.|áº.|á».|Ä.|â.|�)/g);
  return matches ? matches.length : 0;
}

function decodeLatin1Utf8(text) {
  try {
    return Buffer.from(String(text || ''), 'latin1').toString('utf8');
  } catch (_) {
    return String(text || '');
  }
}

function fixMojibakeText(input) {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'string') return input;

  let best = input;
  let bestScore = scoreMojibake(best);
  if (!best) return best;

  let current = input;
  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeLatin1Utf8(current);
    const decodedScore = scoreMojibake(decoded);
    if (decodedScore < bestScore) {
      best = decoded;
      bestScore = decodedScore;
      current = decoded;
      continue;
    }
    break;
  }

  return best;
}

module.exports = {
  fixMojibakeText
};