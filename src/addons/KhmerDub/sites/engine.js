const axios = require("axios");
const cheerio = require("cheerio");

const {
  URL_TO_POSTID,
  POST_INFO,
  getMaxEpFromSeriesPage
} = require("./cache");

// --------------------------------------------------
// AXIOS
// --------------------------------------------------

const axiosClient = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
  }
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizeUrl(url = "") {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

function normalizePoster(url = "") {
  if (!url) return "";
  return normalizeUrl(url.trim());
}

function decodeHtmlEntities(str = "") {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function unique(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function sortEpisodeUrls(urls = []) {
  return [...urls].sort((a, b) => {
    const ma = a.match(/-(\d{1,4})\/?$/);
    const mb = b.match(/-(\d{1,4})\/?$/);
    const ea = ma ? parseInt(ma[1], 10) : 0;
    const eb = mb ? parseInt(mb[1], 10) : 0;
    return ea - eb;
  });
}

function extractEpisodeNumber(url = "") {
  const m = url.match(/-(\d{1,4})\/?$/);
  return m ? parseInt(m[1], 10) : null;
}

function extractJwFileUrls(html = "") {
  const urls = new Set();
  const decoded = decodeHtmlEntities(html);

  // direct file:"..."
  const fileRegex =
    /file\s*:\s*["'](https?:\/\/[^"'<>]+(?:m3u8|mp4)(?:\?[^"'<>]*)?)["']/gi;

  let m;
  while ((m = fileRegex.exec(decoded)) !== null) {
    urls.add(m[1].trim());
  }

  // sources:[{file:"..."}]
  const sourcesRegex =
    /sources\s*:\s*\[\s*\{\s*file\s*:\s*["'](https?:\/\/[^"'<>]+(?:m3u8|mp4)(?:\?[^"'<>]*)?)["']/gi;

  while ((m = sourcesRegex.exec(decoded)) !== null) {
    urls.add(m[1].trim());
  }

  // whole player HTML encoded in <option value="BASE64...">
  const optionRegex = /<option[^>]+value="([^"]+)"[^>]*>/gi;
  while ((m = optionRegex.exec(decoded)) !== null) {
    const raw = (m[1] || "").trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(raw) || raw.length < 40) continue;

    try {
      const inner = Buffer.from(raw, "base64").toString("utf8");

      let n;
      while ((n = fileRegex.exec(inner)) !== null) {
        urls.add(n[1].trim());
      }
      while ((n = sourcesRegex.exec(inner)) !== null) {
        urls.add(n[1].trim());
      }
    } catch {}
  }

  return [...urls];
}

function buildStream(url, episode, title, sourceName, behaviorHints) {
  return {
    name: sourceName || "Stream",
    title: title || `Episode ${episode}`,
    url,
    behaviorHints: {
      notWebReady: false,
      bingeGroup: behaviorHints || "default"
    }
  };
}

// --------------------------------------------------
// GENERIC FETCH
// --------------------------------------------------

async function fetchHtml(url, referer) {
  const { data } = await axiosClient.get(url, {
    headers: {
      Referer: referer || url
    }
  });
  return data;
}

// --------------------------------------------------
// VIP / NIZU LOGIC
// --------------------------------------------------

async function getVipEpisodePages(seriesUrl) {
  const html = await fetchHtml(seriesUrl, seriesUrl);
  const $ = cheerio.load(html);
  const urls = new Set();

  // sidebar episode list / related episodes / any episode-like link
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").trim();
    if (!href) return;

    let abs;
    try {
      abs = new URL(href, seriesUrl).toString();
    } catch {
      return;
    }

    // skip the series page itself
    if (abs === seriesUrl) return;

    // keep episode pages like /virak-nearei-hang-pleung-01/
    if (/\/[^/]+-\d{1,4}\/?$/i.test(abs)) {
      urls.add(abs);
    }
  });

  const sorted = sortEpisodeUrls([...urls]);
  console.log("[VIP] episode pages:", sorted);

  return sorted;
}

async function getVipSeriesPoster(seriesUrl) {
  const html = await fetchHtml(seriesUrl, seriesUrl);
  const $ = cheerio.load(html);

  return normalizePoster(
    $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      $(".thumb img").first().attr("src") ||
      $("img").first().attr("src") ||
      ""
  );
}

async function getVipEpisodeStreamUrl(episodeUrl) {
  const html = await fetchHtml(episodeUrl, episodeUrl);
  const urls = extractJwFileUrls(html);

  console.log("[VIP-EPISODE] jw urls:", {
    episodeUrl,
    urls
  });

  return urls[0] || null;
}

// --------------------------------------------------
// OPTIONAL RESOLVERS
// --------------------------------------------------

async function resolvePlayerUrl(url) {
  try {
    const html = await fetchHtml(url, url);
    const urls = extractJwFileUrls(html);
    return urls[0] || url;
  } catch {
    return url;
  }
}

async function resolveOkEmbed(url) {
  try {
    const html = await fetchHtml(url, url);

    const match =
      html.match(/hlsManifestUrl\\u0026quot;:\s*\\u0026quot;([^"]+)/i) ||
      html.match(/hlsMasterPlaylistUrl\\u0026quot;:\s*\\u0026quot;([^"]+)/i) ||
      html.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);

    if (!match) return url;

    let out = match[1];
    out = out.replace(/\\u0026/g, "&").replace(/\\/g, "");
    return out;
  } catch {
    return url;
  }
}

// --------------------------------------------------
// EXISTING NON-VIP LOGIC PLACEHOLDER
// --------------------------------------------------

async function getStreamDetail(prefix, seriesUrl, postId) {
  // Placeholder so VIP code below is clear.
  return POST_INFO.get(postId)?.detail || null;
}

async function getPostIdFromUrl(prefix, seriesUrl) {
  // This fallback preserves cache usage
  const cached = URL_TO_POSTID.get(seriesUrl);
  if (cached) {
    console.log("[POSTID:CACHE]", {
      url: seriesUrl,
      ...cached
    });
    return cached;
  }

  return null;
}

// --------------------------------------------------
// EPISODES
// --------------------------------------------------

async function getEpisodes(prefix, seriesUrl) {
  // -----------------------------
  // VIP / NIZU
  // -----------------------------
  if (prefix === "vip") {
    try {
      const episodePages = await getVipEpisodePages(seriesUrl);
      if (!episodePages.length) {
        console.log("[VIP] fallback episode urls: []");
        return [];
      }

      const poster = await getVipSeriesPoster(seriesUrl);

      const items = episodePages.map((epUrl, index) => {
        const epNo = extractEpisodeNumber(epUrl) || index + 1;

        return {
          id: `${prefix}:${encodeURIComponent(seriesUrl)}:1:${epNo}`,
          title: `Episode ${epNo}`,
          season: 1,
          episode: epNo,
          thumbnail: poster,
          released: new Date().toISOString()
        };
      });

      console.log("[VIP] fallback episode urls:", episodePages);
      return items;
    } catch (err) {
      console.log("[VIP] getEpisodes error:", err.message);
      return [];
    }
  }

  // -----------------------------
  // IDRAMA / OTHERS
  // -----------------------------
  const meta = await getPostIdFromUrl(prefix, seriesUrl);
  if (!meta || !meta.postId) {
    console.log("[EPISODES]", {
      prefix,
      seriesUrl,
      postId: null,
      detail: null
    });
    return [];
  }

  const detail = await getStreamDetail(prefix, seriesUrl, meta.postId);

  console.log("[EPISODES]", {
    prefix,
    seriesUrl,
    postId: meta.postId,
    detail
  });

  if (!detail || !Array.isArray(detail.urls) || !detail.urls.length) {
    return [];
  }

  const maxEp =
    meta.maxEp ||
    detail.urls.length ||
    getMaxEpFromSeriesPage(meta.postId) ||
    detail.urls.length;

  return detail.urls.slice(0, maxEp).map((_, index) => ({
    id: `${prefix}:${encodeURIComponent(seriesUrl)}:1:${index + 1}`,
    title: `Episode ${index + 1}`,
    season: 1,
    episode: index + 1,
    thumbnail: normalizePoster(detail.thumbnail || ""),
    released: new Date().toISOString()
  }));
}

// --------------------------------------------------
// STREAM
// --------------------------------------------------

async function getStream(prefix, seriesUrl, season, episode) {
  // -----------------------------
  // VIP / NIZU
  // -----------------------------
  if (prefix === "vip") {
    try {
      const episodePages = await getVipEpisodePages(seriesUrl);
      const episodeUrl = episodePages.find(
        (u) => extractEpisodeNumber(u) === Number(episode)
      ) || episodePages[Number(episode) - 1];

      if (!episodeUrl) {
        console.log("[VIP] no episode page found:", {
          seriesUrl,
          episode
        });
        return null;
      }

      let url = await getVipEpisodeStreamUrl(episodeUrl);
      if (!url) {
        console.log("[VIP] no stream found:", {
          episodeUrl
        });
        return null;
      }

      if (url.includes("player.php")) {
        url = await resolvePlayerUrl(url);
      }

      if (url.includes("ok.ru/videoembed/")) {
        url = await resolveOkEmbed(url);
      }

      return buildStream(
        url,
        episode,
        `Episode ${episode}`,
        "PhumiVIP",
        "vip"
      );
    } catch (err) {
      console.log("[VIP] getStream error:", err.message);
      return null;
    }
  }

  // -----------------------------
  // IDRAMA / OTHERS
  // -----------------------------
  const meta = await getPostIdFromUrl(prefix, seriesUrl);
  if (!meta || !meta.postId) return null;

  const detail = await getStreamDetail(prefix, seriesUrl, meta.postId);

  console.log("[EPISODES]", {
    prefix,
    seriesUrl,
    postId: meta.postId,
    detail
  });

  if (!detail || !Array.isArray(detail.urls) || !detail.urls.length) {
    return null;
  }

  let url = detail.urls[Number(episode) - 1];
  if (!url) return null;

  if (url.includes("player.php")) {
    url = await resolvePlayerUrl(url);
  }

  if (url.includes("ok.ru/videoembed/")) {
    url = await resolveOkEmbed(url);
  }

  return buildStream(
    url,
    episode,
    `Episode ${episode}`,
    "Stream",
    prefix
  );
}

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------

module.exports = {
  getEpisodes,
  getStream,
  extractJwFileUrls,
  getVipEpisodePages,
  getVipEpisodeStreamUrl
};
