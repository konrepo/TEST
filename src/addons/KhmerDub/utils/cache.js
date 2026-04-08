/* =========================
   IN‑MEMORY CACHE
========================= */

const URL_TO_POSTID = new Map(); // seriesUrl -> { postId, ts }
const POST_INFO = new Map();     // postId  -> { data..., ts }

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

/* =========================
   BLOGGER IDS
========================= */
const BLOG_IDS = {
  TVSABAY: "8016412028548971199",
  ONELEGEND: "596013908374331296",
  KOLAB: "7770980406614294729",

  SUNDAY1: "7871281676618369095",
  SUNDAY2: "596013908374331296",
  SUNDAY3: "3148232187236550259",
  SUNDAY4: "3556626157575058125"
};

/* =========================
   TTL CHECK
========================= */
function isExpired(entry) {
  return !entry?.ts || (Date.now() - entry.ts) > CACHE_TTL;
}

/* =========================
   URL → POST ID (TTL SAFE)
========================= */
function getPostIdFromUrl(seriesUrl) {
  const entry = URL_TO_POSTID.get(seriesUrl);
  if (!entry) return null;

  if (isExpired(entry)) {
    URL_TO_POSTID.delete(seriesUrl);
    return null;
  }
  return entry.postId;
}

function setPostIdForUrl(seriesUrl, postId) {
  URL_TO_POSTID.set(seriesUrl, {
    postId,
    ts: Date.now()
  });
}

/* =========================
   POST INFO
========================= */
function getPostInfo(postId) {
  const entry = POST_INFO.get(postId);
  if (!entry) return null;

  if (isExpired(entry)) {
    POST_INFO.delete(postId);
    return null;
  }

  // return legacy-compatible object
  const { ts, ...data } = entry;
  return data;
}

function setPostInfo(postId, data) {
  POST_INFO.set(postId, {
    ...data,
    ts: Date.now()
  });
}

/* =========================
   LEGACY COMPATIBILITY LAYER
========================= */
const _rawPostInfoGet = POST_INFO.get.bind(POST_INFO);

POST_INFO.get = function (postId) {
  const entry = _rawPostInfoGet(postId);
  if (!entry) return null;

  if (isExpired(entry)) {
    POST_INFO.delete(postId);
    return null;
  }

  const { ts, ...data } = entry;
  return data;
};

/* =========================
   COMPAT HELPER
========================= */
function getMaxEpFromSeriesPage(postId) {
  return getPostInfo(postId)?.maxEp || null;
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  // Raw maps (legacy access)
  URL_TO_POSTID,
  POST_INFO,

  // New safe helpers
  getPostIdFromUrl,
  setPostIdForUrl,
  getPostInfo,
  setPostInfo,

  BLOG_IDS,
  getMaxEpFromSeriesPage
};