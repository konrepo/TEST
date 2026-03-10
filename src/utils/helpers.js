function normalizePoster(url) {
  if (!url) return "";
  return url
    .replace(/\/s\d+\//, "/s0/")
    .replace(/=s\d+/, "=s0");
}

function extractVideoLinks(text) {
  const directRegex =
    /https?:\/\/[^\s"';<> ]+\.(?:m3u8|mp4)(?:\?[^\s"';<> ]+)?/gi;

  const okRegex =
    /https?:\/\/ok\.ru\/(?:videoembed|video)\/\d+/gi;

  const playerRegex =
    /https?:\/\/phumikhmer\.vip\/player\.php\?id=\d+/gi;

  const fileRegex =
    /file\s*:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']+)?)["']/gi;

  const directMatches = text.match(directRegex) || [];
  const okMatches = (text.match(okRegex) || [])
    .map(u => u.replace("/video/", "/videoembed/"));
  const playerMatches = text.match(playerRegex) || [];

  const fileMatches = [];
  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    fileMatches.push(match[1]);
  }

  return Array.from(new Set([
    ...directMatches,
    ...okMatches,
    ...playerMatches,
    ...fileMatches
  ]));
}

function extractMaxEpFromTitle(title) {
  if (!title) return null;

  const match =
    title.match(/\bEP\.?\s*(\d+)\b/i) ||
    title.match(/\bEpisode\s*(\d+)\b/i) ||
    title.match(/\[EP\.?\s*(\d+)\]/i);

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

module.exports = {
  normalizePoster,
  extractVideoLinks,
  extractMaxEpFromTitle,
  extractOkIds
};
