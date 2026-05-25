# RC Footing Calculator

Standalone Vite + React deployment package for the isolated reinforced concrete footing calculator.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The Vercel defaults work with this project:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

## Notes

- The calculator runs entirely in the browser.
- Save/load uses browser local storage, so no database or backend API is required for this standalone deployment.
- Engineering formulas are in `src/lib/calc-engine/rc-footing.ts`.
- The React interface is in `src/components/rc-footing-calculator.tsx`.
