# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Fonts — do not delete `public/assets/files/`

`src/index.css` imports `@fontsource-variable/geist`, and `--font-sans` resolves to
`'Geist Variable'`. Under Vite 8 the built CSS keeps the package's **relative**
`url(./files/geist-*-wght-normal.woff2)` references verbatim — Vite neither rewrites them
to hashed assets nor copies the files out of `node_modules`. Because the stylesheet is
emitted to `dist/assets/index-<hash>.css`, those URLs resolve to `/assets/files/*.woff2`,
which nothing was serving: every page 404'd on the font and silently fell back to generic
`sans-serif`.

The five `wght-normal` subsets are therefore vendored into `public/assets/files/`, which
Vite copies verbatim into `dist/` so the paths the CSS already asks for resolve. Deleting
them reintroduces the 404 with no build error and no test failure — the only symptom is
the wrong typeface. If a future Vite release starts emitting these assets properly, drop
the vendored copies and confirm with
`docker compose exec -T frontend sh -c 'ls /usr/share/nginx/html/assets/files/'`.

Verify the font actually applies (not merely that the request 200s):

```js
await document.fonts.ready;
document.fonts.check('16px "Geist Variable"'); // must be true
```

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
