
# Styling Upgrade (Arabic-first, TV-show vibe)

- Added Arabic fonts (Tajawal, Cairo) via Google Fonts.
- Enabled RTL across the app and set `<html lang="ar" dir="rtl">`.
- Included Tailwind CDN to activate the utility classes already present in components (e.g., `text-2xl`, `mb-2`, `grid`).
- Introduced custom theme in `src/index.css` with neon-accent cards, soft shadows, and gradient background.
- New helper classes: `.btn-primary`, `.btn-secondary`, `.tile`, `.badge`, `.card`.

## How to run
- `npm install`
- `npm run dev`

> If Tailwind via CDN is blocked, the custom CSS still provides a cohesive theme. For best results keep an internet connection for Google Fonts + Tailwind CDN.
