This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# Frontend API configuration

Browser requests use `src/lib/apiClient.ts`. Set one of the following public
environment variables to the FastAPI origin (without a trailing slash):

```text
NEXT_PUBLIC_API_URL=http://localhost:8000
# NEXT_PUBLIC_BACKEND_URL is accepted as an alias.
```

The client assumes these FastAPI routes: `/api/auth/login`, `/api/auth/register`,
`/api/auth/me`, `/api/auth/logout`, `/api/chat`, `/api/chat/stop`,
`/api/chat/conversations` (and `/{id}`), `/api/standards/search`,
`/api/laboratories/search`, `/api/updates`, and `/api/auth/callback/google`.
Login/register responses should include
an access token as `access_token`, `accessToken`, or `token`; it is stored in
browser local storage and sent as `Authorization: Bearer ...`. Cookie-based
sessions are also supported through `credentials: "include"`, so FastAPI must
allow the deployed frontend origin, credentials, and the `Authorization` and
`Content-Type` headers in CORS. If no public backend URL is set, development
defaults to `http://localhost:8000`. There is no fallback to Next.js API routes;
start FastAPI or configure the public backend URL before using the application.

Google OAuth is handled by the FastAPI callback. Configure `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, and the exact same redirect URI in the
backend and frontend environments. For local development use:

```text
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback/google
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback/google
```

Add that exact URI in Google Cloud Console → APIs & Services → Credentials →
OAuth 2.0 Client → Authorized redirect URIs. Do not add a trailing slash and do
not register the old Next.js URI (`http://localhost:3000/api/auth/callback/google`).
For production, replace `localhost` with the public FastAPI HTTPS origin. The
Google client ID used by the frontend and backend must be the same. The
scraper trigger modules under `src/lib/scraper` are server-side/unused and
were not migrated.

Start the backend before opening Google sign-in:

```bash
cd bis_backend-main
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Wait until the terminal shows `Application startup complete`, then open the
frontend at `http://localhost:3000`. Verify the backend first at
`http://localhost:8000/`. The Google Console URI
`https://api.example.com/api/auth/callback/google` is only a placeholder and
must be removed unless that is the real deployed FastAPI domain.
