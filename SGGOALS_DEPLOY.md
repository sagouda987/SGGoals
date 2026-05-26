# SG Goals Free Deployment

## Free Website

Use:

- GitHub: `sagouda987/SGGoals`
- Vercel free plan

Deploy steps:

1. Push this project to GitHub.
2. In Vercel, choose **Add New Project**.
3. Import `sagouda987/SGGoals`.
4. Keep the default framework as **Next.js**.
5. Deploy.

After deploy, open the Vercel URL on mobile and use **Add to Home Screen**.

## Current Data Storage

Tasks are currently stored in browser `localStorage`.

This is free and works offline-ish, but data is only on that device/browser. If you open the site on another phone or clear browser data, it will not share the same tasks.

## Free No-Loss Upgrade

For same tasks on laptop and mobile, add:

- Supabase free Postgres
- Google login
- Database-backed SG Goals tasks

That makes task edits persist across devices.
