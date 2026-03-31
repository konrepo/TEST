const cheerio = require("cheerio");
const axiosClient = require("../utils/fetch");

const { normalizePoster, uniqById } = require("../utils/helpers");
const { buildStream } = require("../utils/streamResolvers");

/* =========================
   CONFIG
========================= */
const BASE_URL = "https://www.cat3movie.club";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36"
};

/* =========================
   HELPERS
========================= */
function absolutize(url, base = BASE_URL) {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function cleanTitle(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function cleanMovieTitle(title) {
  return cleanTitle(title)
    .replace(/\|\s*Free Sexy Movies.*$/i, "")
    .replace(/\|\s*Full\s+.*$/i, "")
    .replace(/\bFull\s+.*Movie.*$/i, "")
    .replace(/\bOnline\s+Free.*$/i, "")
    .trim();
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

async function resolveCat3Embed(embedUrl) {
  try {
    console.log("[cat3] Resolving embed:", embedUrl);

    const { data } = await axiosClient.get(embedUrl, {
      headers: {
        ...HEADERS,
        Referer: embedUrl
      }
    });

    const apiMatch =
      data.match(/url\s*:\s*"([^"]*\/api\/\?[^"]+)"/i) ||
      data.match(/url\s*:\s*'([^']*\/api\/\?[^']+)'/i);

    if (!apiMatch || !apiMatch[1]) {
      console.log("[cat3] No API URL found in embed");
      return [];
    }

    const apiUrl = apiMatch[1].replace(/\\\//g, "/");
    console.log("[cat3] Embed API:", apiUrl);

    const { data: apiRes } = await axiosClient.get(apiUrl, {
      headers: {
        ...HEADERS,
        Referer: embedUrl,
        Origin: "https://play.cat3movie.club",
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    console.log("[cat3] Embed API raw status:", apiRes?.status);

    const rawSources =
      apiRes?.sources ||
      apiRes?.data?.sources ||
      [];

    const sources = Array.isArray(rawSources)
      ? rawSources
          .map((s) => {
            if (typeof s === "string") return s;
            return s?.file || s?.src || s?.url || "";
          })
          .filter(Boolean)
      : [];

    console.log("[cat3] Embed resolved sources:", sources);

    return uniq(sources);
  } catch (e) {
    console.log("[cat3] resolveCat3Embed error:", e.message);
    return [];
  }
}

/* =========================
   JWPLAYER PARSER
========================= */
function extractSources(html) {
  const sources = [
    ...html.matchAll(/file\s*:\s*["']([^"']+)["']/gi)
  ]
    .map(m => String(m[1] || "").trim())
    .filter(url =>
      url &&
      url !== "#" &&
      /^https?:\/\//i.test(url) &&
      (/\.(mp4|m3u8)(\?|$)/i.test(url) || /\/video\//i.test(url))
    );

  return uniq(sources);
}

function extractServerLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = [];

  const iframeSrc = $("#movie-player iframe").attr("src");
  if (iframeSrc) links.push(absolutize(iframeSrc, pageUrl));

  $("#server-list a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push(absolutize(href, pageUrl));
  });

  return uniq(links);
}

/* =========================
   DETAIL
========================= */
async function getDetail(url) {
  try {
    console.log("[cat3] Fetching detail:", url);

    const { data } = await axiosClient.get(url, {
      headers: HEADERS
    });

    const $ = cheerio.load(data);

    const title = cleanMovieTitle(
      $("h1.single-post-title").text() ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text()
    );

    let poster =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      "";

    poster = normalizePoster(absolutize(poster, url));

    const category =
      $('nav[aria-label="Breadcrumbs"] .bf-breadcrumb-item a')
        .last()
        .text()
        .trim() ||
      $(".term-badges.floated .term-badge a").first().text().trim() ||
      "";

    const sources = extractSources(data);

    console.log("[cat3] Title:", title);
    console.log("[cat3] Category:", category);
    console.log("[cat3] Sources found:", sources);

    return {
      title,
      poster,
      category,
      sources
    };
  } catch (e) {
    console.log("[cat3] getDetail error:", e.message);
    return null;
  }
}

/* =========================
   CATALOG
========================= */
async function getCatalogItems(prefix, siteConfig, url) {
  try {
    const pageUrl = url || BASE_URL;

    const { data } = await axiosClient.get(pageUrl, {
      headers: HEADERS
    });

    const $ = cheerio.load(data);

    const posts = $("article[class*='listing-item']").toArray();

    const results = posts.map(el => {
      const $el = $(el);

      const linkEl = $el.find("h2.title a").first();

      const link = absolutize(linkEl.attr("href"), pageUrl);
      const title = cleanMovieTitle(
        linkEl.attr("title") || linkEl.text()
      );

      if (!link || !title) return null;

      let poster =
        $el.find("a.img-holder").attr("data-src") ||
        $el.find("a.img-holder").attr("src") ||
        $el.find("img").attr("data-src") ||
        $el.find("img").attr("src");

      poster = normalizePoster(absolutize(poster, pageUrl));

      const category = $el
        .find(".featured .term-badges .term-badge a")
        .first()
        .text()
        .trim();

      console.log("[cat3] category:", category);

      return {
        id: `${prefix}:${encodeURIComponent(link)}`,
        name: category ? `[${category}] ${title}` : title,
        poster,
		genres: category ? [category] : []
      };
    });

    return uniqById(results.filter(Boolean));
  } catch {
    return [];
  }
}

/* =========================
   NEXT PAGE
========================= */
function getNextPageUrl(base, html) {
  const $ = cheerio.load(html);

  const next =
    $("a.next.page-numbers").attr("href") ||
    $('a[rel="next"]').attr("href");

  return next ? absolutize(next, base) : null;
}

/* =========================
   EPISODES (single movie)
========================= */
async function getEpisodes(prefix, url) {
  const detail = await getDetail(url);

  if (!detail) return [];

  return [
    {
      id: `${prefix}:${encodeURIComponent(url)}`,
      title: detail.title,
      season: 1,
      episode: 1,
      thumbnail: detail.poster
    }
  ];
}

/* =========================
   STREAM
========================= */
async function getStream(prefix, url, epNum = 1) {
  console.log("[cat3] getStream called:", url);

  try {
    const detail = await getDetail(url);

    const { data } = await axiosClient.get(url, {
      headers: HEADERS
    });

    const serverLinks = extractServerLinks(data, url);
    console.log("[cat3] Streams:", serverLinks.length);
    console.log("[cat3] Server links:", serverLinks);

    const finalSources = [...(detail?.sources || [])];

    for (const serverUrl of serverLinks) {
	  console.log("[cat3] Checking server:", serverUrl);
	  
      if (/\.(m3u8|mp4)(\?|$)/i.test(serverUrl)) {
        finalSources.push(serverUrl);
        continue;
      }

      if (/play\.cat3movie\.club\/embed\//i.test(serverUrl)) {
        const embedSources = await resolveCat3Embed(serverUrl);
        finalSources.push(...embedSources);
        continue;
      }

      if (/playhydrax\.com/i.test(serverUrl)) {
        finalSources.push(serverUrl);
        continue;
      }
    }

    const uniqueSources = uniq(finalSources);
    console.log("[cat3] Final playable candidates:", uniqueSources);

    if (!uniqueSources.length) return null;

    return uniqueSources.map((src, index) =>
      buildStream(
        src,
        epNum,
        detail?.title || "Cat3Movie",
        `Cat3Movie ${index + 1}`,
        "cat3"
      )
    );
  } catch (e) {
    console.log("[cat3] getStream error:", e.message);
    return null;
  }
}

module.exports = {
  getCatalogItems,
  getEpisodes,
  getStream,
  getNextPageUrl
};