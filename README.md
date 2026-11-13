# CV Supporter Frontend

Independent React/Vite chat client for the CV Supporter API.

Keep this project beside the API project (`../cv-suporter`), not inside it.

## Development

```sh
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`. For another API, copy `.env.example` to `.env.local` and set `VITE_API_URL` to its public origin.

## Docker

The API project's Compose file builds this folder using `../cv-suporter-front` and runs the frontend on port 3000. Its Nginx configuration proxies `/api` to the `api` service.

To run this image separately, build with `--build-arg VITE_API_URL=https://your-api.example.com` and publish container port 80. With the default relative API URL, connect Nginx to a Docker network containing the `api` service or use the full Compose setup.

## Vercel

Import this frontend as a separate repository. Use the repository root, Vite, `npm run build`, and output directory `dist`. Set `VITE_API_URL` to the Render API HTTPS origin. Configure the frontend origin in the API's `CORS_ORIGINS`.

## Tests

```sh
npm run build
npx playwright install chromium
npm test
```

To use an existing Chrome installation instead of downloading Chromium, set `PLAYWRIGHT_CHANNEL=chrome` before running tests. Browser tests mock the API; they do not verify real Ollama inference.
