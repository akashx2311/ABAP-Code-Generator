import React, { useState, useEffect } from 'react';

interface ApiSetupPageProps {
  token: string;
  onComplete: () => void;
  isSettingsMode?: boolean;
}

export const ApiSetupPage: React.FC<ApiSetupPageProps> = ({ token, onComplete, isSettingsMode = false }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  const [existing, setExisting] = useState({ gemini: false, openai: false, claude: false });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/apikeys', { headers: authHeaders })
      .then(r => r.json())
      .then(setExisting)
      .catch(() => {});
  }, [token]);

  const saveKey = async (provider: 'gemini' | 'openai' | 'claude', key: string) => {
    const res = await fetch('/api/apikeys', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key: key.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Failed to save ${provider} key (${res.status})`);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey.trim() && !openaiKey.trim() && !claudeKey.trim()) {
      return setError('Please enter at least one API key.');
    }
    setIsSaving(true);
    setError('');
    try {
      await Promise.all([
        geminiKey.trim() ? saveKey('gemini', geminiKey) : Promise.resolve(),
        openaiKey.trim() ? saveKey('openai', openaiKey) : Promise.resolve(),
        claudeKey.trim() ? saveKey('claude', claudeKey) : Promise.resolve(),
      ]);
      setSuccess('Keys saved successfully!');
      setTimeout(onComplete, 900);
    } catch {
      setError('Failed to save keys. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {isSettingsMode ? 'Update API Keys' : 'Configure AI Keys'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isSettingsMode
            ? 'Update your stored API keys below. Leave a field blank to keep the existing key.'
            : 'Add at least one API key to start generating ABAP reports.'}
        </p>

        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-lg">{success}</p>}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Gemini card */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold">G</div>
              <span className="font-semibold text-gray-800 text-sm">Google Gemini</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recommended</span>
              {existing.gemini && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>}
            </div>
            <div className="flex gap-2">
              <input
                type={showGemini ? 'text' : 'password'}
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder={existing.gemini ? '(key saved — enter new value to replace)' : 'AIzaSy...'}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowGemini(v => !v)} className="px-3 text-gray-500 hover:text-gray-700 text-sm">
                {showGemini ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* OpenAI card */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
              <span className="font-semibold text-gray-800 text-sm">OpenAI</span>
              {existing.openai && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>}
            </div>
            <div className="flex gap-2">
              <input
                type={showOpenai ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder={existing.openai ? '(key saved — enter new value to replace)' : 'sk-...'}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowOpenai(v => !v)} className="px-3 text-gray-500 hover:text-gray-700 text-sm">
                {showOpenai ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Claude card */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center text-white text-xs font-bold">C</div>
              <span className="font-semibold text-gray-800 text-sm">Anthropic Claude</span>
              {existing.claude && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>}
            </div>
            <div className="flex gap-2">
              <input
                type={showClaude ? 'text' : 'password'}
                value={claudeKey}
                onChange={e => setClaudeKey(e.target.value)}
                placeholder={existing.claude ? '(key saved — enter new value to replace)' : 'sk-ant-...'}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowClaude(v => !v)} className="px-3 text-gray-500 hover:text-gray-700 text-sm">
                {showClaude ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isSaving} className="w-full py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-purple-300 transition-colors">
            {isSaving ? 'Saving...' : 'Save Keys & Continue'}
          </button>
          {!isSettingsMode && (
            <button type="button" onClick={onComplete} className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors">
              Skip for now →
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
