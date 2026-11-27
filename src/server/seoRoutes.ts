export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /profile',
    'Disallow: /review',
    'Disallow: /leaderboard',
    '',
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildSitemapXml(origin: string): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${cleanOrigin}/</loc>`,
    '    <lastmod>2026-11-27</lastmod>',
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}
