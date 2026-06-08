import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const HOST = 'maithilcart.com';
const KEY = '83b0f5de1bca42bfa67b2d56a29e46a7';
const KEY_FILE_NAME = `${KEY}.txt`;

async function run() {
  // Only run in production builds (CI environment or production build)
  if (process.env.NODE_ENV !== 'production' && !process.env.CI && process.env.RUN_INDEXNOW !== 'true') {
    console.log('Skipping IndexNow submission: Not in production/CI environment.');
    return;
  }

  const publicDir = path.resolve(__dirname, '../public');
  const distDir = path.resolve(__dirname, '../dist');
  
  // 1. Ensure the key file exists in public/ and dist/
  const keyFilePathPublic = path.join(publicDir, KEY_FILE_NAME);
  const keyFilePathDist = path.join(distDir, KEY_FILE_NAME);

  try {
    if (!fs.existsSync(keyFilePathPublic)) {
      fs.writeFileSync(keyFilePathPublic, KEY, 'utf8');
      console.log(`Created IndexNow verification key in public/: ${KEY_FILE_NAME}`);
    }
    // Also copy to dist/ if dist/ exists and key file isn't there
    if (fs.existsSync(distDir) && !fs.existsSync(keyFilePathDist)) {
      fs.writeFileSync(keyFilePathDist, KEY, 'utf8');
      console.log(`Copied IndexNow verification key to dist/: ${KEY_FILE_NAME}`);
    }
  } catch (err) {
    console.error('Failed to write key file:', err);
  }

  // 2. Read sitemap.xml to get the URLs to submit
  // Try reading from dist/ first, fall back to public/
  let sitemapPath = path.join(distDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    sitemapPath = path.join(publicDir, 'sitemap.xml');
  }

  if (!fs.existsSync(sitemapPath)) {
    console.warn('Sitemap not found in dist/ or public/. IndexNow submission skipped.');
    return;
  }

  let sitemapContent;
  try {
    sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  } catch (err) {
    console.error('Failed to read sitemap.xml:', err);
    return;
  }

  // Extract URLs using regex matching <loc>...</loc>
  const urlRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(sitemapContent)) !== null) {
    urls.push(match[1]);
  }

  if (urls.length === 0) {
    console.log('No URLs found in sitemap.xml to submit.');
    return;
  }

  console.log(`Found ${urls.length} URLs in sitemap.xml. Submitting to IndexNow...`);

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY_FILE_NAME}`,
    urlList: urls
  };

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 200 || response.status === 202) {
      console.log(`Successfully submitted URLs to IndexNow! (Status: ${response.status})`);
    } else {
      console.error(`IndexNow submission failed with status: ${response.status}`);
      const text = await response.text();
      console.error(`Response details: ${text}`);
    }
  } catch (err) {
    console.error('Error sending IndexNow request:', err);
  }
}

run();
