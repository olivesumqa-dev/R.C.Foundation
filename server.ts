import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseGenAiError(error: any) {
  let message = error.message || 'Error occurred during generation';
  let code = error.code || 500;
  let status = 'UNKNOWN';
  let retryDelay: string | undefined = undefined;

  let textToParse = message;

  if (typeof textToParse === 'string') {
    textToParse = textToParse.replace(/^ApiError:\s*/i, '').trim();
    // Fallback: search for first `{` and last `}` if doesn't start with `{`
    if (!textToParse.startsWith('{')) {
      const startIdx = textToParse.indexOf('{');
      const endIdx = textToParse.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        textToParse = textToParse.substring(startIdx, endIdx + 1);
      }
    }
  }

  try {
    if (typeof textToParse === 'string' && textToParse.startsWith('{')) {
      let parsed = JSON.parse(textToParse);
      
      // Sometimes it is nested as: { error: { message: "{\n  \"error\": ... " } }
      if (parsed.error) {
        let innerObj = parsed.error;
        
        if (typeof innerObj.message === 'string' && innerObj.message.trim().startsWith('{')) {
          try {
            const nested = JSON.parse(innerObj.message);
            if (nested.error) {
              innerObj = nested.error;
            }
          } catch (e) {}
        }

        // Final deep-extracted properties
        message = innerObj.message || message;
        code = innerObj.code || code;
        status = innerObj.status || status;

        if (innerObj.details) {
          const retryInfo = innerObj.details.find((d: any) => d['@type']?.includes('RetryInfo') || d.retryDelay);
          if (retryInfo) {
            retryDelay = retryInfo.retryDelay;
          }
        }
      }
    } else {
      // Direct string-based regex checks for 429 errors when JSON cannot be parsed
      const errorStr = String(error);
      if (errorStr.includes('429') || errorStr.includes('Quota exceeded') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        code = 429;
        status = 'RESOURCE_EXHAUSTED';
        const match = errorStr.match(/Please retry in ([\d\.]+)s/i);
        if (match) {
          retryDelay = Math.ceil(parseFloat(match[1])) + 's';
        }
      }
    }
  } catch (e) {
    console.error('Error parsing GenAI error response:', e);
  }

  // Force clean status labels and codes
  if (String(message).includes('Quota exceeded') || String(message).includes('RESOURCE_EXHAUSTED') || code === 429) {
    code = 429;
    status = 'RESOURCE_EXHAUSTED';
  }

  return { message, code, status, retryDelay };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Safe lazy initializer for Gemini API client
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Health check
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'active',
      hasApiKey: !!apiKey,
      runtime: 'express-fullstack',
    });
  });

  // Client non-streaming backup endpoint
  app.post('/api/generate', async (req, res) => {
    try {
      const { prompt, systemInstruction, temperature, topP, topK } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: { message: 'Prompt is required' } });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: { message: 'GEMINI_API_KEY environment variable is not configured. Please add it via the Settings > Secrets panel.' } 
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: temperature !== undefined ? Number(temperature) : undefined,
          topP: topP !== undefined ? Number(topP) : undefined,
          topK: topK !== undefined ? Number(topK) : undefined,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Gemini generateContent error:', error);
      const errorPayload = parseGenAiError(error);
      res.status(errorPayload.code === 429 ? 429 : 500).json({ error: errorPayload });
    }
  });

  // Server-Sent Events (SSE) streaming API for beautiful instant chat replies
  app.post('/api/stream', async (req, res) => {
    try {
      const { prompt, systemInstruction, temperature, topP, topK } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: { message: 'Prompt is required' } });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: { message: 'GEMINI_API_KEY environment variable is not configured. Please add it via the Settings > Secrets panel.' } 
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: temperature !== undefined ? Number(temperature) : undefined,
          topP: topP !== undefined ? Number(topP) : undefined,
          topK: topK !== undefined ? Number(topK) : undefined,
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Gemini stream error:', error);
      const errorPayload = parseGenAiError(error);
      res.write(`data: ${JSON.stringify({ error: errorPayload })}\n\n`);
      res.end();
    }
  });

  const isProd = process.env.NODE_ENV === 'production' || process.env.PROD === 'true';

  if (isProd) {
    // Serve static files in production from dist/ directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Development mode with Vite dev server as Express middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${port} in ${isProd ? 'production' : 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Initialization failed:', err);
  process.exit(1);
});
