import React from 'react';
import { useState } from 'react';
import { PDFScanner } from './components/PDFScanner';
import { QuestionGenerator } from './components/QuestionGenerator';
import { WrongQuestionRemover } from './components/WrongQuestionRemover';
import { FileText, Brain, Menu, AlertTriangle } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'generator' | 'remover'>('scanner');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg border-b border-gray-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-2 rounded-lg">
                <Menu className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Masters Up AI Platform
              </h1>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('scanner')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'scanner'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                PDF Scanner
              </button>
              
              <button
                onClick={() => setActiveTab('generator')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'generator'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Brain className="w-4 h-4" />
                Question Generator
              </button>
              
              <button
                onClick={() => setActiveTab('remover')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === 'remover'
                    ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Remove Wrong Questions
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-0">
        {activeTab === 'scanner' && <PDFScanner />}
        {activeTab === 'generator' && <QuestionGenerator />}
        {activeTab === 'remover' && <WrongQuestionRemover />}
      </div>
    </div>
  );
}

export default App;
