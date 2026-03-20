const cheerio = require("cheerio");
const axiosClient = require("../utils/fetch");
const {
  normalizePoster,
  extractVideoLinks,
  extractMaxEpFromTitle,
  extractOkIds,
  uniqById,
} = require("../utils/helpers");
const { URL_TO_POSTID, POST_INFO, BLOG_IDS } = require("../utils/cache");

const FILE_REGEX =
  /file\s*:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']+)?)["']/gi;

function logHtmlDebug(prefix, label, html) {
  const text = String(html || "");
  console.log(`[${prefix}] ${label} HTML PREVIEW:`, text.replace(/\s+/g, " ").slice(0, 250));
}

function normalizeKeyUrl(url = "") {
  return String(url || "").trim().replace(/\/$/, "");
}

/* =========================
   GET POST ID
========================= */
async function getPostId(url) {
  const cacheKey = normalizeKeyUrl(url);

  if (URL_TO_POSTID.has(cacheKey)) {
    return URL_TO_POSTID.get(cacheKey);
  }

  try {
    const { data } = await axiosClient.get(url);
    const $ = cheerio.load(data);

    let postId = $("#player").attr("data-post-id");

    if (!postId) {
      const fanta = $('div[id="fanta"][data-post-id]').first();
      if (fanta.length) {
        postId = fanta.attr("data-post-id");
      }
    }

    if (!postId) {
      const match = String(data).match(
        /blogger\.com\/feeds\/\d+\/posts\/default\/(\d+)\?alt=json/i
      );
      if (match) {
        postId = match[1];
      }
    }

    if (!postId) {
      console.log("[postId] not found:", url);
      logHtmlDebug("engine", "POSTID MISS", data);
      return null;
    }

    const pageTitle = $("title").text().trim();
    let maxEp = extractMaxEpFromTitle(pageTitle);

    if (!maxEp) {
      const epText = $('b:contains("episode/")').first().text() || "";
      const m = epText.match(/episode\/(?:END\.)?(\d+)/i);
      if (m) {
        maxEp = parseInt(m[1], 10);
      }
    }

    URL_TO_POSTID.set(cacheKey, postId);

    if (maxEp) {
      POST_INFO.set(postId, {
        ...(POST_INFO.get(postId) || {}),
        maxEp,
      });
    }

    console.log("[postId] resolved:", {
      url,
      postId,
      maxEp: maxEp || null,
      pageTitle,
    });

    return postId;
  } catch (err) {
    console.error("[postId] error:", {
      url,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

/* =========================
   BLOGGER FETCH
========================= */
async function fetchFromBlog(blogId, postId) {
  const feedUrl = `https://www.blogger.com/feeds/${blogId}/posts/default/${postId}?alt=json`;

  try {
    const { data } = await axiosClient.get(feedUrl);

    const title = data?.entry?.title?.$t || "";
    const content = data?.entry?.content?.$t || "";
    const $content = cheerio.load(content);

    let thumbnail =
      $content('meta[property="og:image"]').attr("content") ||
      $content('meta[name="twitter:image"]').attr("content") ||
      $content("img").first().attr("src") ||
      data?.entry?.media$thumbnail?.url ||
      "";

    thumbnail = normalizePoster(thumbnail);

    let urls = extractVideoLinks(content);

    if (!urls.length) {
      const hasOkEmbed = /\{embed\s*=\s*ok\}/i.test(content);
      const okIds = extractOkIds(content);

      if (hasOkEmbed && okIds.length) {
        urls = okIds.map((id) => `https://ok.ru/videoembed/${id}`);
      }
    }

    urls = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];

    if (!urls.length) {
      console.log("[blog fetch] no urls:", { blogId, postId, title });
      return null;
    }

    return { title, thumbnail, urls };
  } catch (err) {
    console.error("[blog fetch] error:", {
      blogId,
      postId,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

/* =========================
   STREAM DETAIL
========================= */
async function getStreamDetail(postId) {
  const cached = POST_INFO.get(postId);
  if (cached?.detail) return cached.detail;

  const results = await Promise.all(
    Object.values(BLOG_IDS).map((blogId) => fetchFromBlog(blogId, postId))
  );

  const detail = results.find(Boolean);
  if (!detail) {
    console.log("[detail] not found:", postId);
    return null;
  }

  POST_INFO.set(postId, {
    ...(POST_INFO.get(postId) || {}),
    detail,
  });

  return detail;
}

function buildEpisodeObject(prefix, seriesUrl, url, ep, title, thumbnail) {
  return {
    id: ep,
    url,
    title,
    season: 1,
    episode: ep,
    thumbnail,
    released: new Date().toISOString(),
    behaviorHints: {
      group: `${prefix}:${encodeURIComponent(seriesUrl)}`,
    },
  };
}

/* =========================
   EPISODES
========================= */
async function getEpisodes(prefix, seriesUrl) {
  const postId = await getPostId(seriesUrl);

  if (!postId && prefix === "sunday") {
    try {
      const { data } = await axiosClient.get(seriesUrl);

      FILE_REGEX.lastIndex = 0;

      const urls = [];
      let match;

      while ((match = FILE_REGEX.exec(data)) !== null) {
        urls.push(match[1]);
      }

      const uniqueUrls = [...new Set(urls)];
      if (!uniqueUrls.length) {
        console.log("[sunday] no playlist urls:", seriesUrl);
        logHtmlDebug(prefix, "PLAYLIST MISS", data);
        return [];
      }

      const $ = cheerio.load(data);
      const pagePoster =
        $("meta[property='og:image']").attr("content") ||
        $("link[rel='image_src']").attr("href") ||
        "";

      const normalizedPoster = normalizePoster(pagePoster || "");

      return uniqueUrls.map((url, index) => {
        const m = String(url).match(/-(\d+)/);
        const epNum = m ? parseInt(m[1], 10) : index + 1;

        return buildEpisodeObject(
          prefix,
          seriesUrl,
          url,
          epNum,
          `Episode ${epNum}`,
          normalizedPoster
        );
      });
    } catch (err) {
      console.error(`[${prefix}] playlist episodes error:`, {
        url: seriesUrl,
        message: err.message,
        status: err.response?.status || null,
      });
      return [];
    }
  }

  if (!postId) return [];

  const detail = await getStreamDetail(postId);
  if (!detail) return [];

  let maxEp = POST_INFO.get(postId)?.maxEp || null;

  if (!maxEp && detail.title) {
    const extracted = extractMaxEpFromTitle(detail.title);
    if (extracted) {
      maxEp = extracted;
      POST_INFO.set(postId, {
        ...(POST_INFO.get(postId) || {}),
        maxEp,
      });
    }
  }

  let episodes = [];

  if (prefix === "vip" || prefix === "idrama") {
    const seen = new Set();

    for (let i = 0; i < detail.urls.length; i++) {
      const url = detail.urls[i];
      const m = String(url).match(/-(\d+)(?:\D|$)/);
      let ep = m ? parseInt(m[1], 10) : null;

      if (!ep) ep = i + 1;
      if (ep < 1) continue;

      if (!seen.has(ep)) {
        seen.add(ep);
        episodes.push({ url, ep });
      }
    }

    episodes.sort((a, b) => a.ep - b.ep);

    if (maxEp && episodes.length > maxEp) {
      episodes = episodes.filter((item) => item.ep <= maxEp);
    }
  } else {
    const urls = [...new Set(detail.urls)].filter(Boolean).sort();
    episodes = urls.map((url, index) => ({
      url,
      ep: index + 1,
    }));
  }

  console.log(`[${prefix}] FINAL MAX EP:`, maxEp);
  console.log(`[${prefix}] FINAL EP COUNT:`, episodes.length);

  return episodes.map(({ url, ep }) =>
    buildEpisodeObject(prefix, seriesUrl, url, ep, detail.title, detail.thumbnail)
  );
}

/* =========================
   PLAYER RESOLVE
========================= */
async function resolvePlayerUrl(playerUrl) {
  try {
    const { data } = await axiosClient.get(playerUrl);

    const html = String(data || "")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");

    const match = html.match(
      /https?:\/\/phumikhmer\.vip\/player\.php\?stream=[^"'<> ]+/i
    );

    return match ? match[0] : null;
  } catch (err) {
    console.error("[resolvePlayerUrl] error:", {
      playerUrl,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

/* =========================
   RESOLVE OK
========================= */
async function resolveOkEmbed(embedUrl) {
  try {
    const { data } = await axiosClient.get(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://ok.ru/",
      },
    });

    const html = String(data || "");

    const hlsMatch =
      html.match(/\\&quot;ondemandHls\\&quot;:\\&quot;(https:\/\/[^"]+?\.m3u8)/) ||
      html.match(/&quot;ondemandHls&quot;:&quot;(https:\/\/[^"]+?\.m3u8)/) ||
      html.match(/"ondemandHls"\s*:\s*"(https:[^"]+?\.m3u8[^"]*)"/) ||
      html.match(/"hlsMasterPlaylistUrl"\s*:\s*"(https:[^"]+?\.m3u8[^"]*)"/);

    if (!hlsMatch) {
      console.log("[resolveOkEmbed] no hls found:", embedUrl);
      logHtmlDebug("engine", "OK MISS", html);
      return null;
    }

    return hlsMatch[1]
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\\&quot;.*/g, "");
  } catch (err) {
    console.error("[resolveOkEmbed] error:", {
      embedUrl,
      message: err.message,
      status: err.response?.status || null,
    });
    return null;
  }
}

function buildStream(url, episode) {
  const isM3U8 = String(url).includes(".m3u8");

  let headers = null;

  if (/ok\.ru|okcdn\.ru/i.test(url)) {
    headers = {
      Referer: "https://ok.ru/",
      Origin: "https://ok.ru",
    };
  } else if (String(url).includes("sooplive.co.kr")) {
    headers = {
      Referer: "https://www.sundaydrama.com/",
      Origin: "https://www.sundaydrama.com",
    };
  }

  return {
    url,
    title: `Episode ${episode}`,
    type: isM3U8 ? "hls" : undefined,
    behaviorHints: {
      group: "khmerdub",
      ...(headers && {
        proxyHeaders: {
          request: headers,
        },
      }),
    },
  };
}

/* =========================
   STREAM
========================= */
async function getStream(prefix, episodeUrl, episode) {
  if (prefix === "sunday") {
    return buildStream(episodeUrl, episode);
  }

  let url = episodeUrl;

  if (String(url).includes("player.php")) {
    const resolved = await resolvePlayerUrl(url);
    if (!resolved) return null;
    url = resolved;
  }

  if (String(url).includes("ok.ru/videoembed/")) {
    const resolved = await resolveOkEmbed(url);
    if (!resolved) return null;
    url = resolved;
  }

  return buildStream(url, episode);
}

/* =========================
   CATALOG
========================= */
async function getCatalogItems(prefix, siteConfig, url) {
  try {
    if (prefix === "sunday") {
      const allItems = [];
      let currentUrl = url;
      const BLOGGER_PAGES_PER_BATCH = 3;

      for (let i = 0; i < BLOGGER_PAGES_PER_BATCH && currentUrl; i++) {
        const { data: pageData } = await axiosClient.get(currentUrl);
        const $$ = cheerio.load(pageData);

        const articles = $$(siteConfig.articleSelector).toArray();

        for (const el of articles) {
          const $el = $$(el);
          const a = $el.find(siteConfig.titleSelector).first();

          const title = (a.attr("title") || "").trim() || a.text().trim();
          const link = a.attr("href");

          if (!title || !link) continue;

          let poster = "";
          const posterEl = $el.find(siteConfig.posterSelector).first();

          for (const attr of siteConfig.posterAttrs) {
            poster = posterEl.attr(attr) || poster;
            if (poster) break;
          }

          allItems.push({
            id: link,
            name: title,
            poster: normalizePoster(poster),
          });
        }

        const older = $$("a.blog-pager-older-link").attr("href");
        currentUrl = older || null;
      }

      return uniqById(allItems);
    }

    const { data } = await axiosClient.get(url);
    const $ = cheerio.load(data);

    const articles = $(siteConfig.articleSelector).toArray();

    const results = articles
      .map((el) => {
        const $el = $(el);
        const a = $el.find(siteConfig.titleSelector).first();

        const title = a.text().trim();
        const link = a.attr("href");
        if (!title || !link) return null;

        let poster = "";
        const posterEl = $el.find(siteConfig.posterSelector).first();

        for (const attr of siteConfig.posterAttrs) {
          poster = posterEl.attr(attr) || poster;
          if (poster) break;
        }

        return {
          id: link,
          name: title,
          poster: normalizePoster(poster),
        };
      })
      .filter(Boolean);

    return results;
  } catch (err) {
    console.error(`[${prefix}] catalog failed:`, {
      url,
      message: err.message,
      status: err.response?.status || null,
    });
    return [];
  }
}

module.exports = {
  getCatalogItems,
  getEpisodes,
  getStream,
};