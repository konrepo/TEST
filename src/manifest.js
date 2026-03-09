module.exports = {
  id: "community.khmer.test",
  version: "1.2.0-test",
  name: "KhmerDub Test",
  description: "Stream Experimental Build | Dev: TheDevilz.",
  logo: "https://avatars.githubusercontent.com/u/32822347?v=4",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  catalogs: [
    {
      type: "series",
      id: "vip",
      name: "Phumikhmer",
      extraSupported: ["search", "skip"],
    },
    {
      type: "series",
      id: "sunday",
      name: "SundayDrama",
      extraSupported: ["search", "skip"],
    },	
    {
      type: "series",
      id: "idrama",
      name: "iDramaHD",
      extraSupported: ["search", "skip"],
    },
    {
      type: "series",
      id: "khmerave",
      name: "KhmerAve",
      extraSupported: ["search", "skip"],
    },
    {
      type: "series",
      id: "merlkon",
      name: "Merlkon",
      extraSupported: ["search", "skip"],
    },
  ],
};
