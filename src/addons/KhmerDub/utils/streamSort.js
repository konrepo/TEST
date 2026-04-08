function scoreStream(stream) {
  if (!stream || !stream.url) return 0;

  const url = stream.url;
  let score = 0;

  // Prefer HLS (adaptive, stable)
  if (url.includes(".m3u8")) score += 100;

  // Prefer direct MP4
  if (url.includes(".mp4")) score += 80;

  // Penalize OK.ru (proxy / throttling)
  if (/ok\.ru|okcdn\.ru/i.test(url)) score -= 30;

  // Prefer streams without proxy headers
  if (!stream.behaviorHints?.proxyHeaders) score += 10;

  return score;
}

/**
 * Sort streams from best → worst
 */
function sortStreams(streams = []) {
  return [...streams].sort(
    (a, b) => scoreStream(b) - scoreStream(a)
  );
}

module.exports = {
  sortStreams
};