# Somon.tj XML guide snapshot

This directory stores the official Somon.tj XML guide used when validating the
catalog feed:

- Source: <https://somon.tj/business-xml-guide/>
- Snapshot: `business-xml-guide.html`
- Refresh: `npm run sync:somon-guide`

The feed intentionally applies the published constraints before an item is
written: configured rubric and attributes, city/district IDs, integer prices,
titles cleaned to 70 characters, and public JPG/PNG image URLs with no query or
fragment. Items that cannot satisfy those checks are left out of the feed and
are listed by the admin feed report.

The snapshot is reference material, not a replacement for Somon's final
validation. Keep the source URL and refresh date in the file header when it is
updated.
