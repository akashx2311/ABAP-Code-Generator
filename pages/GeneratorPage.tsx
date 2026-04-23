import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { InputParameter, Table, TableOperation, ReportSpec } from '../types';
import { Icon } from '../components/Icon';

type GenerationProfile = 'Balanced' | 'Creative' | 'Concise' | 'Well-Commented';

type LLMModel = { id: string; label: string; description: string; provider: 'gemini' | 'openai' | 'claude' };

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

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-md mb-6">
    <h2 className="text-xl font-bold text-gray-800 border-b pb-3 mb-4">{title}</h2>
    {children}
  </div>
);

interface GeneratorPageProps {
  token: string;
  initialState?: ReportSpec;
  onInitialStateConsumed?: () => void;
}

export const GeneratorPage: React.FC<GeneratorPageProps> = ({ token, initialState, onInitialStateConsumed }) => {
  const defaultModel = LLM_MODELS[0].id;

  const [programName, setProgramName] = useState(initialState?.programName ?? 'Z_DEMO_REPORT');
  const [programDescription, setProgramDescription] = useState(initialState?.programDescription ?? 'A report to demonstrate AI code generation.');
  const [generationProfile, setGenerationProfile] = useState<GenerationProfile>(
    (initialState?.generationProfile as GenerationProfile) ?? 'Balanced'
  );
  const [selectedModel, setSelectedModel] = useState(() => {
    if (initialState?.model) return LLM_MODELS.find(m => m.id === initialState.model)?.id ?? defaultModel;
    const pref = localStorage.getItem(PREF_MODEL_KEY);
    return LLM_MODELS.find(m => m.id === pref)?.id ?? defaultModel;
  });
  const [inputParameters, setInputParameters] = useState<InputParameter[]>(
    initialState?.inputParameters ?? [{ id: crypto.randomUUID(), name: 'P_BUKRS', type: 'BUKRS', required: true }]
  );
  const [tables, setTables] = useState<Table[]>(
    initialState?.tables ?? [{ id: crypto.randomUUID(), name: 'T001', operation: 'SELECT', fields: 'BUKRS, BUTXT', whereClause: 'BUKRS = P_BUKRS' }]
  );
  const [outputDescription, setOutputDescription] = useState(
    initialState?.outputDescription ?? 'Display the selected company code details in a simple ALV grid.'
  );

  const [generatedCode, setGeneratedCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [saveToast, setSaveToast] = useState('');
  const [saveOk, setSaveOk] = useState(true);

  // Persist model preference whenever user changes it
  useEffect(() => {
    localStorage.setItem(PREF_MODEL_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (initialState) {
      setProgramName(initialState.programName);
      setProgramDescription(initialState.programDescription);
      setGenerationProfile((initialState.generationProfile as GenerationProfile) ?? 'Balanced');
      setSelectedModel(LLM_MODELS.find(m => m.id === initialState.model)?.id ?? defaultModel);
      setInputParameters(initialState.inputParameters);
      setTables(initialState.tables);
      setOutputDescription(initialState.outputDescription);
      setGeneratedCode('');
      onInitialStateConsumed?.();
    }
  }, [initialState, onInitialStateConsumed]);

  const handleAddParameter = useCallback(() => {
    setInputParameters(c => [...c, { id: crypto.randomUUID(), name: '', type: '', required: false }]);
  }, []);
  const handleRemoveParameter = useCallback((id: string) => {
    setInputParameters(c => c.filter(p => p.id !== id));
  }, []);
  const handleParameterChange = useCallback((id: string, field: keyof Omit<InputParameter, 'id'>, value: string | boolean) => {
    setInputParameters(c => c.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);
  const handleAddTable = useCallback(() => {
    setTables(c => [...c, { id: crypto.randomUUID(), name: '', operation: 'SELECT', fields: '', whereClause: '' }]);
  }, []);
  const handleRemoveTable = useCallback((id: string) => {
    setTables(c => c.filter(t => t.id !== id));
  }, []);
  const handleTableChange = useCallback((id: string, field: keyof Omit<Table, 'id'>, value: string) => {
    setTables(c => c.map(t => t.id === id ? { ...t, [field]: value } : t));
  }, []);

  const generatePrompt = (): string => {
    let prompt = `You are an expert SAP ABAP developer. Your task is to generate a complete and high-quality ABAP report program based on the following specifications. The code should be well-structured, follow modern ABAP (7.4+) syntax where possible, and include helpful comments.\n\n**Program Name:** ${programName.trim() || 'Z_GENERATED_REPORT'}\n**Program Description:** ${programDescription}\n\n**Selection Screen (Input Parameters):**\n`;
    if (inputParameters.length === 0) {
      prompt += '- None\n';
    } else {
      inputParameters.forEach(p => {
        prompt += `- Parameter: ${p.name || 'param_name'}, Type: ${p.type || 'c'}, Required: ${p.required ? 'Yes' : 'No'}\n`;
      });
    }
    prompt += '\n**Data Processing Logic (Tables & Operations):**\n';
    if (tables.length === 0) {
      prompt += '- None\n';
    } else {
      tables.forEach(t => {
        prompt += `- Operation: ${t.operation}\n  - Table Name: ${t.name}\n`;
        if (t.fields) prompt += `  - Fields: ${t.fields}\n`;
        if (t.whereClause) prompt += `  - WHERE Clause: ${t.whereClause}\n`;
      });
    }
    prompt += `\n**Output Requirements:**\n- ${outputDescription}\n\nPlease generate the complete ABAP code now.\n`;
    return prompt;
  };

  const fetchApiKey = async (provider: 'gemini' | 'openai' | 'claude'): Promise<string> => {
    const res = await fetch(`/api/apikeys/decrypt/${provider}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`No ${provider} API key configured. Add one via API Keys settings.`);
    const data = await res.json();
    return data.key;
  };

  const buildModelConfig = (): { systemInstruction?: string; temperature?: number } => {
    switch (generationProfile) {
      case 'Creative':     return { temperature: 1 };
      case 'Concise':      return { systemInstruction: 'Generate the most concise, compact, and shortest possible ABAP code that meets the requirements.' };
      case 'Well-Commented': return { systemInstruction: 'Generate ABAP code with extensive, detailed comments explaining each major block of logic, variable declaration, and complex statements.' };
      default:             return { temperature: 0.5 };
    }
  };

  const handleGenerateCode = async () => {
    if (!programName.trim()) {
      setError('Program name is required.');
      return;
    }
    setError('');
    setGeneratedCode('');
    setIsLoading(true);

    let code = '';
    try {
      const prompt = generatePrompt();
      const modelConfig = buildModelConfig();
      const activeModel = LLM_MODELS.find(m => m.id === selectedModel)!;

      if (activeModel.provider === 'openai') {
        const apiKey = await fetchApiKey('openai');
        const messages: { role: string; content: string }[] = [];
        if (modelConfig.systemInstruction) {
          messages.push({ role: 'system', content: modelConfig.systemInstruction });
        }
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
        const data = await res.json();
        code = data.choices[0]?.message?.content ?? '';
      } else if (activeModel.provider === 'claude') {
        const claudeBody: Record<string, unknown> = { model: selectedModel, prompt };
        if (modelConfig.systemInstruction) claudeBody.systemInstruction = modelConfig.systemInstruction;
        if (modelConfig.temperature !== undefined) claudeBody.temperature = modelConfig.temperature;
        const res = await fetch('/api/generate/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(claudeBody),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Claude API error ${res.status}`);
        }
        const data = await res.json();
        code = data.code ?? '';
      } else {
        const apiKey = await fetchApiKey('gemini');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model: selectedModel, contents: prompt, config: modelConfig });
        code = (response.text ?? '').trim();
      }

      code = code.replace(/^```(?:abap)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setGeneratedCode(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Generation failed: ${msg}`);
      console.error(err);
      return;
    } finally {
      setIsLoading(false);
    }

    // Save report separately so save failures don't mask generation success
    try {
      const saveRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          program_name: programName.trim(),
          description: programDescription,
          input_parameters: inputParameters,
          tables,
          output_description: outputDescription,
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
    if (!generatedCode) return;
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = generatedCode;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); setCopySuccess('Copied!'); }
      catch { setCopySuccess('Failed!'); }
      document.body.removeChild(ta);
      setTimeout(() => setCopySuccess(''), 2000);
    };
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(generatedCode).then(
      () => { setCopySuccess('Copied!'); setTimeout(() => setCopySuccess(''), 2000); },
      fallback
    );
  };

  const activeModel = LLM_MODELS.find(m => m.id === selectedModel);

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-2 lg:gap-8">
      <div>
        <FormSection title="1. Program Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="program-name" className="block text-sm font-medium text-gray-700 mb-1">Program Name <span className="text-red-500">*</span></label>
              <input type="text" id="program-name" value={programName} onChange={e => setProgramName(e.target.value)} disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 ${!programName.trim() ? 'border-red-300' : 'border-gray-300'}`} />
            </div>
            <div>
              <label htmlFor="generation-profile" className="block text-sm font-medium text-gray-700 mb-1">Generation Profile</label>
              <select id="generation-profile" value={generationProfile} onChange={e => setGenerationProfile(e.target.value as GenerationProfile)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
                <option>Balanced</option><option>Creative</option><option>Concise</option><option>Well-Commented</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="llm-model" className="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
              <select id="llm-model" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
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
              {activeModel && <p className="mt-1 text-xs text-gray-500">Model ID: <code className="bg-gray-100 px-1 rounded">{activeModel.id}</code></p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="program-desc" className="block text-sm font-medium text-gray-700 mb-1">Program Description</label>
              <textarea id="program-desc" value={programDescription} onChange={e => setProgramDescription(e.target.value)} rows={2} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
            </div>
          </div>
        </FormSection>

        <FormSection title="2. Input Parameters (Selection Screen)">
          {inputParameters.map(param => (
            <div key={param.id} className="grid grid-cols-12 gap-2 mb-3 items-end p-2 border rounded-md">
              <div className="col-span-5">
                <label className="block text-xs font-medium text-gray-600">Parameter Name</label>
                <input type="text" value={param.name} onChange={e => handleParameterChange(param.id, 'name', e.target.value)} placeholder="e.g., P_BUKRS" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
              <div className="col-span-4">
                <label className="block text-xs font-medium text-gray-600">Data Type</label>
                <input type="text" value={param.type} onChange={e => handleParameterChange(param.id, 'type', e.target.value)} placeholder="e.g., BUKRS" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
              <div className="col-span-2 flex items-center h-full">
                <input type="checkbox" id={`req-${param.id}`} checked={param.required} onChange={e => handleParameterChange(param.id, 'required', e.target.checked)} disabled={isLoading} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                <label htmlFor={`req-${param.id}`} className="ml-2 text-sm text-gray-700">Req.</label>
              </div>
              <div className="col-span-1">
                <button onClick={() => handleRemoveParameter(param.id)} disabled={isLoading} className="p-1.5 text-red-600 hover:bg-red-100 rounded-full disabled:opacity-40" aria-label="Remove">
                  <Icon type="trash" className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={handleAddParameter} disabled={isLoading} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 disabled:opacity-40">
            <Icon type="plus" className="h-4 w-4" /> Add Parameter
          </button>
        </FormSection>

        <FormSection title="3. Tables & Operations">
          {tables.map(table => (
            <div key={table.id} className="p-3 border rounded-md mb-3">
              <div className="grid grid-cols-12 gap-2 mb-2 items-center">
                <div className="col-span-5">
                  <label className="block text-xs font-medium text-gray-600">Table Name</label>
                  <input type="text" value={table.name} onChange={e => handleTableChange(table.id, 'name', e.target.value)} placeholder="e.g., MARA" disabled={isLoading}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
                </div>
                <div className="col-span-6">
                  <label className="block text-xs font-medium text-gray-600">Operation</label>
                  <select value={table.operation} onChange={e => handleTableChange(table.id, 'operation', e.target.value as TableOperation)} disabled={isLoading}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md bg-white disabled:bg-gray-50">
                    <option>SELECT</option><option>UPDATE</option><option>INSERT</option><option>DELETE</option>
                  </select>
                </div>
                <div className="col-span-1 self-end">
                  <button onClick={() => handleRemoveTable(table.id)} disabled={isLoading} className="p-1.5 text-red-600 hover:bg-red-100 rounded-full disabled:opacity-40" aria-label="Remove">
                    <Icon type="trash" className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Fields (comma-separated)</label>
                <input type="text" value={table.fields} onChange={e => handleTableChange(table.id, 'fields', e.target.value)} placeholder="e.g., MATNR, MTART" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md mb-2 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">WHERE Clause</label>
                <input type="text" value={table.whereClause} onChange={e => handleTableChange(table.id, 'whereClause', e.target.value)} placeholder="e.g., MTART = P_MTART" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
            </div>
          ))}
          <button onClick={handleAddTable} disabled={isLoading} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 disabled:opacity-40">
            <Icon type="plus" className="h-4 w-4" /> Add Table Operation
          </button>
        </FormSection>

        <FormSection title="4. Output Requirements">
          <label htmlFor="output-desc" className="block text-sm font-medium text-gray-700 mb-1">Describe the desired output</label>
          <textarea id="output-desc" value={outputDescription} onChange={e => setOutputDescription(e.target.value)} rows={3} disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
        </FormSection>

        <div className="mt-6">
          <button onClick={handleGenerateCode} disabled={isLoading || !programName.trim()}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating with {activeModel?.label ?? selectedModel}...
              </>
            ) : (
              <><Icon type="sparkles" className="h-6 w-6" /> Generate ABAP Code</>
            )}
          </button>
        </div>
      </div>

      <div className="mt-8 lg:mt-0">
        <div className="sticky top-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Generated Code</h2>
            <div className="flex items-center gap-2">
              {saveToast && (
                <span className={`text-xs px-2 py-1 rounded ${saveOk ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'}`}>
                  {saveToast}
                </span>
              )}
              {generatedCode && <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{activeModel?.label}</span>}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg shadow-lg relative h-[75vh]">
            {generatedCode && (
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-500 select-none"
              >
                <Icon type="copy" className="h-4 w-4" />{copySuccess || 'Copy'}
              </button>
            )}
            <pre className="p-4 h-full overflow-auto rounded-lg">
              <code className="text-white text-sm font-mono whitespace-pre">
                {isLoading && <span className="text-gray-400">Generating with {activeModel?.label}...</span>}
                {error && <span className="text-red-400">{error}</span>}
                {!isLoading && !error && !generatedCode && <span className="text-gray-400">Your generated ABAP code will appear here.</span>}
                {generatedCode}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
};
