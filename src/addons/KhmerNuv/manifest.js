const EXTRA = ["search", "skip"];

const sites = [
  { id: "vip", name: "PhumiVip-test", type: "series", enabled: true },
  { id: "sunday", name: "SundayDrama-test", type: "series", enabled: true },
  { id: "phumi2", name: "PhumiClub-test", type: "series", enabled: true },
  { id: "khmerave", name: "KhmerAve-test", type: "series", enabled: true },
  { id: "merlkon", name: "Merlkon-test", type: "series", enabled: true },
  { id: "idrama", name: "iDramaHD-test", type: "series", enabled: true },
  { id: "cat3movie", name: "Cat3Movie", type: "movie", enabled: false } // disabled
];

const enabled = sites.filter(site => site.enabled !== false);

module.exports = {
  id: "community.khmer.nuvio",
  version: "4.1.0",
  name: "KhmerNuv",
  description: "Stream Asian dramas dubbed in Khmer (Nuvio App) | By: TheDevilz.",
  logo: "https://raw.githubusercontent.com/konrepo/TEST/refs/heads/main/test.png",

  resources: ["catalog", "meta", "stream"],
  types: ["series", "movie"],

  idPrefixes: enabled.map(s => s.id),

  catalogs: enabled.map(site => ({
    type: site.type,
    id: site.id,
    name: site.name,
    extraSupported: EXTRA
  })),

  behaviorHints: {
    configurable: false
  }
};