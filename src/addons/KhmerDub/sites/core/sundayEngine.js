const cheerio = require("cheerio");
const axiosClient = require("../../utils/fetch");

const FILE_REGEX =
  /file\s*:\s*https?:\/\/[^"']+\.mp4(?:\?[^"']+)?["']/gi;

async function getSundayEpisodes(prefix, seriesUrl) {
  try {
    const { data } = await axiosClient.get(seriesUrl);
    FILE_REGEX.lastIndex = 0;

    const urls = [];
    let match;

    while ((match = FILE_REGEX.exec(data)) !== null) {
      urls.push(match[1]);
    }

    const $ = cheerio.load(data);
    const poster =
      $("meta[property='og:image']").attr("content") ||
      "";

    return urls.map((url, index) => ({
      id: `${prefix}:${encodeURIComponent(seriesUrl)}:1:${index + 1}`,
      title: `Episode ${index + 1}`,
      season: 1,
      episode: index + 1,
      thumbnail: poster,
      released: new Date().toISOString()
    }));
  } catch {
    return [];
  }
}

module.exports = {
  getSundayEpisodes
};