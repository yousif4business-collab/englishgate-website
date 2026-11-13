# English Gate Academy — Website

Public website for **English Gate Academy**, an English academy in Baghdad for kids, teens and adults, with online courses for learners anywhere.

**Live:** [englishgate-school.com](https://englishgate-school.com)

> **About this public copy.** To protect the students' privacy, every photo and video of students has been taken out of this copy. The classroom photo wall uses the academy's 3D illustrations in their place, and each class video is replaced by a short placeholder clip. The code is otherwise the same as the production site.

This repository is the public website. The academy's staff system (CENTER) and its app for families, students and teachers (APP) were built in separate private repositories on a shared backend; what they do is described in [the platform section](#the-platform-center-and-app) below.

## The website

- **One-page bilingual site** — full Arabic and English versions with complete right-to-left mirroring in Arabic; the two languages never mix on one screen.
- **Programmes** — each programme opens its own detail view; a separate page introduces the academy's director.
- **Videos and a 3D street scene** — videos are served from the site itself, and the 3D street is drawn on the visitor's device; no third-party video embeds.
- **WhatsApp message builder** — prepares a message on the visitor's device; the site has no forms and no accounts.
- **Privacy by design** — no cookies, no analytics, no tracking scripts; one local value stores the language choice.
- **SEO and AI-search (GEO)** — structured data (JSON-LD), `hreflang`, sitemap, `robots.txt` and `llms.txt`.

## Engineering

- **Static build** with Vite, deployed to **Cloudflare Pages**, with a **Netlify mirror** whose bundle hash is checked against production after every deploy.
- **Post-deploy routing gate** (`qa/post-deploy-gate.mjs`) runs against production after each upload; a deploy is not done until it passes.
- **Independent production verifier** (`qa/verify-points.mjs`) kept separate from the build's own QA.
- **Cross-browser test matrix** — WebKit, Chromium and Firefox × mobile and desktop × English and Arabic, plus a language-purity scanner.
- **Security headers** (Content-Security-Policy and others) shipped through `public/_headers`; no secrets, no server code in the repository.
- **Daily health check** of the live site (`qa/daily-health.mjs`).

## The platform: CENTER and APP

These two parts live in private repositories.

**CENTER — staff system**
- Owner panel and registration intake for new students.
- Attendance engine: roll-call, reminder ladder, absence alerts to families and escalation.
- Telegram bot dispatcher for messages to class groups and families.
- Nightly automated backups with a tested restore drill.

**APP — families, students and teachers (phone-first PWA)**
- Separate panels for teachers, parents and students.
- Homework submission with file-type enforcement on uploads.
- Row-Level Security on every table, with isolation between students and between families verified against the live database.

**Shared stack:** Supabase (PostgreSQL, Auth, Row-Level Security, Storage), React, Vite, Playwright, Cloudflare Pages.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
```

## Deploy

```sh
npm run deploy   # build → Cloudflare Pages → post-deploy gate → Netlify mirror + hash check
```
