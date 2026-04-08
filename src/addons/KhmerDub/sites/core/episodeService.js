const { BLOG_IDS, getPostInfo, setPostInfo } = require("../../utils/cache");

const bloggerEngine = require("./bloggerEngine");
const wordpressEngine = require("./wordpressEngine");
const sundayEngine = require("./sundayEngine");
const { resolvePost } = require("./postResolver");

async function getStreamDetail(postId, sourceType, seriesUrl) {
  const cached = getPostInfo(postId);
  if (cached?.detail) {
    return cached.detail;
  }

  let detail = null;

  if (sourceType === "vip-wordpress") {
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

  // TTL-aware cache write
  setPostInfo(postId, {
    ...cached,
    detail
  });

  return detail;
}

/**
 * Build Stremio episode list for a series
 */
async function getEpisodes(prefix, seriesUrl) {
  const { postId, info } = await resolvePost(seriesUrl);

  /* =========================
     SUNDAY FALLBACK
  ========================= */
  if (!postId && prefix === "sunday") {
    return sundayEngine.getSundayEpisodes(prefix, seriesUrl);
  }

  if (!postId || !info) return [];

  const detail = await getStreamDetail(postId, info.sourceType, seriesUrl);
  if (!detail?.urls?.length) return [];

  let urls = [...new Set(detail.urls)];

  // Respect max episode limit (TTL-safe)
  if (info.maxEp && urls.length > info.maxEp) {
    urls = urls.slice(0, info.maxEp);
  }

  return urls.map((_, index) => ({
    id: `${prefix}:${encodeURIComponent(seriesUrl)}:1:${index + 1}`,
    title: `Episode ${index + 1}`,
    season: 1,
    episode: index + 1,
    thumbnail: detail.thumbnail,
    released: new Date().toISOString()
  }));
}

module.exports = {
  getEpisodes,
  getStreamDetail
};