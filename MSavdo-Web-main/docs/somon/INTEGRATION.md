# Somon XML integration update

The XML feed reads the publication location from Somon's official location IDs:

- Bokhtar (Kurgan-Tyube): `513` (default)
- Dushanbe: `511`, with district `139`
- Levakand (Sarband): `665`

Somon documentation defines WhatsApp as its own `<whatsapp>` field. The feed
populates it with the site's configured international phone number; this does not
replace the separately configured call phone.

Order and in-stock products receive fixed Russian and Tajik availability and
delivery copy. The admin description improvement button creates Russian and
Tajik sections from the existing description, product title, and known
specifications without an AI request. Unknown terms remain as supplied rather
than being guessed.

See `business-xml-guide.html` for the official snapshot and use
`npm run sync:somon-guide` to refresh it.
