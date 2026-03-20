const axios = require("axios");
const http = require("http");
const https = require("https");

const USER_AGENT_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const axiosRaw = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: 25,
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: 25,
  }),
  headers: {
    "User-Agent": USER_AGENT_WIN,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Connection: "keep-alive",
  },
});

function buildLogPreview(data, maxLen = 280) {
  return String(data || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function isRetryableError(err) {
  const status = err.response?.status;

  if (!status) return true;

  return [403, 408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, config = {}, retries = 2) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axiosRaw.get(url, config);

      console.log("[HTTP OK]", {
        url,
        status: res.status,
        finalUrl: res.request?.res?.responseUrl || url,
        length: String(res.data || "").length,
      });

      return res;
    } catch (err) {
      lastErr = err;

      console.error("[HTTP FAIL]", {
        url,
        attempt: attempt + 1,
        retries: retries + 1,
        message: err.message,
        status: err.response?.status || null,
        finalUrl: err.response?.request?.res?.responseUrl || url,
        preview: buildLogPreview(err.response?.data),
      });

      if (attempt >= retries || !isRetryableError(err)) {
        break;
      }

      await sleep(1200 * (attempt + 1));
    }
  }

  throw lastErr;
}

module.exports = {
  get,
  raw: axiosRaw,
};