const cheerio = require("cheerio");
const axiosClient = require("../../utils/fetch");
const { withRequestCache } = require("../../utils/requestCache");

const {
  normalizePoster,
  extractVideoLinks
} = require("../../utils/helpers");

async function fetchWordpressDetail(seriesUrl, postId) {
  const cacheKey = `wp:${postId}`;

  return withRequestCache(cacheKey, async () => {
    try {
      const { data } = await axiosClient.get(seriesUrl, {
        headers: { Referer: seriesUrl }
      });

      const $ = cheerio.load(data);

      const title =
        $("h1").first().text().trim() ||
        $("meta[property='og:title']").attr("content") ||
        "";

      let thumbnail =
        $("meta[property='og:image']").attr("content") ||
        $("img").first().attr("src") ||
        "";

      thumbnail = normalizePoster(thumbnail);

      // 1) Direct HTML scan
      let urls = extractVideoLinks(data);
      if (urls.length) {
        return { title, thumbnail, urls };
      }

      // 2) Inline scripts scan
      const scripts = $("script")
        .map((_, el) => $(el).html() || "")
        .get()
        .join("\n");

      urls = extractVideoLinks(scripts);
      if (urls.length) {
        return { title, thumbnail, urls };
      }

      // 3) WP REST API fallback
      try {
        const apiUrl = `https://phumikhmer.vip/wp-json/wp/v2/posts/${postId}`;
        const { data: wpData } = await axiosClient.get(apiUrl, {
          headers: { Referer: seriesUrl }
        });

        const rendered = wpData?.content?.rendered || "";
        const apiUrls = extractVideoLinks(rendered);

        if (apiUrls.length) {
          return {
            title: wpData?.title?.rendered || title,
            thumbnail,
            urls: apiUrls
          };
        }
      } catch {
        // ignore REST failures
      }

      return null;

    } catch {
      return null;
    }
  });
}

module.exports = {
  fetchWordpressDetail
};