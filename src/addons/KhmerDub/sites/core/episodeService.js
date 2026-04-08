const { resolvePost } = require("./postResolver");
const { POST_INFO } = require("../../utils/cache");

const bloggerEngine = require("./bloggerEngine");
const wordpressEngine = require("./wordpressEngine");
const { BLOG_IDS } = require("../../utils/cache");

/* =========================
   EPISODE LISTING
========================= */
async function getEpisodes(prefix, seriesUrl) {
  const { postId } = await resolvePost(seriesUrl);

  // no postId = no episodes
  if (!postId) return [];

  const cached = POST_INFO.get(postId);
  if (!cached) return [];

  const maxEp = cached.maxEp;
  if (!maxEp || maxEp <= 0) return [];

  const thumbnail =
    cached.detail?.thumbnail ||
    cached.poster ||
    "";

  return Array.from({ length: maxEp }, (_, i) => ({
    id: `${prefix}:${encodeURIComponent(seriesUrl)}:1:${i + 1}`,
    title: `Episode ${i + 1}`,
    season: 1,
    episode: i + 1,
    thumbnail,
    released: new Date().toISOString()
  }));
}

/* =========================
   STREAM DETAIL
========================= */
async function getStreamDetail(postId, sourceType, seriesUrl) {
  const cached = POST_INFO.get(postId);
  if (cached?.detail) return cached.detail;

  let detail = null;

  if (sourceType === "wordpress" || sourceType === "vip-wordpress") {
    detail = await wordpressEngine.fetchWordpressDetail(seriesUrl, postId);
  } else {
    const results = await Promise.all(
      Object.values(BLOG_IDS).map(blogId =>
        bloggerEngine.fetchFromBlog(blogId, postId)
      )
    );

    detail = results.find(Boolean);
  }

  if (!detail) return null;

  POST_INFO.set(postId, {
    ...(POST_INFO.get(postId) || {}),
    detail
  });

  return detail;
}

module.exports = {
  getEpisodes,
  getStreamDetail
};