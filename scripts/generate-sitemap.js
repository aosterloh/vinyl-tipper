const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CATALOG_PATH = path.join(ROOT_DIR, 'data', 'catalog.json');
const SITEMAP_PATH = path.join(ROOT_DIR, 'public', 'sitemap.xml');
const BASE_URL = 'https://vinylhound.de';

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSitemap() {
  let catalog = {};
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    } catch (e) {
      console.error('Failed to parse catalog.json:', e.message);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const uniqueAlbums = new Map();

  for (const key of Object.keys(catalog)) {
    const item = catalog[key];
    if (!item || !item.title || !item.artist) continue;

    const artist = item.artist.trim();
    const title = item.title.trim();
    const normKey = `${artist.toLowerCase()} - ${title.toLowerCase()}`;

    let lastmod = today;
    if (item.updatedAt && typeof item.updatedAt === 'number') {
      try {
        lastmod = new Date(item.updatedAt).toISOString().split('T')[0];
      } catch (e) {}
    }

    if (!uniqueAlbums.has(normKey)) {
      uniqueAlbums.set(normKey, {
        artist,
        title,
        genre: item.genre || '',
        coverUrl: item.coverUrl || '',
        lastmod
      });
    } else {
      const existing = uniqueAlbums.get(normKey);
      if (!existing.coverUrl && item.coverUrl) {
        existing.coverUrl = item.coverUrl;
      }
    }
  }

  // Sort albums alphabetically by artist then title
  const sortedAlbums = Array.from(uniqueAlbums.values()).sort((a, b) => {
    const cmp = a.artist.localeCompare(b.artist);
    return cmp !== 0 ? cmp : a.title.localeCompare(b.title);
  });

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    '  <!-- Homepage & Core Turntable Appraisal Portal -->',
    '  <url>',
    `    <loc>${BASE_URL}/</loc>`,
    `    <lastmod>${today}</lastmod>`,
    '    <changefreq>daily</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>'
  ];

  let imagesCount = 0;

  for (const album of sortedAlbums) {
    const query = `${album.artist} - ${album.title}`;
    const encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
    const pageUrl = `${BASE_URL}/?album=${encodedQuery}`;

    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(pageUrl)}</loc>`);
    lines.push(`    <lastmod>${album.lastmod || today}</lastmod>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>0.8</priority>');

    if (album.coverUrl) {
      let fullImgUrl = album.coverUrl;
      if (fullImgUrl.startsWith('/')) {
        fullImgUrl = `${BASE_URL}${fullImgUrl}`;
      }

      if (fullImgUrl.startsWith('https://') || fullImgUrl.startsWith('http://')) {
        imagesCount++;
        lines.push('    <image:image>');
        lines.push(`      <image:loc>${escapeXml(fullImgUrl)}</image:loc>`);
        lines.push(`      <image:title>${escapeXml(`${album.artist} - ${album.title} Vinyl`)}</image:title>`);
        lines.push(`      <image:caption>${escapeXml(`Vinyl Hound appraisal, 180g analog dynamic range, and German street pricing for ${album.title} by ${album.artist}`)}</image:caption>`);
        lines.push('    </image:image>');
      }
    }

    lines.push('  </url>');
  }

  lines.push('</urlset>');
  lines.push('');

  const xmlContent = lines.join('\n');
  fs.writeFileSync(SITEMAP_PATH, xmlContent, 'utf8');

  console.log(`Successfully generated ${SITEMAP_PATH}:`);
  console.log(` - Total URLs: ${sortedAlbums.length + 1} (1 root + ${sortedAlbums.length} albums)`);
  console.log(` - Total Image Entries: ${imagesCount}`);

  return { totalUrls: sortedAlbums.length + 1, totalImages: imagesCount };
}

if (require.main === module) {
  generateSitemap();
}

module.exports = { generateSitemap };
