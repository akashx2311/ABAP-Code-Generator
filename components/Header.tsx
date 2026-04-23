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
  const initials = `${user.first_name?.[0] ?? '?'}${user.last_name?.[0] ?? '?'}`.toUpperCase();

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
