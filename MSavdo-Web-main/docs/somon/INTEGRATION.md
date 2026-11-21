# Somon XML integration update

The XML feed uses Somon's official location endpoint:

- Bokhtar (Kurgan-Tyube): city ID `513`, slug `kurgan_tyube`
- The feed sends this location as `<city>513</city>`.
- Bokhtar has no district entries in the official guide, so the feed omits `<district>`.

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
