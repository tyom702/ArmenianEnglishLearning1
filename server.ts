import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createApiApp } from './src/server/apiApp';
import { buildRobotsTxt, buildSitemapXml } from './src/server/seoRoutes';
import {
  OFFICIAL_OWNER_EMAIL,
  type ServerTokenPayload,
  createSignedSessionToken,
  verifySignedSessionToken,
} from './src/utils/tokenSecurity';

dotenv.config();

export {
  OFFICIAL_OWNER_EMAIL,
  createSignedSessionToken,
  verifySignedSessionToken,
  createApiApp,
};
export type { ServerTokenPayload };

function resolvePublicOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'https';
  const host = req.get('host') || 'armenianenglishlearning1.onrender.com';
  return `${proto}://${host}`;
}

async function startServer() {
  const app = createApiApp();
  const PORT = process.env.PORT || 3000;

  // Dynamic Search Console compatible robots.txt & sitemap.xml
  app.get('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain; charset=utf-8').send(buildRobotsTxt(resolvePublicOrigin(req)));
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    res.type('application/xml; charset=utf-8').send(buildSitemapXml(resolvePublicOrigin(req)));
  });

  // Optional Google Search Console HTML file verification via GOOGLE_SITE_VERIFICATION env var
  const gscVerification = (process.env.GOOGLE_SITE_VERIFICATION || process.env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
  if (/^[a-zA-Z0-9_-]{8,128}$/.test(gscVerification)) {
    const fileToken = gscVerification.startsWith('google') ? gscVerification : `google${gscVerification}`;
    app.get(`/${fileToken}.html`, (_req: Request, res: Response) => {
      res.type('text/html; charset=utf-8').send(`google-site-verification: ${fileToken}.html`);
    });
  }

  // Ensure private SPA routes always emit X-Robots-Tag: noindex, nofollow
  app.use((req: Request, res: Response, next) => {
    if (/^\/(admin|dashboard|profile|review|leaderboard)(\/|$)/i.test(req.path)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    next();
  });

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const httpServer = app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[HayEnglish Server] Listening on http://0.0.0.0:${PORT}`);
      console.log(`[HayEnglish Auth] Super Admin & Owner: ${OFFICIAL_OWNER_EMAIL}`);
    });

    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    const distIndexHtmlPath = path.resolve(distPath, 'index.html');
    const rawHtml = fs.existsSync(distIndexHtmlPath) ? fs.readFileSync(distIndexHtmlPath, 'utf-8') : '';

    app.use(express.static(distPath, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      if (!rawHtml) {
        res.sendFile(distIndexHtmlPath);
        return;
      }

      const origin = resolvePublicOrigin(req);
      let html = rawHtml.replace(/https:\/\/armenianenglishlearning1\.onrender\.com/g, origin);
      if (/^\/(admin|dashboard|profile|review|leaderboard)(\/|$)/i.test(req.path)) {
        html = html.replace(
          'content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"',
          'content="noindex, nofollow, noarchive"'
        );
        html = html.replace(
          '<meta name="googlebot" content="index, follow" />',
          '<meta name="googlebot" content="noindex, nofollow" />'
        );
      }
      if (/^[a-zA-Z0-9_-]{8,128}$/.test(gscVerification) && !html.includes('name="google-site-verification"')) {
        html = html.replace(
          '</head>',
          `    <meta name="google-site-verification" content="${gscVerification}" />\n  </head>`
        );
      }

      res.type('text/html; charset=utf-8').send(html);
    });

    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`[HayEnglish Server] Listening on http://0.0.0.0:${PORT}`);
      console.log(`[HayEnglish Auth] Super Admin & Owner: ${OFFICIAL_OWNER_EMAIL}`);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
