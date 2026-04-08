const cheerio = require("cheerio");
const axiosClient = require("../../utils/fetch");
const { withRequestCache } = require("../../utils/requestCache");

const {
  normalizePoster,
  extractVideoLinks,
  extractOkIds
} = require("../../utils/helpers");

async function fetchFromBlog(blogId, postId) {
  const cacheKey = `blogger:${blogId}:${postId}`;

  return withRequestCache(cacheKey, async () => {
    const url = `https://www.blogger.com/feeds/${blogId}/posts/default/${postId}?alt=json`;

    try {
      const { data } = await axiosClient.get(url, {
        headers: {
          Referer: "https://phumikhmer.vip/"
        }
      });

      const title = data?.entry?.title?.$t || "";
      const content = data?.entry?.content?.$t || "";

      if (!content) return null;

      const $ = cheerio.load(content);

      let thumbnail =
        $("img").first().attr("src") ||
        data?.entry?.media$thumbnail?.url ||
        "";

      thumbnail = normalizePoster(thumbnail);

      // Extract stream URLs
      let urls = extractVideoLinks(content);

      if (!urls.length) {
        const okIds = extractOkIds(content);
        if (okIds.length) {
          urls = okIds.map(id => `https://ok.ru/videoembed/${id}`);
        }
      }

      if (!urls.length) return null;

      return {
        title: title.trim(),
        thumbnail,
        urls
      };

    } catch {
      return null;
    }
  });
}

module.exports = {
  fetchFromBlog
};
