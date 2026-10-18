// Réglages publics du site (lecture seule) : sac, annonce, inscriptions ouvertes, inscriptions masquées.
const { readSettings } = require("../lib/store.js");

module.exports = async (req, res) => {
  try {
    const s = await readSettings();
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
