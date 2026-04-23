# Modify Report Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Modify Code" page where users upload an existing ABAP report and ask an LLM to apply specific changes while preserving the original coding style.

**Architecture:** New page `ModifyReportPage` (fourth nav item). File upload reads code client-side via `FileReader` — nothing uploaded to server. Generation reuses identical provider routing to `GeneratorPage` (Gemini/OpenAI direct from frontend, Claude via existing `/api/generate/claude` proxy). Result saved to My Reports.

**Tech Stack:** React 19, TypeScript, Tailwind CSS (CDN), `@google/genai` SDK (already installed), existing backend routes only.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `pages/ModifyReportPage.tsx` | **Create** | Full page: upload, instructions, model picker, generation, output |
| `components/Header.tsx` | **Modify** | Add `'modify'` to Page type; add nav button |
| `App.tsx` | **Modify** | Add `'modify'` to Page type; import + render `ModifyReportPage` |

---

## Task 1: Update Header and App routing

**Files:**
- Modify: `components/Header.tsx`
- Modify: `App.tsx`

### Context

`Header.tsx` has `type Page = 'generator' | 'reports' | 'api-setup'`. `App.tsx` has `type Page = 'auth' | 'api-setup' | 'generator' | 'reports'`. Both need `'modify'` added, the Header needs a new nav button, and App needs an import + render branch.

- [ ] **Step 1: Update `components/Header.tsx`**

Replace the entire file with:

```tsx
import React from 'react';
import type { AppUser } from '../types';

type Page = 'generator' | 'modify' | 'reports' | 'api-setup';

interface HeaderProps {
  user: AppUser;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, currentPage, onNavigate, onLogout }) => {
  const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();

  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">ABAP Code Generator</h1>
        </div>
        <button
          onClick={() => onNavigate('generator')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'generator' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Generator
        </button>
        <button
          onClick={() => onNavigate('modify')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'modify' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Modify Code
        </button>
        <button
          onClick={() => onNavigate('reports')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'reports' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          My Reports
        </button>
        <button
          onClick={() => onNavigate('api-setup')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'api-setup' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
          title="Manage API Keys"
        >
          🔑 API Keys
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold select-none">
            {initials}
          </div>
          <span className="text-sm text-gray-700 font-medium hidden sm:block">{user.username}</span>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
```

- [ ] **Step 2: Update `App.tsx`**

Replace the entire file with:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { ApiSetupPage } from './pages/ApiSetupPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { ModifyReportPage } from './pages/ModifyReportPage';
import { ReportsPage } from './pages/ReportsPage';
import { Header } from './components/Header';
import type { AppUser, ReportSpec } from './types';

type Page = 'auth' | 'api-setup' | 'generator' | 'modify' | 'reports';

const App: React.FC = () => {
  const { auth, login, logout } = useAuth();
  const [page, setPage] = useState<Page>('auth');
  const [generatorInitialState, setGeneratorInitialState] = useState<ReportSpec | undefined>();

  useEffect(() => {
    if (!auth.token || !auth.user) {
      setPage('auth');
      return;
    }
    const isFirstLogin = localStorage.getItem('abap_firstLogin') === '1';
    setPage(isFirstLogin ? 'api-setup' : 'generator');
  }, [auth.token]);

  const handleAuth = (token: string, user: AppUser) => {
    login(token, user);
  };

  const handleApiSetupComplete = () => {
    localStorage.removeItem('abap_firstLogin');
    setPage('generator');
  };

  const handleReuse = (spec: ReportSpec) => {
    setGeneratorInitialState(spec);
    setPage('generator');
  };

  if (!auth.token || !auth.user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const headerPage = page === 'auth' ? 'generator' : page as 'generator' | 'modify' | 'reports' | 'api-setup';

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Header
        user={auth.user}
        currentPage={headerPage}
        onNavigate={(p) => setPage(p)}
        onLogout={logout}
      />
      {page === 'api-setup' && (
        <ApiSetupPage
          token={auth.token}
          onComplete={handleApiSetupComplete}
          isSettingsMode={localStorage.getItem('abap_firstLogin') !== '1'}
        />
      )}
      {page === 'generator' && (
        <GeneratorPage
          token={auth.token}
          initialState={generatorInitialState}
          onInitialStateConsumed={() => setGeneratorInitialState(undefined)}
        />
      )}
      {page === 'modify' && (
        <ModifyReportPage token={auth.token} />
      )}
      {page === 'reports' && (
        <ReportsPage token={auth.token} onReuse={handleReuse} />
      )}
    </div>
  );
};

export default App;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: One error — `Cannot find module './pages/ModifyReportPage'` (the file does not exist yet). No other errors. This is expected and will be resolved in Task 2.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx App.tsx
git commit -m "feat: add Modify Code nav item and routing scaffold"
```

---

## Task 2: Create ModifyReportPage

**Files:**
- Create: `pages/ModifyReportPage.tsx`

### Context

This is the entire feature in one file. It mirrors the structure of `GeneratorPage.tsx` closely:
- Same two-column layout (`grid grid-cols-1 lg:grid-cols-2`)
- Same model/profile selectors with identical `LLM_MODELS` array
- Same dark right panel with Copy button and save toast
- Same provider routing (Gemini SDK, OpenAI fetch, Claude `/api/generate/claude`)
- Same `abap_pref_model` localStorage key for persisting model preference

The left panel has three form sections instead of four:
1. Upload ABAP Report (drag-drop zone + code textarea)
2. What to Change? (instructions textarea)
3. Model & Profile (selectors)

`FormSection` is NOT imported from GeneratorPage (it's not exported). Define it locally — it is a trivial wrapper.

Key helper: `extractProgramName(code)` — scans first 20 lines for `REPORT <name>.` or `PROGRAM <name>.` to auto-fill `program_name` when saving. Returns empty string if not found.

- [ ] **Step 1: Create `pages/ModifyReportPage.tsx`**

```tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Icon } from '../components/Icon';

type GenerationProfile = 'Balanced' | 'Creative' | 'Concise' | 'Well-Commented';
type LLMProvider = 'gemini' | 'openai' | 'claude';
type LLMModel = { id: string; label: string; description: string; provider: LLMProvider };

const LLM_MODELS: LLMModel[] = [
  { id: 'gemini-2.0-flash',         label: 'Gemini 2.0 Flash',     description: 'Fast & capable — recommended', provider: 'gemini' },
  { id: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro (Exp)', description: 'Most capable for complex logic', provider: 'gemini' },
  { id: 'gemini-1.5-pro',           label: 'Gemini 1.5 Pro',       description: 'Stable & reliable',            provider: 'gemini' },
  { id: 'gemini-1.5-flash',         label: 'Gemini 1.5 Flash',     description: 'Fastest generation',           provider: 'gemini' },
  { id: 'gpt-4o',                   label: 'GPT-4o',               description: 'OpenAI — most capable',        provider: 'openai' },
  { id: 'gpt-4o-mini',              label: 'GPT-4o Mini',          description: 'OpenAI — fast and cheap',      provider: 'openai' },
  { id: 'claude-opus-4-5',          label: 'Claude Opus 4',        description: 'Anthropic — most capable',     provider: 'claude' },
  { id: 'claude-sonnet-4-5',        label: 'Claude Sonnet 4',      description: 'Anthropic — balanced',         provider: 'claude' },
  { id: 'claude-haiku-4-5',         label: 'Claude Haiku 4',       description: 'Anthropic — fastest',          provider: 'claude' },
];

const PREF_MODEL_KEY = 'abap_pref_model';
const MAX_FILE_BYTES = 500 * 1024;

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-md mb-6">
    <h2 className="text-xl font-bold text-gray-800 border-b pb-3 mb-4">{title}</h2>
    {children}
  </div>
);

const extractProgramName = (code: string): string => {
  const lines = code.split('\n').slice(0, 20);
  for (const line of lines) {
    const m = line.match(/^\s*(?:REPORT|PROGRAM)\s+(\w+)/i);
    if (m) return m[1].toUpperCase();
  }
  return '';
};

interface ModifyReportPageProps {
  token: string;
}

export const ModifyReportPage: React.FC<ModifyReportPageProps> = ({ token }) => {
  const defaultModel = LLM_MODELS[0].id;

  const [originalCode, setOriginalCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    const pref = localStorage.getItem(PREF_MODEL_KEY);
    return LLM_MODELS.find(m => m.id === pref)?.id ?? defaultModel;
  });
  const [generationProfile, setGenerationProfile] = useState<GenerationProfile>('Balanced');
  const [isDragOver, setIsDragOver] = useState(false);

  const [modifiedCode, setModifiedCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [saveToast, setSaveToast] = useState('');
  const [saveOk, setSaveOk] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(PREF_MODEL_KEY, selectedModel);
  }, [selectedModel]);

  const loadFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      alert('File is too large (> 500 KB). Please paste the code directly.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setOriginalCode((e.target?.result as string) ?? '');
      setFileName(file.name);
      setModifiedCode('');
      setError('');
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const fetchApiKey = async (provider: LLMProvider): Promise<string> => {
    const res = await fetch(`/api/apikeys/decrypt/${provider}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`No ${provider} API key configured. Add one via API Keys settings.`);
    return (await res.json()).key;
  };

  const buildModelConfig = (): { systemInstruction?: string; temperature?: number } => {
    switch (generationProfile) {
      case 'Creative':       return { temperature: 1 };
      case 'Concise':        return { systemInstruction: 'Generate the most concise, compact, and shortest possible ABAP code that meets the requirements.' };
      case 'Well-Commented': return { systemInstruction: 'Generate ABAP code with extensive, detailed comments explaining each major block of logic.' };
      default:               return { temperature: 0.5 };
    }
  };

  const buildPrompt = (): string =>
    `You are an expert SAP ABAP developer. Below is an existing ABAP program.\nApply ONLY the requested modification. Do not add any extra features or restructure anything beyond what is asked. Preserve the exact coding style, naming conventions, indentation, and comment patterns of the original code.\nReturn the complete modified program — no explanations, no markdown, just code.\n\n──────────────── ORIGINAL CODE ────────────────\n${originalCode.trim()}\n──────────────── END OF CODE ────────────────\n\nREQUESTED MODIFICATION:\n${instructions.trim()}`;

  const handleGenerate = async () => {
    setError('');
    setModifiedCode('');
    setIsLoading(true);

    let code = '';
    try {
      const prompt = buildPrompt();
      const modelConfig = buildModelConfig();
      const activeModel = LLM_MODELS.find(m => m.id === selectedModel)!;

      if (activeModel.provider === 'openai') {
        const apiKey = await fetchApiKey('openai');
        const messages: { role: string; content: string }[] = [];
        if (modelConfig.systemInstruction) messages.push({ role: 'system', content: modelConfig.systemInstruction });
        messages.push({ role: 'user', content: prompt });
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: selectedModel, messages, temperature: modelConfig.temperature ?? 0.7 }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message ?? 'OpenAI API error');
        }
        code = (await res.json()).choices[0]?.message?.content ?? '';
      } else if (activeModel.provider === 'claude') {
        const body: Record<string, unknown> = { model: selectedModel, prompt };
        if (modelConfig.systemInstruction) body.systemInstruction = modelConfig.systemInstruction;
        if (modelConfig.temperature !== undefined) body.temperature = modelConfig.temperature;
        const res = await fetch('/api/generate/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Claude API error ${res.status}`);
        }
        code = (await res.json()).code ?? '';
      } else {
        const apiKey = await fetchApiKey('gemini');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model: selectedModel, contents: prompt, config: modelConfig });
        code = (response.text ?? '').trim();
      }

      code = code.replace(/^```(?:abap)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setModifiedCode(code);
    } catch (err) {
      setError(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      setIsLoading(false);
    }

    const programName =
      extractProgramName(code) ||
      extractProgramName(originalCode) ||
      (fileName ? fileName.replace(/\.[^.]+$/, '').toUpperCase() : 'Z_MODIFIED');

    try {
      const saveRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          program_name: programName,
          description: `Modified: ${instructions.trim().slice(0, 120)}`,
          input_parameters: [],
          tables: [],
          output_description: instructions.trim(),
          generated_code: code,
          model: selectedModel,
          generation_profile: generationProfile,
        }),
      });
      if (saveRes.ok) {
        setSaveOk(true);
        setSaveToast('Report saved!');
        setTimeout(() => setSaveToast(''), 3000);
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        setSaveOk(false);
        setSaveToast(`Save failed: ${errData.error ?? saveRes.status}`);
        setTimeout(() => setSaveToast(''), 5000);
      }
    } catch {
      setSaveOk(false);
      setSaveToast('Save failed (network error).');
      setTimeout(() => setSaveToast(''), 5000);
    }
  };

  const copyToClipboard = () => {
    if (!modifiedCode) return;
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = modifiedCode;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); setCopySuccess('Copied!'); } catch { setCopySuccess('Failed!'); }
      document.body.removeChild(ta);
      setTimeout(() => setCopySuccess(''), 2000);
    };
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(modifiedCode).then(
      () => { setCopySuccess('Copied!'); setTimeout(() => setCopySuccess(''), 2000); },
      fallback
    );
  };

  const activeModel = LLM_MODELS.find(m => m.id === selectedModel);
  const canGenerate = originalCode.trim().length > 0 && instructions.trim().length > 0 && !isLoading;

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-2 lg:gap-8">
      {/* Left panel */}
      <div>
        <FormSection title="1. Upload ABAP Report">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors mb-4 ${
              isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".abap,.txt,.prog,*"
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="text-3xl mb-2">📂</div>
            {fileName
              ? <p className="text-sm text-green-700 font-medium">✓ {fileName}</p>
              : <p className="text-sm text-gray-500">Drop an <code className="bg-gray-100 px-1 rounded">.abap</code> file here, or click to browse</p>
            }
          </div>
          <p className="text-xs text-gray-400 text-center mb-3">— or paste code directly below —</p>
          <textarea
            value={originalCode}
            onChange={e => { setOriginalCode(e.target.value); if (fileName) setFileName(''); }}
            rows={10}
            placeholder={'REPORT z_example.\n\nSELECT-OPTIONS: s_bukrs FOR t001-bukrs.\n\nSTART-OF-SELECTION.\n  ...'}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </FormSection>

        <FormSection title="2. What to Change?">
          <label htmlFor="instructions" className="block text-sm font-medium text-gray-700 mb-1">
            Describe the modification
          </label>
          <textarea
            id="instructions"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={4}
            placeholder="e.g. Add error handling when the SELECT returns no rows and display a friendly message to the user."
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
        </FormSection>

        <FormSection title="3. Model & Profile">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="llm-model-modify" className="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
              <select
                id="llm-model-modify"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
              >
                <optgroup label="Google Gemini">
                  {LLM_MODELS.filter(m => m.provider === 'gemini').map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </optgroup>
                <optgroup label="OpenAI">
                  {LLM_MODELS.filter(m => m.provider === 'openai').map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </optgroup>
                <optgroup label="Anthropic Claude">
                  {LLM_MODELS.filter(m => m.provider === 'claude').map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </optgroup>
              </select>
              {activeModel && (
                <p className="mt-1 text-xs text-gray-500">Model ID: <code className="bg-gray-100 px-1 rounded">{activeModel.id}</code></p>
              )}
            </div>
            <div>
              <label htmlFor="profile-modify" className="block text-sm font-medium text-gray-700 mb-1">Generation Profile</label>
              <select
                id="profile-modify"
                value={generationProfile}
                onChange={e => setGenerationProfile(e.target.value as GenerationProfile)}
                disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
              >
                <option>Balanced</option>
                <option>Creative</option>
                <option>Concise</option>
                <option>Well-Commented</option>
              </select>
            </div>
          </div>
        </FormSection>

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Applying changes with {activeModel?.label ?? selectedModel}...
            </>
          ) : (
            <><Icon type="sparkles" className="h-6 w-6" /> Apply Changes</>
          )}
        </button>
      </div>

      {/* Right panel */}
      <div className="mt-8 lg:mt-0">
        <div className="sticky top-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Modified Code</h2>
            <div className="flex items-center gap-2">
              {saveToast && (
                <span className={`text-xs px-2 py-1 rounded ${saveOk ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'}`}>
                  {saveToast}
                </span>
              )}
              {modifiedCode && (
                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{activeModel?.label}</span>
              )}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg shadow-lg relative h-[75vh]">
            {modifiedCode && (
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-500 select-none"
              >
                <Icon type="copy" className="h-4 w-4" />{copySuccess || 'Copy'}
              </button>
            )}
            <pre className="p-4 h-full overflow-auto rounded-lg">
              <code className="text-white text-sm font-mono whitespace-pre">
                {isLoading && <span className="text-gray-400">Applying changes with {activeModel?.label}...</span>}
                {error && <span className="text-red-400">{error}</span>}
                {!isLoading && !error && !modifiedCode && (
                  <span className="text-gray-400">Your modified ABAP code will appear here.</span>
                )}
                {modifiedCode}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`

Expected: No output (clean compile).

- [ ] **Step 3: Commit**

```bash
git add pages/ModifyReportPage.tsx
git commit -m "feat: add ModifyReportPage with file upload and LLM modification"
```

---

## Self-Review

**Spec coverage:**
- ✅ Upload area (drag-drop + click-to-browse) — Step 1, `handleDrop` / `handleFileInput`
- ✅ Code textarea, auto-filled from file, editable — `originalCode` state + `loadFile`
- ✅ Modification instructions textarea — `instructions` state
- ✅ Model selector with all three optgroups — `LLM_MODELS`, `selectedModel`
- ✅ Generation profile selector — `generationProfile`
- ✅ "Apply Changes" button disabled when code or instructions empty — `canGenerate`
- ✅ Gemini provider routing — `ai.models.generateContent`
- ✅ OpenAI provider routing — direct fetch to `openai.com`
- ✅ Claude provider routing — POST `/api/generate/claude`
- ✅ Code fence stripping — `.replace(/^```...`
- ✅ Save to My Reports with program name extraction — `extractProgramName`, POST `/api/reports`
- ✅ Copy button with clipboard fallback — `copyToClipboard`
- ✅ Green/orange save toast — `saveOk` + `saveToast`
- ✅ File too large alert — `MAX_FILE_BYTES` check in `loadFile`
- ✅ `abap_pref_model` localStorage key shared with GeneratorPage — `PREF_MODEL_KEY`
- ✅ Header nav button — Task 1
- ✅ App routing — Task 1

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code is complete. ✓

**Type consistency:** `LLMProvider`, `LLMModel`, `GenerationProfile` defined at top of file and used consistently throughout. `extractProgramName` returns `string`, used in `programName` fallback chain. ✓
