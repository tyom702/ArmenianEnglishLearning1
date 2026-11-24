import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { createApiApp } from './src/server/apiApp';
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

async function startServer() {
  const app = createApiApp();
  const PORT = process.env.PORT || 3000;

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
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
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
