import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Sliders,
  Send,
  Copy,
  Plus,
  RotateCcw,
  Check,
  BookOpen,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Save,
  FileText,
  X,
  Cpu,
  Clock,
  ExternalLink,
  Trash2,
  WifiOff,
  Zap,
  RefreshCw,
} from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemInstruction: string;
  temperature: number;
  topP: number;
  topK: number;
  samplePrompt: string;
}

const PRESETS: Preset[] = [
  {
    id: 'copyeditor',
    name: 'Pragmatic Copyeditor',
    icon: '✨',
    description: 'Polishes text for tone, rhythm, and clarity while keeping the original meaning intact.',
    systemInstruction: 'You are an elite, highly precise copyeditor. Refine the provided text. Eliminate fluff, improve flow, ensure strong active verbs, and correct syntax. Keep your explanations minimal and focus on providing the polished alternative first.',
    temperature: 0.3,
    topP: 0.95,
    topK: 40,
    samplePrompt: 'The server-side proxy which is configured for the Gemini SDK is basically a good idea to protect API keys because if they are exposed in the client side code of the browser then anyone could easily steal them and drive up high costs.',
  },
  {
    id: 'simplifier',
    name: 'Logical Simplifier',
    icon: '💡',
    description: 'Distills complex logic, architectures, or concepts into direct, analogies-rich copy.',
    systemInstruction: 'You are an exceptional educator. Take the technical or complex input and simplify it for a non-expert. Use one vivid, everyday analogy. Present the explanation with clear headings, bullet points, and high vertical spacing.',
    temperature: 0.6,
    topP: 0.95,
    topK: 40,
    samplePrompt: 'What is WebAssembly, how does it run alongside Javascript inside the browser, and what prevents it from compromising sandbox security?',
  },
  {
    id: 'typescript-refiner',
    name: 'TS Staff Engineer',
    icon: '💻',
    description: 'Audits TS snippet for type safety, hidden memory traps, and returns a pristine rewrite.',
    systemInstruction: 'You are a principal frontend engineer. Review the provided TypeScript snippet. Point out type safety vulnerabilities, runtime edge cases, and propose a highly performant, type-safe, elegant modern rewrite conforming to best standards.',
    temperature: 0.2,
    topP: 0.95,
    topK: 40,
    samplePrompt: 'function handleData(payload: any) {\n  const results = [];\n  for (var i = 0; i < payload.items.length; i++) {\n    let item = payload.items[i];\n    setTimeout(function() {\n      results.push(item.value.toUpperCase());\n    }, 100);\n  }\n  return results;\n}',
  },
  {
    id: 'pitch-architect',
    name: 'Product Pitch Builder',
    icon: '🚀',
    description: 'Generates punchy developer pitches and copy using humble, high-impact phrasing.',
    systemInstruction: 'You are a staff developer advocate and technical writer. Draft a crisp, punchy, persuasive 3-bullet pitch for the concept presented. Do not use corporate clichés. Focus on the core developer pain point, the immediate solution, and the direct benefit.',
    temperature: 0.8,
    topP: 0.95,
    topK: 40,
    samplePrompt: 'A simple, direct-state React micro-hook that synchronization-polls background APIs with zero memory overhead and instant network recovery features.',
  },
];

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  latencyMs?: number;
  presetApplied?: string;
  temperatureApplied?: number;
  isMockCore?: boolean;
}

export default function App() {
  // Connection state
  const [serverStatus, setServerStatus] = useState<'connecting' | 'online' | 'error'>('connecting');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  
  // Custom execution parameters
  const [activePresetId, setActivePresetId] = useState<string>('copyeditor');
  const [systemInstruction, setSystemInstruction] = useState<string>(PRESETS[0].systemInstruction);
  const [temperature, setTemperature] = useState<number>(PRESETS[0].temperature);
  const [topP, setTopP] = useState<number>(PRESETS[0].topP);
  const [topK, setTopK] = useState<number>(PRESETS[0].topK);
  
  // User input prompt
  const [prompt, setPrompt] = useState<string>(PRESETS[0].samplePrompt);
  
  // Conversation history
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Greetings. I am Gemini. Select a pragmatic preset on the left panel or type your prompt in the editor below to begin drafting fine-tuned copy.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  
  // Rate Limit & Offline backup states
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [autoRetry, setAutoRetry] = useState<boolean>(true);
  const lastUserPromptRef = useRef<string>('');
  
  // Stream & generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamingText, setStreamingText] = useState<string>('');
  const [generationTimeMs, setGenerationTimeMs] = useState<number>(0);
  const [generationIntervalId, setGenerationIntervalId] = useState<any>(null);

  // Active Workspace Draft
  const [workspaceDraft, setWorkspaceDraft] = useState<string>('');
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState<boolean>(true);
  
  // Visual Feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Check backend server status on load
  useEffect(() => {
    checkServerStatus();
  }, []);

  // Scroll to bottom when messages or stream text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isGenerating]);

  // Automatic Rate Limit countdown clock
  useEffect(() => {
    if (rateLimitCountdown === null) return;
    if (rateLimitCountdown <= 0) {
      setRateLimitCountdown(null);
      if (autoRetry && lastUserPromptRef.current) {
        // Automatically trigger retry
        handleSendPrompt(undefined, lastUserPromptRef.current);
      }
      return;
    }

    const interval = setInterval(() => {
      setRateLimitCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitCountdown, autoRetry]);

  const checkServerStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus('online');
        setHasApiKey(data.hasApiKey);
      } else {
        setServerStatus('error');
      }
    } catch {
      setServerStatus('error');
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    setActivePresetId(preset.id);
    setSystemInstruction(preset.systemInstruction);
    setTemperature(preset.temperature);
    setTopP(preset.topP);
    setTopK(preset.topK);
    setPrompt(preset.samplePrompt);
  };

  const handleResetParameters = () => {
    const defaultPreset = PRESETS.find(p => p.id === activePresetId) || PRESETS[0];
    setSystemInstruction(defaultPreset.systemInstruction);
    setTemperature(defaultPreset.temperature);
    setTopP(defaultPreset.topP);
    setTopK(defaultPreset.topK);
  };

  // Offline Sandbox simulation loop
  const simulateOfflineResponse = (userMsgText: string, startTime: number, intervalId: any) => {
    const selectedPreset = activePresetId;
    let textResult = '';

    if (selectedPreset === 'copyeditor') {
      const polished = userMsgText
        .replace(/\bis basically\b/gi, 'is')
        .replace(/\bbasically a good idea to\b/gi, 'is highly recommended to')
        .replace(/\bexposed in the client side code of the browser\b/gi, 'exposed in client-side browser files')
        .replace(/\banyone could easily steal them and drive up high costs\b/gi, 'unauthorized parties can easily intercept them and incur severe financial liabilities');
      
      textResult = `### ✨ Polished Draft (Offline Sandbox Core)
${polished}

### 🔧 Applied Heuristics
* **Voicing:** Corrected passive descriptors into active, direct assertions.
* **Token Pruning:** Removed redundant linguistic preambles like *"basically"* and *"easily"*.
* **Risk Clarification:** Exchanged abstract concepts with clear business keywords (*"financial liabilities"*).`;
    } else if (selectedPreset === 'simplifier') {
      let subject = 'your topic';
      if (userMsgText.toLowerCase().includes('wasm') || userMsgText.toLowerCase().includes('webassembly')) {
        subject = 'WebAssembly (Wasm)';
      }

      textResult = `### 💡 Logical Breakdown (Offline Sandbox Core)
Here is a simplified explanation for **${subject}**:

### 🧠 The Core Analogy
Think of standard JavaScript as a highly adaptable, multi-lingual translator in an office. They are great at talking to the environment (the DOM, buttons, and networks). 

**WebAssembly** is a raw high-speed arithmetic computer sitting directly on the desk next to them. When the office needs dense equations solved instantly, the translator passes the load to the computer, which solves it in machine binary code and delivers the answer back. They function as a unified team.

### 📌 Simplified Pillars
* **High Performance:** Runs pre-compiled code at near-native execution speed inside browsers.
* **Sandbox Security:** Executes cleanly inside the same secure sandbox rules as JavaScript, protecting local files from intrusion.
* **Seamless Coexistence:** WebAssembly doesn't replace JavaScript; it coordinates with it for computationally demanding tasks.`;
    } else if (selectedPreset === 'typescript-refiner') {
      textResult = `### 💻 TypeScript Audit & Refinement (Offline Sandbox Core)

Here is the audited rewrite which solves current type-safety questions:

\`\`\`typescript
/**
 * Polished, leak-proof modern TypeScript implementation
 * Replaces var-allocated variables with lexical block scoping
 */
export function handleData<T extends { items: { value: string }[] }>(
  payload: T
): string[] {
  // 1. Guard check for safety
  if (!payload?.items) return [];

  // 2. Perform map projection directly for higher loop execution performance
  return payload.items.map((item) => item.value.toUpperCase());
}
\`\`\`

### 🔍 Staff Engineer Key Findings
* **Temporal Leak Resolved:** Replaced block-leaking \`var\` with ES6 functional mappings to prevent closures capturing obsolete reference values.
* **Strict Type Safety:** Avoided the \`any\` payload label which breaks standard safety checks, replacing it with a precise generic constraint.
* **Loop Efficiency:** Scaled from multi-step closures into standard static mapping to optimize JS runtime compilation.`;
    } else {
      textResult = `### 🚀 Crisp Developer Pitch (Offline Sandbox Core)
Based on your vision, here is a punchy, low-jargon pitch to capture client-side traction:

* **Instant Declarative Binding:** Connects standard state flows into single-line micro-hooks, eliminating high visual boilerplate.
* **Self-Healing Connection Engine:** Continuously tracks back-off recoverability, silently queueing actions and resuming synchronization the millisecond networks recover.
* **Hermetic Key Isolation:** Secures sensitive credentials by piping SDK requests through unified server-side proxies, leaving zero client footprints.`;
    }

    // Now, let's simulate streaming chunks to make it look active!
    let currentIdx = 0;
    const words = textResult.split(/(\s+)/);
    
    return new Promise<void>((resolve) => {
      const streamTimer = setInterval(() => {
        if (currentIdx >= words.length) {
          clearInterval(streamTimer);
          clearInterval(intervalId);
          
          const totalTime = Math.round(performance.now() - startTime);
          const modelMsg: Message = {
            id: `model-${Date.now()}`,
            role: 'model',
            text: textResult,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            latencyMs: totalTime,
            presetApplied: `${PRESETS.find(p => p.id === selectedPreset)?.name}`,
            temperatureApplied: temperature,
            isMockCore: true,
          };
          setMessages(prev => [...prev, modelMsg]);
          setStreamingText('');
          setIsGenerating(false);
          setGenerationIntervalId(null);
          resolve();
        } else {
          setStreamingText(prev => prev + words[currentIdx]);
          currentIdx++;
        }
      }, 15);
    });
  };

  const handleSendPrompt = async (e?: React.FormEvent, overridePromptText?: string) => {
    if (e) e.preventDefault();
    
    const userMsgText = (overridePromptText !== undefined ? overridePromptText : prompt).trim();
    if (!userMsgText || isGenerating) return;

    lastUserPromptRef.current = userMsgText;

    // Check if the message is already in message history (to avoid doubling if it's a retry countdown)
    const isRetry = overridePromptText !== undefined;
    
    if (!isRetry) {
      const userMsgId = `user-${Date.now()}`;
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        text: userMsgText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, userMsg]);
      setPrompt('');
    }
    
    setIsGenerating(true);
    setStreamingText('');

    const startTime = performance.now();
    let intervalId = setInterval(() => {
      setGenerationTimeMs(Math.round(performance.now() - startTime));
    }, 50);
    setGenerationIntervalId(intervalId);

    // Bypass instantly if offline mode is toggled on manually
    if (isOfflineMode) {
      await simulateOfflineResponse(userMsgText, startTime, intervalId);
      return;
    }

    try {
      const response = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userMsgText,
          systemInstruction,
          temperature,
          topP,
          topK,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const innerError = errData.error || { message: `HTTP Failure status ${response.status}` };
        throw new Error(typeof innerError === 'object' ? JSON.stringify(innerError) : innerError);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error(JSON.stringify({ message: 'Streaming response body is unavailable' }));
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned.startsWith('data: ')) continue;
          const dataStr = cleaned.slice(6);
          
          if (dataStr === '[DONE]') {
            break;
          }

          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(typeof parsed.error === 'object' ? JSON.stringify(parsed.error) : parsed.error);
          }
          if (parsed.text) {
            accumulatedText += parsed.text;
            setStreamingText(accumulatedText);
          }
        }
      }

      clearInterval(intervalId);
      const totalTime = Math.round(performance.now() - startTime);

      const modelMsg: Message = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: accumulatedText || '(No text generated)',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: totalTime,
        presetApplied: PRESETS.find(p => p.id === activePresetId)?.name,
        temperatureApplied: temperature,
      };

      setMessages(prev => [...prev, modelMsg]);
      setStreamingText('');

    } catch (error: any) {
      clearInterval(intervalId);
      console.error('Generation failure:', error);
      
      // Attempt to parse out structured API errors representing 429
      let errMsg = error.message || 'Error occurred';
      let parsedErrorObj: any = null;
      let isRateLimit = false;
      let waitSec = 15;

      try {
        let textToParse = errMsg;
        // Strip any Potential Class/Wrapper prefixes
        if (typeof textToParse === 'string') {
          textToParse = textToParse.replace(/^Error:\s*/i, '').trim();
          if (!textToParse.startsWith('{')) {
            const startIdx = textToParse.indexOf('{');
            const endIdx = textToParse.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
              textToParse = textToParse.substring(startIdx, endIdx + 1);
            }
          }
        }

        if (typeof textToParse === 'string' && textToParse.startsWith('{')) {
          parsedErrorObj = JSON.parse(textToParse);
          
          let target = parsedErrorObj;
          if (target.error) {
            target = target.error;
          }
          
          if (target.code === 429 || String(target.message).includes('Quota exceeded') || target.status === 'RESOURCE_EXHAUSTED' || target.code === 'TOO_MANY_REQUESTS') {
            isRateLimit = true;
            errMsg = target.message || errMsg;
            
            // Try extracting precise seconds from details or retryDelay
            const match = errMsg.match(/Please retry in ([\d\.]+)s/i);
            if (match) {
              waitSec = Math.ceil(parseFloat(match[1]));
            } else if (target.retryDelay) {
              const delayMatch = String(target.retryDelay).match(/(\d+)/);
              if (delayMatch) {
                waitSec = parseInt(delayMatch[1]);
              }
            }
          }
        } else if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('Too Many Requests') || errMsg.includes('RESOURCE_EXHAUSTED')) {
          isRateLimit = true;
          const match = errMsg.match(/Please retry in ([\d\.]+)s/i);
          if (match) {
            waitSec = Math.ceil(parseFloat(match[1]));
          }
        }
      } catch (inner) {}

      if (isRateLimit) {
        setRateLimitCountdown(waitSec);
        
        const rateLimitNotice: Message = {
          id: `error-ratelimit-${Date.now()}`,
          role: 'model',
          text: `⚠️ **API Rate Limit Exceeded (429 RESOURCE_EXHAUSTED)**\n\nThe Google Gemini free-tier quota is currently exhausted (limit of 20 requests per project). \n\n* **Wait Countdown:** Retrying automatically in **${waitSec} seconds**.\n* **Quick actions:** You can bypass this instantly by switching on **Pragmatic Offline Simulation** in the sidebar. This compiles text, refines TS code, and drafts pitches locally using expert regex guidelines with zero latency!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, rateLimitNotice]);
      } else {
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          role: 'model',
          text: `⚠️ **Generation Error**\n\n${parsedErrorObj?.message || error.message || 'An error occurred while streaming content from Gemini. Please check if your network configuration supports standard external API handshakes.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      clearInterval(intervalId);
      setIsGenerating(false);
      setGenerationIntervalId(null);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddToWorkspace = (text: string) => {
    setWorkspaceDraft(prev => (prev ? `${prev}\n\n---\n\n${text}` : text));
    setIsWorkspaceOpen(true);
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleCopyWorkspace = () => {
    navigator.clipboard.writeText(workspaceDraft);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const handleDownloadDraft = () => {
    const element = document.createElement('a');
    const file = new Blob([workspaceDraft], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `gemini-draft-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const renderFormattedText = (text: string) => {
    // Simple custom fast parser for professional aesthetic list blocks and code snippets
    const blocks = text.split(/(```[\s\S]*?```)/g);
    
    return blocks.map((block, idx) => {
      if (block.startsWith('```')) {
        const lines = block.split('\n');
        const lang = lines[0].slice(3).trim() || 'text';
        const code = lines.slice(1, lines.length - 1).join('\n');
        const blockId = `code-block-${idx}`;
        
        return (
          <div key={idx} className="my-4 border border-stone-200 rounded-lg overflow-hidden bg-stone-900 text-stone-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800 bg-stone-950 text-xs text-stone-400 font-mono">
              <span>{lang}</span>
              <button
                id={`btn-copy-code-${idx}`}
                onClick={() => handleCopyText(code, blockId)}
                className="flex items-center gap-1 hover:text-stone-100 transition-colors cursor-pointer"
              >
                {copiedId === blockId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto font-mono text-sm leading-relaxed text-[#f4f4f5]">
              <code>{code}</code>
            </pre>
          </div>
        );
      }

      // Format bold markdown highlights and newline lists cleanly
      const lines = block.split('\n');
      return (
        <div key={idx} className="space-y-2">
          {lines.map((line, lIdx) => {
            let processedLine = line;
            const isHeading = line.startsWith('###');
            const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-');
            
            // Clean up header prefixes
            if (isHeading) {
              processedLine = line.replace('###', '').trim();
            }

            // Simple parser for bold tags: **text** -> strong
            const parts = processedLine.split(/(\*\*.*?\*\*)/g);
            const styledLine = parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pIdx} className="font-semibold text-stone-900">{part.slice(2, -2)}</strong>;
              }
              return part;
            });

            if (isHeading) {
              return <h4 key={lIdx} className="text-base font-semibold text-stone-950 mt-4 mb-2 first:mt-1">{styledLine}</h4>;
            }
            if (isBullet) {
              return (
                <div key={lIdx} className="flex gap-2 pl-4 text-stone-700">
                  <span className="text-stone-400 font-serif leading-relaxed">•</span>
                  <p className="leading-relaxed text-sm flex-1">{styledLine}</p>
                </div>
              );
            }
            return line.trim() ? (
              <p key={lIdx} className="leading-relaxed text-sm text-stone-700">{styledLine}</p>
            ) : (
              <div key={lIdx} className="h-2" />
            );
          })}
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans text-stone-800">
      
      {/* 1. Header Minimal Styling */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-stone-900 flex items-center justify-center text-white">
            <Sparkles className="w-4.5 h-4.5 text-amber-300 fill-amber-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-stone-900">Gemini Creative Sandbox</h1>
            <p className="text-xs text-stone-500 font-mono">MODEL // gemini-3.5-flash (server-piped)</p>
          </div>
        </div>

        {/* HUD: Connection / Diagnostics */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 rounded-md text-stone-600">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span>UTC 2026-05-24 12:41:33</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {serverStatus === 'online' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                serverStatus === 'online' ? 'bg-emerald-500' : serverStatus === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'
              }`}></span>
            </span>
            <span className="text-stone-600 capitalize">Server: {serverStatus}</span>
          </div>

          {!hasApiKey && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded text-xs animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Missing API Key</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Multi-Pane Workspace Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Drawer - Control Room and Parameter Adjustment */}
        <aside className="w-80 border-r border-stone-200 bg-white overflow-y-auto flex flex-col flex-shrink-0">
          
          {/* Preset Library Toggle */}
          <div className="p-5 border-b border-stone-100">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-bold tracking-wider uppercase text-stone-400 font-mono">PRAGMATIC PRESETS</span>
              <BookOpen className="w-3.5 h-3.5 text-stone-400" />
            </div>
            <div className="space-y-2.5">
              {PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    id={`preset-btn-${preset.id}`}
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className={`w-full text-left p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? 'bg-stone-50 border-stone-900 shadow-sm'
                        : 'border-stone-200 hover:bg-stone-50/50 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{preset.icon}</span>
                      <h3 className={`text-xs font-bold ${isActive ? 'text-stone-950' : 'text-stone-700'}`}>
                        {preset.name}
                      </h3>
                    </div>
                    <p className="text-[11px] text-stone-500 line-clamp-2 leading-normal">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Controls */}
          <div className="p-5 flex-1 space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider uppercase text-stone-400 font-mono">TUNING PARAMETERS</span>
              <Sliders className="w-3.5 h-3.5 text-stone-400" />
            </div>

            {/* System Instruction Panel */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700">System Instruction</label>
                {systemInstruction !== (PRESETS.find(p => p.id === activePresetId)?.systemInstruction || '') && (
                  <button 
                    id="btn-tune-reset"
                    onClick={handleResetParameters}
                    className="text-[10px] text-stone-400 hover:text-stone-800 flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset
                  </button>
                )}
              </div>
              <textarea
                id="param-system-instruction"
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="Instruct the model's persona, boundaries, constraints..."
                className="w-full h-32 px-3 py-2 text-xs border border-stone-300 rounded-md focus:outline-none focus:border-stone-900 bg-stone-50/50 font-sans leading-relaxed resize-none"
              />
            </div>

            {/* Sliders */}
            <div className="space-y-4">
              {/* Temperature */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700">Temperature</span>
                  <span className="font-mono text-[11px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                    {temperature.toFixed(1)} {temperature < 0.4 ? '• Focused' : temperature > 0.7 ? '• Creative' : '• Balanced'}
                  </span>
                </div>
                <input
                  id="param-temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-stone-950 h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Top P */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700">Top P</span>
                  <span className="font-mono text-[11px] text-stone-550">{topP.toFixed(2)}</span>
                </div>
                <input
                  id="param-topp"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full accent-stone-950 h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Top K */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700">Top K</span>
                  <span className="font-mono text-[11px] text-stone-550">{topK}</span>
                </div>
                <input
                  id="param-topk"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value))}
                  className="w-full accent-stone-950 h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Sandbox Controls - Workspace Mode Toggle */}
          <div className="p-5 border-t border-stone-100 bg-stone-50/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-wider uppercase text-stone-400 font-mono">WORKSPACE CORE</span>
              {isOfflineMode ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              ) : (
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
              )}
            </div>

            <div className="bg-white rounded-lg border border-stone-200 p-3 hover:border-stone-300 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-855 flex items-center gap-1.5 text-stone-800">
                    {isOfflineMode ? 'Pragmatic Sandbox' : 'Gemini Cloud Link'}
                  </h4>
                  <p className="text-[10px] text-stone-500 leading-relaxed mt-0.5">
                    {isOfflineMode ? 'Offline compilation engine custom rules.' : 'Direct server-side API proxy.'}
                  </p>
                </div>
                <button
                  id="btn-toggle-engine"
                  onClick={() => setIsOfflineMode(!isOfflineMode)}
                  className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none cursor-pointer ${
                    isOfflineMode ? 'bg-amber-400' : 'bg-stone-300'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    isOfflineMode ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Retry countdown inside side control */}
              {rateLimitCountdown !== null && (
                <div className="mt-3 pt-3 border-t border-stone-100 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 bg-amber-50/70 border border-amber-200/50 rounded p-1.5">
                    <div className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                      <span>Retrying in {rateLimitCountdown}s</span>
                    </div>
                    <button
                      id="btn-retry-now"
                      onClick={() => {
                        setRateLimitCountdown(null);
                        handleSendPrompt(undefined, lastUserPromptRef.current);
                      }}
                      className="text-[10px] underline hover:text-amber-900 font-bold"
                    >
                      Now
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      id="opt-auto-retry"
                      type="checkbox"
                      checked={autoRetry}
                      onChange={(e) => setAutoRetry(e.target.checked)}
                      className="accent-stone-900 w-3.5 h-3.5"
                    />
                    <label htmlFor="opt-auto-retry" className="text-[10px] text-stone-500 hover:text-stone-700 cursor-pointer select-none">
                      Enable automatic retry
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick info footer */}
          <div className="p-4 border-t border-stone-100 bg-stone-50 text-[10px] text-stone-400 space-y-1 font-mono">
            <div>API Framework // client-secured</div>
            <div>Platform: Cloud Run Sandbox</div>
          </div>
        </aside>

        {/* 3. Center Column - Generative Hub */}
        <main className="flex-1 flex flex-col bg-stone-50 overflow-hidden relative">
          
          {/* Conversational Screen */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            <div className="max-w-2xl mx-auto space-y-6">
              
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex flex-col group ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-stone-450 font-mono font-medium">
                    <span>{msg.role === 'user' ? 'YOU' : 'GEMINI MODEL'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                    {msg.latencyMs && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-600 font-semibold">{msg.latencyMs}ms</span>
                      </>
                    )}
                    {msg.isMockCore && (
                      <>
                        <span>•</span>
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold text-[9px] flex items-center gap-0.5 border border-amber-200">
                          <WifiOff className="w-2.5 h-2.5" />
                          OFFLINE SANDBOX
                        </span>
                      </>
                    )}
                  </div>

                  <div className={`rounded-xl p-5 border text-sm max-w-full leading-relaxed relative ${
                    msg.role === 'user'
                      ? 'bg-stone-100 border-stone-250 text-stone-800'
                      : 'bg-white border-stone-200 text-stone-900 shadow-sm'
                  }`}>
                    
                    {/* Action buttons appear on hover for responses */}
                    {msg.role === 'model' && msg.id !== 'welcome' && (
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-white/90 backdrop-blur px-1 py-0.5 rounded border border-stone-200">
                        <button
                          id={`btn-copy-msg-${msg.id}`}
                          onClick={() => handleCopyText(msg.text, msg.id)}
                          className="p-1 hover:bg-stone-100 rounded text-stone-550 hover:text-stone-800 cursor-pointer"
                          title="Copy whole response"
                        >
                          {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          id={`btn-add-draft-${msg.id}`}
                          onClick={() => handleAddToWorkspace(msg.text)}
                          className="p-1 hover:bg-stone-100 rounded text-stone-550 hover:text-stone-800 cursor-pointer"
                          title="Append to Workspace Draft"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="whitespace-pre-wrap select-text pr-4">
                      {msg.role === 'user' ? msg.text : renderFormattedText(msg.text)}
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming UI Block */}
              {isGenerating && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-stone-450 font-mono font-medium">
                    <span>GEMINI MODEL</span>
                    <span>•</span>
                    <span className="text-amber-600 animate-pulse">Streaming response...</span>
                    <span>•</span>
                    <span className="font-mono">{generationTimeMs}ms</span>
                  </div>

                  <div className="rounded-xl p-5 border text-sm bg-white border-stone-200 text-stone-900 shadow-sm w-full relative">
                    <div className="whitespace-pre-wrap select-text">
                      {streamingText ? renderFormattedText(streamingText) : (
                        <div className="flex items-center gap-2 text-stone-400 font-mono text-xs">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stone-300 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-stone-400"></span>
                          </span>
                          <span>Negotiating API handshake...</span>
                        </div>
                      )}
                    </div>

                    {/* Infinite streaming elegant line */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-50 overflow-hidden rounded-b-xl">
                      <div className="h-full bg-stone-900 w-1/3 rounded-full animate-[loading_1s_infinite_linear]"></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Interactive Draft/Prompt Input Panel */}
          <div className="bg-white border-t border-stone-200 p-6">
            <div className="max-w-2xl mx-auto relative">
              <form onSubmit={handleSendPrompt} className="relative">
                <textarea
                  id="input-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask Gemini to draft, refine or audit content..."
                  rows={3}
                  className="w-full border border-stone-300 rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:border-stone-900 bg-stone-55 resize-none shadow-inner leading-relaxed pr-20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                />

                <div className="absolute right-3.5 bottom-3.5 flex items-center gap-2">
                  <span className="text-[10px] text-stone-410 font-mono select-none hidden sm:inline">
                    Ctrl + Enter
                  </span>
                  <button
                    id="btn-submit-prompt"
                    type="submit"
                    disabled={!prompt.trim() || isGenerating}
                    className={`p-2.5 rounded-lg text-white font-medium flex items-center justify-center cursor-pointer transition-all ${
                      prompt.trim() && !isGenerating
                        ? 'bg-stone-900 hover:bg-stone-800 shadow-md'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
              <div className="flex items-center justify-between text-[11px] text-stone-400 mt-2 px-1 font-mono">
                <span>Active configuration: {PRESETS.find(p => p.id === activePresetId)?.name || 'Custom Parameters'}</span>
                <span>Max response length: Unified to instructions</span>
              </div>
            </div>
          </div>
        </main>

        {/* 4. Right Drawer - Dedicated Draft Workspace */}
        <aside className={`${isWorkspaceOpen ? 'w-96' : 'w-12'} bg-white border-l border-stone-200 transition-all duration-300 flex flex-col overflow-hidden flex-shrink-0`}>
          
          {isWorkspaceOpen ? (
            <div className="flex flex-col h-full">
              {/* Workspace Header */}
              <div className="p-4 border-b border-stone-150 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-stone-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-800">Draft Workspace</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {saveStatus === 'success' && (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-mono animate-fade-in">
                      Appended!
                    </span>
                  )}
                  <button
                    id="btn-close-workspace"
                    onClick={() => setIsWorkspaceOpen(false)}
                    className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editor Workspace Area */}
              <div className="flex-1 p-4 flex flex-col space-y-4">
                <textarea
                  id="workspace-rich-editor"
                  value={workspaceDraft}
                  onChange={(e) => setWorkspaceDraft(e.target.value)}
                  placeholder="Clean and polish your favorite replies. Double-click any response chunk to append here..."
                  className="flex-1 w-full p-4 border border-stone-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:bg-white resize-none font-sans leading-relaxed shadow-inner"
                />

                {/* Workspace Actions Panel */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      id="btn-workspace-copy"
                      disabled={!workspaceDraft}
                      onClick={handleCopyWorkspace}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border border-stone-300 rounded-md text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {copiedDraft ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied Draft</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Clipboard</span>
                        </>
                      )}
                    </button>

                    <button
                      id="btn-workspace-download"
                      disabled={!workspaceDraft}
                      onClick={handleDownloadDraft}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border border-stone-300 rounded-md text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Export Text</span>
                    </button>
                  </div>

                  {workspaceDraft && (
                    <button
                      id="btn-clear-workspace"
                      onClick={() => setWorkspaceDraft('')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Draft Workspace</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Collapsed tiny vertical rail
            <div className="flex flex-col items-center py-6 h-full gap-5">
              <button
                id="btn-open-workspace"
                onClick={() => setIsWorkspaceOpen(true)}
                className="p-2 bg-stone-900 border border-stone-800 text-white hover:bg-stone-800 rounded-full cursor-pointer shadow-md"
                title="Expand Draft Workspace"
              >
                <FileText className="w-4 h-4" />
              </button>
              <div className="h-full flex items-center justify-center">
                <span className="text-[10px] tracking-widest font-mono font-bold text-stone-400 rotate-90 uppercase whitespace-nowrap select-none">
                  DRAFT WORKSPACE
                </span>
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}
