const { addonBuilder } = require("stremio-addon-sdk");
const manifest = require("./manifest");

/* =========================
   ENABLED SITES (from manifest)
========================= */
const enabledSites = new Set(
  manifest.catalogs.map(c => c.id)
);

/* =========================
   ENGINES
========================= */
const engine = require("./sites/engine");
const khmerave = require("./sites/khmerave");
const phumi2 = require("./sites/phumi2");
const cat3movie = require("./sites/cat3movie");
const khmertv = require("./sites/khmertv");

const sites = require("./sites/config");

/* =========================
   HELPERS
========================= */
const { normalizePoster, mapMetas, uniqById } = require("./utils/helpers");

/* =========================
   SITE TYPES
========================= */
const SITE_TYPES = {
  cat3movie: "movie",
  khmertv: "movie",
  default: "series"
};

/* =========================
   ENGINE ROUTING
========================= */
const ENGINES = {
  khmertv,
  vip: engine,
  sunday: engine,
  idrama: engine,
  khmerave,
  merlkon: khmerave,
  phumi2,
  cat3movie
};

function getSiteEngine(id) {
  if (!enabledSites.has(id)) return null;

  const site = sites[id];
  const siteEngine = ENGINES[id];

  if (!site || !siteEngine) return null;

  return { site, engine: siteEngine };
}

/* =========================
   ADDON BUILDER
========================= */
const builder = new addonBuilder(manifest);

/* =========================
   CATALOG
========================= */
builder.defineCatalogHandler(async ({ id, extra }) => {
  try {
    const ctx = getSiteEngine(id);
    if (!ctx) return { metas: [] };

    const { site, engine: siteEngine } = ctx;

    /* ---- KhmerTV (movie, single page) ---- */
    if (id === "khmertv") {
      const skip = Number(extra?.skip || 0);
      if (skip > 0) return { metas: [] };

      const items = await siteEngine.getCatalogItems(id, site, "");
      return { metas: mapMetas(items, "movie") };
    }

    /* ---- KhmerAve / Merlkon search ---- */
    if (extra?.search && (id === "khmerave" || id === "merlkon")) {
      const keyword = encodeURIComponent(extra.search);
      const url =
        id === "merlkon"
          ? `https://www.khmerdrama.com/?s=${keyword}`
          : `https://www.khmeravenue.com/?s=${keyword}`;

      const items = await siteEngine.getCatalogItems(id, site, url);
      const type = SITE_TYPES[id] || SITE_TYPES.default;

      return { metas: mapMetas(items, type) };
    }

    /* ---- KhmerAve / Merlkon pagination ---- */
    if (id === "khmerave" || id === "merlkon") {
      const WEBSITE_PAGE_SIZE = site.pageSize || 18;
      const PAGES_PER_BATCH = 3;

      const skip = Number(extra?.skip || 0);
      const startPage = Math.floor(skip / WEBSITE_PAGE_SIZE) + 1;
      const base = String(site.baseUrl || "").replace(/\/$/, "");

      const pages = [];
      for (let p = startPage; p < startPage + PAGES_PER_BATCH; p++) {
        const url =
          p === 1
            ? `${base}/`
            : `${base}/page/${p}/`;

        pages.push(siteEngine.getCatalogItems(id, site, url));
      }

      const results = (await Promise.all(pages)).flat();
      const uniq = uniqById(results);

      const type = SITE_TYPES[id] || SITE_TYPES.default;
      return { metas: mapMetas(uniq, type) };
    }

    /* ---- Sunday ---- */
    if (id === "sunday") {
      const base = String(site.baseUrl || "").replace(/\/$/, "");
      const WEBSITE_PAGE_SIZE = 20;
      const PAGES_PER_BATCH = 3;

      const skip = Number(extra?.skip || 0);
      const targetPage = Math.floor(skip / WEBSITE_PAGE_SIZE) + 1;

      let url = extra?.search
        ? `${base}/search?q=${encodeURIComponent(extra.search)}&max-results=20`
        : `${base}/?max-results=20`;

      let currentPage = 1;
      let allItems = [];

      while (currentPage < targetPage && url) {
        const html = await siteEngine._fetch(url);
        url = siteEngine.getNextPageUrl?.(base, html) || null;
        currentPage++;
      }

      for (let i = 0; i < PAGES_PER_BATCH && url; i++) {
        const items = await siteEngine.getCatalogItems(id, site, url);
        allItems.push(...items);

        const html = await siteEngine._fetch(url);
        url = siteEngine.getNextPageUrl?.(base, html) || null;
      }

      const uniq = uniqById(allItems);
      return { metas: mapMetas(uniq, SITE_TYPES.default) };
    }

    /* ---- Phumi2 / Cat3Movie ---- */
    if (id === "phumi2" || id === "cat3movie") {
      const base = String(site.baseUrl || "").replace(/\/$/, "");
      const WEBSITE_PAGE_SIZE = site.pageSize || (id === "cat3movie" ? 40 : 12);
      const PAGES_PER_BATCH = 3;

      const skip = Number(extra?.skip || 0);
      const targetPage = Math.floor(skip / WEBSITE_PAGE_SIZE) + 1;

      let url = extra?.search
        ? `${base}/?s=${encodeURIComponent(extra.search)}`
        : `${base}/`;

      let currentPage = 1;
      const allItems = [];

      while (currentPage < targetPage && url) {
        const html = await siteEngine._fetch(url);
        url = siteEngine.getNextPageUrl(base, html);
        currentPage++;
      }

      for (let i = 0; i < PAGES_PER_BATCH && url; i++) {
        const items = await siteEngine.getCatalogItems(id, site, url);
        allItems.push(...items);

        const html = await siteEngine._fetch(url);
        url = siteEngine.getNextPageUrl(base, html);
      }

      const uniq = uniqById(allItems);
      const type = SITE_TYPES[id] || SITE_TYPES.default;

      return { metas: mapMetas(uniq, type) };
    }

    /* ---- Default pagination ---- */
    const pageSize = site.pageSize || 30;
    const skip = Number(extra?.skip || 0);
    const page = Math.floor(skip / pageSize) + 1;

    const base = String(site.baseUrl || "").replace(/\/$/, "");
    const url = extra?.search
      ? `${base}/?s=${encodeURIComponent(extra.search)}`
      : page === 1
        ? `${base}/`
        : `${base}/page/${page}/`;

    const items = await siteEngine.getCatalogItems(id, site, url);
    const type = SITE_TYPES[id] || SITE_TYPES.default;

    return { metas: mapMetas(items, type) };

  } catch (err) {
    console.error("[catalog handler]", err);
    return { metas: [] };
  }
});

/* =========================
   META
========================= */
builder.defineMetaHandler(async ({ id }) => {
  try {
    const parts = id.split(":");
    const prefix = parts[0];
    const encodedUrl = parts.slice(1).join(":");

    if (!prefix || !encodedUrl) return { meta: null };

    const ctx = getSiteEngine(prefix);
    if (!ctx) return { meta: null };

    const { engine: siteEngine } = ctx;
    const siteType = SITE_TYPES[prefix] || SITE_TYPES.default;
    const seriesUrl = decodeURIComponent(encodedUrl);

    const episodes = await siteEngine.getEpisodes(prefix, seriesUrl);
    if (!episodes.length) return { meta: null };

    const first = episodes[0];

    if (siteType === "movie") {
      return {
        meta: {
          id,
          type: "movie",
          name: first.title,
          poster: first.thumbnail,
          background: first.thumbnail,
          description: first.title
        }
      };
    }

    return {
      meta: {
        id,
        type: siteType,
        name: first.title,
        poster: first.thumbnail,
        background: first.thumbnail,
        videos: episodes
      }
    };

  } catch {
    return { meta: null };
  }
});

/* =========================
   STREAM
========================= */
builder.defineStreamHandler(async ({ id }) => {
  try {
    const parts = id.split(":");
    const prefix = parts[0];

    const siteType = SITE_TYPES[prefix] || SITE_TYPES.default;
    const isMovie = siteType === "movie";

    const episode = isMovie ? 1 : Number(parts[parts.length - 1]);

    const encodedUrl = isMovie
      ? parts.slice(1).join(":")
      : parts.slice(1, -1).join(":");

    if (!prefix || !encodedUrl || (!isMovie && episode <= 0)) {
      return { streams: [] };
    }

    const seriesUrl = decodeURIComponent(encodedUrl);

    const ctx = getSiteEngine(prefix);
    if (!ctx) return { streams: [] };

    const { engine: siteEngine } = ctx;

    const result = await siteEngine.getStream(prefix, seriesUrl, episode);

    // New engine returns { streams: [...] }
    if (result && result.streams) {
      return result;
    }

    // Legacy engines (khmerave, phumi2)
    if (result) {
      return { streams: Array.isArray(result) ? result : [result] };
    }

    return { streams: [] };

  } catch (err) {
    console.error("[defineStreamHandler]", err);
    return { streams: [] };
  }
});

/* =========================
   EXPORT
========================= */
module.exports = builder.getInterface();
