# MLC Webinar — Colors

Static landing page for the MLC webinar on 6 October 2026.

## Deployment

GitHub `main` is connected to Vercel for automatic production deployments. The custom domain is `webinar.mlcpresentations.com`.

## Registration setup

The page assets, calendar files, and `/api/webinar-handler` are included in this repository. The calendar files contain public Microsoft Teams meeting links.

Set `AC_API_URL` and `AC_API_KEY` as Vercel environment variables before accepting registrations. `AC_LIST_NAME` defaults to `WEBINARS`; `ALLOWED_ORIGIN` should be `https://webinar.mlcpresentations.com`. `SETUP_TOKEN` is only needed for the optional setup route. Never commit these values to Git.
