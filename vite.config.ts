import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleDoctorVerification } from './server/nmc/controller';

function devApiMiddleware(): Plugin {
  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split('?')[0];

        if ((urlPath === '/api/nmc/verify' || urlPath === '/api/nmc/verify/') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              if (!body || !body.trim()) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ verified: false, status: 'rejected', source: 'NMC', message: 'Missing request body' }));
                return;
              }
              const query = JSON.parse(body);
              const result = await handleDoctorVerification(query);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(result));
            } catch {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  verified: false,
                  status: 'unavailable',
                  source: 'NMC',
                  message: "Verification isn't available right now. Please try again later.",
                })
              );
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), devApiMiddleware()],
    server: {
      port: 3000,
      open: false,
    },
  };
});
