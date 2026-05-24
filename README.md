# 🌌 Gemini Creative Sandbox

A refined, desktop-first workspace for smart content generation, prompt engineering, and raw Gemini model interactions powered by standard Express proxied servers and React + Vite.

Included in this workspace is a dual execution pipeline: **Gemini Cloud Link** (for live streaming content via server-sent events) and **Pragmatic Sandbox** (which facilitates offline compilation simulation when Cloud API quotas are restricted).

---

## 🚀 Key Features

* **Tuning Room:** Dynamic sidebars to control Model Parameters on-the-fly (`Temperature`, `Top P`, `Top K`, and a live custom `System Instruction` overrides box).
* **SSE Streaming Handshake:** Server-Sent Events (SSE) pipe real-time streaming tokens down into the client for instantaneous rendering.
* **Draft Workspace:** A dedicated sidebar draft board. Select responses, tweak and combine them, and quickly export styled txt archives.
* **Dual Execution Mode:**
  * **Gemini Cloud Link:** Connected to the Google Gen AI standard SDK.
  * **Pragmatic Sandbox:** A specialized offline compiler utilizing static local rules, designed to bypass 429 quota spikes gracefully.
* **Error Tolerant Gateway:** Gracefully catches, formats, and displays structured API Rate Limits with active sleep counters and optional auto-resumption checks.

---

## 🛠️ Tech Stack & Directory Structure

```
├── server.ts                 # Full-stack CJS bundled Express proxy with SSE streams
├── package.json              # Unified build triggers & package requirements
├── tsconfig.json             # System-compliant strict TypeScript config
├── vite.config.ts            # Vite asset loader & dev middle-tier configuration
└── src/
    ├── App.tsx               # Main visual dashboard & dual-pipeline state controllers
    ├── main.tsx              # Application entrypoint
    └── index.css             # Unified Tailwind CSS utility imports & visual keyframes
```

* **Frontend:** React 19, Tailwind CSS 4, Lucide Icons, Custom CSS keyframes.
* **Backend:** Node.js, Express, `@google/genai` (Vite middleware on development, statically hosted asset routers on production).
* **Compilers:** `esbuild` for CJS bundling.

---

## ⚙️ Local Setup Instructions

Follow these instructions to clone, run, and experiment with this application locally on your computer:

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) and `npm` installed.

### 2. Configure Environment Variables
Create a `.env` file in the root directory and append your private **Gemini API Key**:

```env
GEMINI_API_KEY="your_api_key_here"
```

> ⚠️ **Key Safety Warning:** Never commit your actual `.env` file or publicize your keys inside your GitHub commits. The underlying architecture uses a custom server-side proxy route (`/api/*`) to ensure keys never escape into browser networks.

### 3. Install Dependencies
Run the installation script in your terminal:
```bash
npm install
```

### 4. Direct Development Execution
Boot up both the Node.js Express server and the Vite dev server using `tsx` utility tools:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

### 5. Build and Run Production
Compile the React front-end and bundle the TypeScript server using `esbuild` and `vite build`:
```bash
# Build production bundles compiles into /dist
npm run build

# Start the compiled self-contained bundle server 
npm run start
```

---

## 💎 Design System & Aesthetic Choices

This application adheres strictly to the **Cosmic Slate Theme** — utilizing a light-contrast minimalist grid:
* **Backgrounds:** Off-white container canvases (`bg-stone-50`) paired with pristine panels (`bg-white`).
* **Interactive Elements:** Dark charcoal grey triggers (`bg-stone-900` to `hover:bg-stone-800`).
* **Status Elements:** Real-time diagnostics HUD showing UTC tracking and Live status connectivity lights.
* **Typography:** Elegant system sans headings paired with `JetBrains Mono` code components that look natural and premium.
