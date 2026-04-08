const cheerio = require("cheerio");
const axiosClient = require("../utils/fetch");

const { normalizePoster, uniqById } = require("../utils/helpers");

const episodeService = require("./core/episodeService");
const streamService = require("./core/streamService");

async function getCatalogItems(prefix, siteConfig, url) {
  try {
    const { data } = await axiosClient.get(url, {
      headers: { Referer: siteConfig.baseUrl || url }
    });

    const $ = cheerio.load(data);
    const articles = $(siteConfig.articleSelector).toArray();

    const results = articles.map(el => {
      const $el = $(el);
      const a = $el.find(siteConfig.titleSelector).first();

      const title = a.text().trim();
      const link = a.attr("href");
      if (!title || !link) return null;

      let poster = "";
      const posterEl = $el.find(siteConfig.posterSelector).first();

      for (const attr of siteConfig.posterAttrs || []) {
        poster = posterEl.attr(attr) || poster;
        if (poster) break;
      }

      return {
        id: `${prefix}:${encodeURIComponent(link)}`,
        name: title,
        poster: normalizePoster(poster)
      };
    });

    return uniqById(results.filter(Boolean));

  } catch {
    return [];
  }
}

module.exports = {
  getCatalogItems,
  getEpisodes: episodeService.getEpisodes,
  getStream: streamService.getStream
};