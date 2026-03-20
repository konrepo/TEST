function normalizePoster(url) {
  if (!url || typeof url !== "string") return "";

  let u = url.trim();

  if (u.startsWith("//")) {
    u = "https:" + u;
  }

  u = u.replace(/^http:/, "https:");

  return u
    .replace(/\/s\d+\//, "/s0/")
    .replace(/=s\d+/, "=s0");
}

const DIRECT_REGEX =
  /https?:\/\/[^\s"';<> ]+\.(?:m3u8|mp4)(?:\?[^\s"';<> ]+)?/gi;

const OK_REGEX =
  /https?:\/\/ok\.ru\/(?:videoembed|video)\/\d+/gi;

const PLAYER_REGEX =
  /https?:\/\/phumikhmer\.vip\/player\.php\?id=\d+/gi;

const FILE_REGEX =
  /file\s*:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']+)?)["']/gi;

function extractVideoLinks(text) {
  if (!text) return [];
  const directMatches = text.match(DIRECT_REGEX) || [];  
  const okMatches = (text.match(OK_REGEX) || [])
    .map(u => u.replace("/video/", "/videoembed/"));
  const playerMatches = text.match(PLAYER_REGEX) || [];
  
  FILE_REGEX.lastIndex = 0;

  const fileMatches = [];
  let match;
  while ((match = FILE_REGEX.exec(text)) !== null) {
    fileMatches.push(match[1]);
  }

  return Array.from(new Set([
    ...directMatches,
    ...okMatches,
    ...playerMatches,
    ...fileMatches
  ])).map(u => u.trim());
}

function extractMaxEpFromTitle(title) {
  if (!title) return null;

  const match =
    title.match(/\[(\d+)\s*END\]/i) ||  
    title.match(/\[(\d+)\]/i) ||         
    title.match(/\bEP\.?\s*-?\s*(\d+)\b/i) ||
    title.match(/\bEpisode\s*-?\s*(\d+)\b/i);

  return match ? parseInt(match[1], 10) : null;
}

function extractOkIds(text) {
  if (!text) return [];

  // matches long numeric ids followed by semicolon or newline
  const idRegex = /(^|[\s;])(\d{10,})(?=\s*;|\s|$)/g;

  const ids = [];
  let m;
  while ((m = idRegex.exec(text)) !== null) {
    ids.push(m[2]);
  }

  return Array.from(new Set(ids));
}

function mapMetas(items, type = "series") {
  return items.map((item) => ({
    id: item.id,
    type,
    name: item.name,
    poster: item.poster || "",
    posterShape: "poster"
  }));
}

function uniqById(items) {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

//KhmerAve
function extractEpisodeNumber(link, text, seriesUrl) {
  const cleanLink = String(link || "").trim().replace(/\/$/, "");
  const cleanSeries = String(seriesUrl || "").trim().replace(/\/$/, "");
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  if (cleanLink === cleanSeries) return 1;

  const textMatch = cleanText.match(/episode\s*0*([0-9]+)/i);
  if (textMatch) return parseInt(textMatch[1], 10);

  const dupSuffixMatch = cleanLink.match(/-(\d+)-\d+$/i);
  if (dupSuffixMatch) return parseInt(dupSuffixMatch[1], 10);

  const eSuffixMatch = cleanLink.match(/-(\d+)e-\d+$/i);
  if (eSuffixMatch) return parseInt(eSuffixMatch[1], 10);

  const genericMatch = cleanLink.match(/-(\d+)(?:-|\/|$)/i);
  if (genericMatch) return parseInt(genericMatch[1], 10);

  return null;
}

module.exports = {
  normalizePoster,
  extractVideoLinks,
  extractMaxEpFromTitle,
  extractOkIds,
  mapMetas,
  uniqById,
  extractEpisodeNumber
};
