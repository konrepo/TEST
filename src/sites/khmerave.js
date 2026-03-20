const cheerio = require("cheerio");
const axiosClient = require("../utils/fetch");

const UA_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const UA_MOB =
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Safari/537.36";

function referer(prefix) {
  return prefix === "merlkon"
    ? "https://www.khmerdrama.com/"
    : "https://www.khmeravenue.com/";
}

function cleanTitle(title) {
  return String(title || "")
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function posterFromStyle(style) {
  const match = String(style || "").match(/url\((.*?)\)/i);
  return match ? match[1].replace(/['"]/g, "") : "";
}

function normalizeUrl(url = "") {
  return String(url).trim().replace(/\/$/, "");
}

function getSiteUA(prefix) {
  return prefix === "khmerave" ? UA_WIN : UA_MOB;
}

function extractEpisodeNumber(link, text, seriesUrl) {
  const cleanLink = normalizeUrl(link);
  const cleanSeries = normalizeUrl(seriesUrl);
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  if (cleanLink === cleanSeries) return 1;

  const dupSuffixMatch = cleanLink.match(/-(\d+)-\d+$/i);
  if (dupSuffixMatch) return parseInt(dupSuffixMatch[1], 10);

  const eSuffixMatch = cleanLink.match(/-(\d+)e-\d+$/i);
  if (eSuffixMatch) return parseInt(eSuffixMatch[1], 10);

  const endSuffixMatch = cleanLink.match(/-(\d+)-end$/i);
  if (endSuffixMatch) return parseInt(endSuffixMatch[1], 10);

  const genericMatch = cleanLink.match(/-(\d+)(?:-|\/|$)/i);
  if (genericMatch) return parseInt(genericMatch[1], 10);

  const textMatch = cleanText.match(/episode\s*0*([0-9]+)/i);
  if (textMatch) {
    const num = parseInt(textMatch[1], 10);
    return Number.isNaN(num) ? null : num;
  }

  return null;
}

function buildHeaders(prefix, ua) {
  return {
    "User-Agent": ua,
    Referer: referer(prefix),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function logPreview(prefix, label, html) {
  console.log(
    `[${prefix}] ${label} PREVIEW:`,
    String(html || "").replace(/\s+/g, " ").slice(0, 250)
  );
}

/* =========================
   CATALOG
========================= */
async function getCatalogItems(prefix, siteConfig, url) {
  try {
    const { data } = await axiosClient.get(url, {
      headers: {
        "User-Agent": UA_WIN,
        Referer: referer(prefix),
      },
    });

    const $ = cheerio.load(data);
    const items = [];

    console.log(`[${prefix}] CATALOG URL:`, url);
    console.log(`[${prefix}] CATALOG CARDS:`, $(".card-content").length);

    $(".card-content").each((_, el) => {
      const link = $(el).find("a").attr("href");
      const title = cleanTitle($(el).find("h3").first().text());
      const style = $(el).find(".card-content-image").attr("style") || "";
      const poster = posterFromStyle(style);

      if (!link || !title) return;

      items.push({
        id: link,
        name: title,
        poster,
      });
    });

    console.log(`[${prefix}] CATALOG ITEMS:`, items.length);
    return items;
  } catch (err) {
    console.error(`[${prefix}] catalog error:`, {
      url,
      message: err.message,
      status: err.response?.status || null,
    });
    return [];
  }
}

/* =========================
   EPISODES
========================= */
async function getEpisodes(prefix, seriesUrl) {
  try {
    const { data } = await axiosClient.get(seriesUrl, {
      headers: buildHeaders(prefix, getSiteUA(prefix)),
    });

    const $ = cheerio.load(data);
    const pageTitle = $("h1").first().text().trim() || seriesUrl;

    console.log(`[${prefix}] EP PREFIX:`, prefix);
    console.log(`[${prefix}] EP URL:`, seriesUrl);
    console.log(`[${prefix}] EP TITLE:`, pageTitle);
    console.log(`[${prefix}] EP ROWS:`, $("#latest-videos tbody tr").length);
    console.log(`[${prefix}] EP ANCHORS:`, $("a[href]").length);

    let poster = "";
    const imgDiv = $(".album-content-image").first();
    if (imgDiv.length) {
      poster = posterFromStyle(imgDiv.attr("style") || "");
    }

    const cleanSeries = normalizeUrl(seriesUrl);
    const episodeMap = new Map();

    $("#latest-videos tbody tr").each((_, row) => {
      const a = $(row).find("a[href]").first();
      const link = (a.attr("href") || "").trim();
      const text = a.text();

      if (!link) return;

      const cleanLink = normalizeUrl(link);
      if (!cleanLink.includes("/videos/") && cleanLink !== cleanSeries) return;
      if (cleanLink.includes("?post_type=videos")) return;

      const epNumber = extractEpisodeNumber(link, text, seriesUrl);

      console.log(`[${prefix}] ROW DEBUG:`, {
        link,
        text: text.trim(),
        epNumber,
      });

      if (epNumber == null || Number.isNaN(epNumber) || epNumber < 1) return;

      if (!episodeMap.has(epNumber)) {
        episodeMap.set(epNumber, {
          link,
          epNumber,
        });
      }
    });

    if (!episodeMap.size) {
      console.log(`[${prefix}] FALLBACK: scanning all anchors`);

      $("a[href]").each((_, el) => {
        const link = ($(el).attr("href") || "").trim();
        const text = $(el).text();

        if (!link) return;

        const cleanLink = normalizeUrl(link);
        if (!cleanLink.includes("/videos/") && cleanLink !== cleanSeries) return;
        if (cleanLink.includes("?post_type=videos")) return;

        const epNumber = extractEpisodeNumber(link, text, seriesUrl);

        console.log(`[${prefix}] FALLBACK ROW DEBUG:`, {
          link,
          text: text.trim(),
          epNumber,
        });

        if (epNumber == null || Number.isNaN(epNumber) || epNumber < 1) return;

        if (!episodeMap.has(epNumber)) {
          episodeMap.set(epNumber, {
            link,
            epNumber,
          });
        }
      });
    }

    const episodes = [...episodeMap.values()].sort((a, b) => a.epNumber - b.epNumber);

    if (!episodes.length) {
      console.log(`[${prefix}] no episodes found`);
      logPreview(prefix, "EPISODES MISS", data);
      return [];
    }

    console.log(
      `[${prefix}] FINAL EPISODES:`,
      episodes.map((e) => e.epNumber)
    );
    console.log(`[${prefix}] FINAL EP COUNT:`, episodes.length);

    return episodes.map((ep) => ({
      id: ep.epNumber,
      url: ep.link,
      title: pageTitle,
      season: 1,
      episode: ep.epNumber,
      thumbnail: poster,
      released: new Date().toISOString(),
      behaviorHints: {
        group: `${prefix}:${encodeURIComponent(seriesUrl)}`,
      },
    }));
  } catch (err) {
    console.error(`[${prefix}] meta error:`, {
      url: seriesUrl,
      message: err.message,
      status: err.response?.status || null,
    });
    return [];
  }
}

/* =========================
   STREAM HELPERS
========================= */
function normalizeOkUrl(url) {
  if (!url) return url;

  let normalized = String(url).trim();

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }

  return normalized.replace("m.ok.ru", "ok.ru");
}

function tryExtractVideoCandidateFromKhmerAvenue(html) {
  const source = String(html || "");

  const b64 = source.match(/Base64\.decode\("(.+?)"\)/i);
  if (b64?.[1]) {
    try {
      const decoded = Buffer.from(b64[1], "base64").toString("utf8");
      const iframeMatch = decoded.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch?.[1]) {
        return iframeMatch[1];
      }
    } catch (err) {
      console.error("[khmerave] base64 decode error:", err.message);
    }
  }

  const patterns = [
    /['"]?file['"]?\s*:\s*['"]([^'"]+)['"]/i,
    /<iframe[^>]*src=["']([^"']+)["']/i,
    /<source[^>]*src=["']([^"']+)["']/i,
    /playlist:\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function resolveOkRuToDirect(iframeUrl, ua) {
  try {
    const okUrl = normalizeOkUrl(iframeUrl);

    const { data } = await axiosClient.get(okUrl, {
      headers: {
        "User-Agent": ua,
        Referer: "https://ok.ru/",
      },
    });

    let html = String(data || "");

    html = html
      .replace(/\\&quot;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/\\u0026/g, "&")
      .replace(/\\&/g, "&")
      .replace(/\\\//g, "/");

    const patterns = [
      /"ondemandHls"\s*:\s*"([^"]+)/,
      /"hlsMasterPlaylistUrl"\s*:\s*"([^"]+)/,
      /"hlsManifestUrl"\s*:\s*"([^"]+)/,
      /"(https:[^"]+\.m3u8[^"]*)"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1]
          .replace(/\\u0026/g, "&")
          .replace(/\\&/g, "&");
      }
    }

    console.log("[khmerave] OK direct not found:", okUrl);
    logPreview("khmerave", "OK MISS", html);
    return null;
  } catch (err) {
    console.error("[khmerave] OK resolver error:", {
      iframeUrl,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

/* =========================
   STREAM
========================= */
async function getStream(prefix, episodeUrl, episode) {
  try {
    const { data } = await axiosClient.get(episodeUrl, {
      headers: {
        "User-Agent": getSiteUA(prefix),
        Referer: referer(prefix),
      },
    });

    const html = String(data || "");
    const candidate = tryExtractVideoCandidateFromKhmerAvenue(html);

    console.log(`[${prefix}] STREAM URL:`, episodeUrl);
    console.log(`[${prefix}] STREAM CANDIDATE:`, candidate);

    if (!candidate) {
      logPreview(prefix, "STREAM MISS", html);
      return null;
    }

    const normalizedCandidate = normalizeOkUrl(candidate);

    if (/ok\.ru/.test(normalizedCandidate)) {
      const direct = await resolveOkRuToDirect(normalizedCandidate, UA_MOB);
      if (!direct) return null;

      return {
        title: `Episode ${String(episode).padStart(2, "0")}`,
        url: direct,
        behaviorHints: {
          group: `${prefix}:${encodeURIComponent(episodeUrl)}`,
          notWebReady: true,
          proxyHeaders: {
            request: {
              Referer: "https://ok.ru/",
              "User-Agent": UA_MOB,
            },
          },
        },
      };
    }

    if (/\.(m3u8|mp4)(\?|$)/i.test(normalizedCandidate)) {
      return {
        title: `Episode ${String(episode).padStart(2, "0")}`,
        url: normalizedCandidate,
      };
    }

    console.log(`[${prefix}] STREAM NO MATCH FOR CANDIDATE:`, normalizedCandidate);
    return null;
  } catch (err) {
    console.error(`[${prefix}] stream error:`, {
      url: episodeUrl,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

module.exports = {
  getCatalogItems,
  getEpisodes,
  getStream,
};