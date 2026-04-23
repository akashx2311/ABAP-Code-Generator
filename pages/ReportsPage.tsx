import React, { useState, useEffect } from 'react';
import type { ReportListItem, ReportDetail, ReportSpec } from '../types';

interface ReportsPageProps {
  token: string;
  onReuse: (spec: ReportSpec) => void;
}

function relativeTime(iso: string): string {
  // SQLite CURRENT_TIMESTAMP has no timezone suffix — force UTC parsing
  const utc = iso.includes('T') || iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z';
  const diff = Date.now() - new Date(utc).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ token, onReuse }) => {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [search, setSearch] = useState('');
  const [viewReport, setViewReport] = useState<ReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/reports', { headers: authHeaders })
      .then(r => r.json())
      .then(data => { setReports(Array.isArray(data) ? data : []); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [token]);

  const handleView = async (id: number) => {
    try {
      const res = await fetch(`/api/reports/${id}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load report');
      const data = await res.json();
      setViewReport(data);
    } catch {
      setActionError('Failed to load report. Please try again.');
    }
  };

  const handleReuse = async (id: number) => {
    try {
      const res = await fetch(`/api/reports/${id}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load report');
      const data: ReportDetail = await res.json();
      onReuse({
        programName: data.program_name,
        programDescription: data.description,
        inputParameters: data.input_parameters,
        tables: data.tables,
        outputDescription: data.output_description,
        model: data.model,
        generationProfile: data.generation_profile,
      });
    } catch {
      setActionError('Failed to load report. Please try again.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error('Delete failed');
      setReports(r => r.filter(rep => rep.id !== id));
      if (viewReport?.id === id) setViewReport(null);
    } catch {
      setActionError('Failed to delete report. Please try again.');
    }
  };

  const copyCode = () => {
    if (!viewReport?.generated_code) return;
    const text = viewReport.generated_code;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => { setCopySuccess('Copied!'); setTimeout(() => setCopySuccess(''), 2000); },
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      setCopySuccess('Copied!');
    } catch {
      setCopySuccess('Failed!');
    }
    document.body.removeChild(ta);
    setTimeout(() => setCopySuccess(''), 2000);
  };

  const filtered = reports.filter(r =>
    r.program_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">My Reports</h2>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search reports..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading reports...</p>}
      {actionError && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{actionError}</p>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{search ? 'No reports match your search.' : 'No reports yet. Generate your first report!'}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(report => (
          <div key={report.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{report.program_name}</p>
                <p className="text-sm text-gray-500 truncate mt-0.5">{report.description || '—'}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{relativeTime(report.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{report.model}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{report.generation_profile}</span>
              <div className="ml-auto flex gap-3">
                <button onClick={() => handleView(report.id)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">View</button>
                <button onClick={() => handleReuse(report.id)} className="text-sm text-green-600 hover:text-green-800 font-medium">Re-use</button>
                <button onClick={() => handleDelete(report.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View modal */}
      {viewReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewReport(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">{viewReport.program_name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewReport.model} · {viewReport.generation_profile} · {relativeTime(viewReport.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copyCode} className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-600">
                  {copySuccess || 'Copy Code'}
                </button>
                <button onClick={() => setViewReport(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-2">✕</button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 bg-gray-900 rounded-b-xl">
              <code className="text-white text-sm font-mono whitespace-pre">{viewReport.generated_code}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
