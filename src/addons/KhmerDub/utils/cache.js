const URL_TO_POSTID = new Map(); // seriesUrl -> { postId, ts }
const POST_INFO = new Map();     // postId -> { data..., ts }

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

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
   TTL HELPERS
========================= */
function isExpired(entry) {
  return !entry?.ts || (Date.now() - entry.ts) > CACHE_TTL;
}

/* =========================
   URL → POST ID
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
  return entry;
}

function setPostInfo(postId, data) {
  POST_INFO.set(postId, {
    ...data,
    ts: Date.now()
  });
}

/* =========================
   COMPAT HELPERS
========================= */
function getMaxEpFromSeriesPage(postId) {
  return getPostInfo(postId)?.maxEp || null;
}

module.exports = {
  // Keep Maps exported (backwards compatibility)
  URL_TO_POSTID,
  POST_INFO,

  // New safe accessors
  getPostIdFromUrl,
  setPostIdForUrl,
  getPostInfo,
  setPostInfo,

  BLOG_IDS,
  getMaxEpFromSeriesPage
};