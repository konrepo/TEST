const cheerio = require("cheerio");
const axiosClient = require("../../utils/fetch");

const {
  getPostIdFromUrl,
  setPostIdForUrl,
  getPostInfo,
  setPostInfo
} = require("../../utils/cache");

const { extractMaxEpFromTitle } = require("../../utils/helpers");

async function resolvePost(seriesUrl) {
  /* =========================
     CACHE FAST PATH
  ========================= */
  const cachedPostId = getPostIdFromUrl(seriesUrl);
  if (cachedPostId) {
    return {
      postId: cachedPostId,
      info: getPostInfo(cachedPostId)
    };
  }

  /* =========================
     FETCH PAGE
  ========================= */
  const { data } = await axiosClient.get(seriesUrl, {
    headers: { Referer: seriesUrl }
  });

  const $ = cheerio.load(data);

  let postId = null;
  let sourceType = null;

  /* =========================
     DETECT POST ID
  ========================= */

  // Blogger embedded player
  postId = $("#player").attr("data-post-id");
  if (postId) {
    sourceType = "blogger";
  }

  // SundayDrama special container
  if (!postId) {
    const fanta = $('div[id="fanta"][data-post-id]').first();
    if (fanta.length) {
      postId = fanta.attr("data-post-id");
      sourceType = "blogger";
    }
  }

  // Blogger feed URL in page source
  if (!postId) {
    const m = data.match(
      /blogger\.com\/feeds\/\d+\/posts\/default\/(\d+)\?alt=json/i
    );
    if (m) {
      postId = m[1];
      sourceType = "blogger";
    }
  }

  // WordPress fallbacks (VIP / iDrama)
  if (!postId) {
    const shortlink = $('link[rel="shortlink"]').attr("href") || "";
    let m = shortlink.match(/[?&]p=(\d+)/i);

    if (!m) {
      const api =
        $('link[rel="alternate"][type="application/json"]').attr("href") || "";
      m = api.match(/\/wp-json\/wp\/v2\/posts\/(\d+)/i);
    }

    if (!m) {
      const art = $("article[id^='post-']").attr("id") || "";
      m = art.match(/^post-(\d+)$/i);
    }

    if (m) {
      postId = m[1];
      sourceType = "vip-wordpress";
    }
  }

  /* =========================
     NO POST ID FOUND
  ========================= */
  if (!postId) {
    return { postId: null, info: null };
  }

  /* =========================
     METADATA EXTRACTION
  ========================= */
  const slug =
    new URL(seriesUrl).pathname.split("/").filter(Boolean).pop() || "";

  const pageTitle = $("title").text().trim();
  const maxEp = extractMaxEpFromTitle(pageTitle);

  /* =========================
     CACHE WRITE (TTL-AWARE)
  ========================= */
  setPostIdForUrl(seriesUrl, postId);

  setPostInfo(postId, {
    sourceType,
    slug,
    maxEp: maxEp || null,
    pageHtml: data
  });

  return {
    postId,
    info: getPostInfo(postId)
  };
}

module.exports = {
  resolvePost
};