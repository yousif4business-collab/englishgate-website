# RUNBOOK — englishgate-school.com

For 2am incidents. Every step is copy-pasteable. Primary host: **Cloudflare
Pages** (project `englishgate-site`). Mirror: **Netlify** (`englishgate-mirror`,
noindexed, same build). Deploy both with `npm run deploy:all`.

---

## 1 · "Is it actually down?" — 3-minute triage

Run these in order; stop at the first one that fails.

```sh
# a) Is the SITE down, or just your network? (use your phone on mobile data too)
curl -sI https://englishgate-school.com/ | head -3        # want: HTTP/2 200

# b) Is the Pages deployment itself alive? (bypasses your DNS + custom domain)
curl -sI https://englishgate-site.pages.dev/ | head -3    # want: HTTP/2 200

# c) Does DNS still resolve to Cloudflare?
dig +short englishgate-school.com                          # want: 2 Cloudflare IPs
```

| a | b | c | Meaning | Do |
|---|---|---|---|---|
| ✅ | – | – | Not down. Caller's network/browser issue. | Nothing. |
| ❌ | ✅ | ✅ | Custom-domain or Cloudflare edge issue | Check https://status.cloudflare.com → §3 failover if red |
| ❌ | ❌ | – | Bad deployment (both URLs broken) | §2 rollback |
| ❌ | ✅ | ❌ | DNS broken (registrar/zone) | Cloudflare dashboard → DNS; §3 if unfixable |

Also check: https://status.cloudflare.com (Pages + CDN components) and
https://www.netlifystatus.com (before failing over TO Netlify).

---

## 2 · ROLLBACK a bad Pages deployment

**Dashboard (easiest):** Cloudflare dashboard → Workers & Pages →
`englishgate-site` → **Deployments** tab → find the previous good production
deployment → **⋯ menu → Rollback to this deployment**. Takes effect in
seconds. Done.

**CLI (if the dashboard is unreachable):** re-deploy the last good commit:

```sh
cd ~/Developer/englishgate-site
git log --oneline -5                  # find the last good commit
git checkout <GOOD_SHA>
npm ci && npm run build
npx wrangler pages deploy dist --project-name=englishgate-site --branch=main
git checkout main                     # ALWAYS come back to main afterwards
```

Verify: `curl -sI https://englishgate-school.com/ | head -3` → 200, and load
the homepage in a private window.

---

## 3 · MANUAL FAILOVER to the Netlify mirror

Use when Cloudflare Pages is down but you can still edit Cloudflare DNS.
(If ALL of Cloudflare is down including DNS, you must wait — the domain's
nameservers are Cloudflare's.)

> ### ⚠️ CHECK THE MIRROR IS CURRENT BEFORE YOU FAIL OVER TO IT
>
> ```sh
> npm run mirror:check     # must say "mirror serves the SAME bundle as production"
> ```
>
> Failing over to a STALE mirror is worse than the outage: the site comes
> back, everyone believes it recovered, and it quietly serves old content —
> old prices, old dates, a program that has since changed.
>
> **KNOWN BLOCKED as of 2026-08-13.** Netlify is refusing every new deploy on
> this account:
> `403 {"error":"Account credit usage exceeded - new deploys are blocked until credits are added"}`
> The credentials are FINE (token authenticates, it is Owner of the account
> that owns the site) — this is billing, and only the account owner can clear
> it by adding credits / a payment method at
> https://app.netlify.com/teams/yousifabdulkareem4business/billing.
>
> Until that is cleared the mirror is frozen on its 2026-08-02 build and is
> **NOT a valid failover target.** If Pages is down before then, prefer
> waiting for Pages over serving stale content — or clear the billing block
> first, run `npm run deploy:mirror`, and only then fail over.

1. Cloudflare dashboard → `englishgate-school.com` zone → **DNS → Records**.
2. Find the record for the apex: type is a Pages `CNAME` →
   `englishgate-site.pages.dev` (shown flattened at the apex).
3. **Edit** it: change the target to the Netlify site domain
   `englishgate-mirror.netlify.app` — keep it **Proxied (orange cloud)**.
4. Save. Repeat for the `www` record if one exists.
5. Netlify side (one-time, already done if you followed setup): the custom
   domain `englishgate-school.com` must be added under Site settings →
   Domain management, so Netlify serves it (its cert is automatic).

**Propagation:** with the orange cloud ON, the edge picks it up in
**1–5 minutes** (Cloudflare TTL is Auto/300s). Verify:
`curl -sI https://englishgate-school.com/ | grep -i x-robots-tag` — seeing
`noindex, nofollow` proves the mirror is serving (that header only exists on
Netlify).

**REVERT (once Pages is healthy):** same DNS record → change target back to
`englishgate-site.pages.dev`, keep Proxied. Verify the x-robots-tag header is
GONE from the apex within ~5 minutes:
`curl -sI https://englishgate-school.com/ | grep -ci x-robots-tag` → `0`.

⚠️ Never leave the mirror serving the apex longer than the outage — it sends
noindex, which is correct armor for the mirror URL but must not sit on the
real domain for days.

---

## 4 · MONITORING — UptimeRobot (free, 5-min checks)

One-time setup (~5 minutes):

1. Create a free account at https://uptimerobot.com (free tier: 50 monitors,
   5-minute interval).
2. **Add New Monitor**:
   - Monitor Type: **Keyword**
   - Friendly Name: `EnglishGate — apex`
   - URL: `https://englishgate-school.com/`
   - Keyword: `English Gate` (exists in the shell HTML `<title>` — present
     even before React renders, so no false alarms)
   - Keyword Type: **exists** → alert when it does NOT exist
   - Monitoring Interval: **5 minutes**
   - Alert Contacts: your email (confirm the address when it sends the
     verification mail)
3. Add a second monitor, same settings, for
   `https://englishgate-site.pages.dev/` (`EnglishGate — pages.dev`) — when
   the apex alarm fires, this one tells you instantly whether it's the
   deployment or the domain layer.
4. Optional third: `https://englishgate-mirror.netlify.app/` so you know the
   lifeboat is dry before you need it.

When an alert fires → run §1 triage.

---

## 5 · Deploy commands (reference)

```sh
npm run deploy:all      # build once → Cloudflare Pages prod + Netlify mirror
# individually:
npm run build && npx wrangler pages deploy dist --project-name=englishgate-site --branch=main
npm run build && npx netlify-cli deploy --prod --dir=dist
```

Netlify auth is a Personal Access Token in local env vars (never committed,
never OAuth): `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` — see the one-time
setup notes in netlify.toml / the S8 batch summary.
