# Nordic Art Archive

Front-end for an artworks-management web app, built for the Noroff FED1 Exam Project 1
Resit. Visitors browse and view a feed of artworks; registered owners log in to create,
edit, and delete their own works.

**Live site:** https://nordicartarchive.netlify.app/

## Tech stack

- **HTML, CSS, and vanilla JavaScript**: no framework or runtime library, and no build
  step. The deployed site is the static files in this repo, served as-is.
- Native ES modules with relative imports; modular CSS split by tokens, base, layout,
  components, and pages.
- Data from the **Noroff Artworks API**; hosted on **Netlify**.
- Dev only tooling (never shipped): ESLint, Prettier, EditorConfig, Vitest, Playwright,
  live-server.

## Getting started

Requires **Node 22+** (see `.nvmrc`). The tooling is for local development only, the
site itself needs no build.

```bash
npm install      # install dev dependencies
npm run dev      # serve locally at http://localhost:8080
```

### Scripts

| Script                 | What it does                            |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Serve the site locally with live reload |
| `npm run lint`         | Lint the JavaScript with ESLint         |
| `npm run format`       | Format the codebase with Prettier       |
| `npm run format:check` | Check formatting without writing        |
| `npm test`             | Run unit tests (Vitest)                 |
| `npm run test:e2e`     | Run end-to-end smoke tests (Playwright) |

## Structure

```
index.html     # artworks feed
artwork/       # detail, create, edit
account/       # login, register
css/           # modular styles: tokens · base · layout · components · pages
js/            # vanilla ES modules (shared helpers + per-page logic)
assets/        # images, fonts
tests/         # unit (Vitest) · e2e (Playwright)
```

Pages link only the CSS they need, in cascade order (`tokens → base → layout →
components → page`). Built mobile-first, to a WCAG 2.1 AA baseline.
