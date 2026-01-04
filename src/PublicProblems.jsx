import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  MessageSquare, 
  LogOut, 
  Lock, 
  Send, 
  Loader2, 
  CheckCircle2,
  Filter,
  ListFilter
} from 'lucide-react';

const Nobis = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');

  // --- INPUT STATE ---
  const [voiceInput, setVoiceInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(null);

  // --- DISPLAY CONTROLS ---
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [displayLimit, setDisplayLimit] = useState(5);

  // --- DATA STATE (Now starts empty) ---
  const [topIssues, setTopIssues] = useState([]);
  const [questions, setQuestions] = useState([]);

  // --- ADMIN EDITING STATE ---
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');

  // --- FETCH DATA FROM SERVER (GOOGLE SHEETS) ---
  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/data');
      if (!res.ok) throw new Error('Failed to fetch data');
      
      const data = await res.json();
      // Ensure we set arrays even if data is missing
      setTopIssues(data.issues || []);
      setQuestions(data.questions || []);
    } catch (e) {
      console.error("Connection Error:", e);
    }
  };

  // Load data when component mounts
  useEffect(() => {
    fetchData();
  }, []);

  // --- COMPUTED DATA ---
  const categories = useMemo(() => {
    const cats = new Set(topIssues.map(i => i.category));
    return ['All', ...Array.from(cats)];
  }, [topIssues]);

  const visibleIssues = useMemo(() => {
    let filtered = topIssues;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(issue => issue.category === selectedCategory);
    }
    // Sort by count (highest first)
    filtered.sort((a, b) => b.count - a.count);
    return filtered.slice(0, displayLimit);
  }, [topIssues, selectedCategory, displayLimit]);

  // --- SECURE AI SUBMISSION ---
  const analyzeAndSubmitIssue = async () => {
    if (!voiceInput.trim()) return;
    
    setIsAnalyzing(true);
    setSubmissionStatus(null);

    try {
      // 1. Send input to server
      // Note: We no longer send "context". The server reads the Sheet directly.
      const response = await fetch('http://localhost:3001/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceInput: voiceInput
        })
      });

      if (!response.ok) throw new Error('Server error');

      // 2. Wait for success, then refresh data from Sheets
      await fetchData();

      setSubmissionStatus('success');
      setVoiceInput('');
      setTimeout(() => setSubmissionStatus(null), 3000);

    } catch (error) {
      console.error("Error:", error);
      setSubmissionStatus('error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- LOGIN LOGIC ---
  const handleLogin = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: loginPassword })
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem('nobis_token', data.token); // Store token
      setIsAuthenticated(true);
      setShowLoginModal(false);
      setLoginPassword('');
    } else {
      alert("Invalid Password");
    }
  } catch (error) {
    alert("Login failed. Is the server running?");
  }
};

  // --- ADMIN Q&A LOGIC ---
  const handleAnswerQuestion = async (questionId) => {
    try {
      const token = localStorage.getItem('nobis_token'); // Retrieve token

      await fetch('http://localhost:3001/api/answer', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Include token here
        },
        body: JSON.stringify({ id: questionId, answer: answerText })
      });

      // Clear local state
      setEditingQuestion(null);
      setAnswerText('');
      
      // Refresh data to show new answer
      await fetchData();
      
    } catch (error) {
      console.error("Failed to save answer", error);
      alert("Failed to save answer. Check server connection.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Politician Name</h1>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Nobis</p>
            </div>
            
            <div>
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
                    Admin Mode
                  </span>
                  <button
                    onClick={() => setIsAuthenticated(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors shadow-sm"
                >
                  <Lock className="w-3 h-3" />
                  Admin Login
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">Representative Login</h3>
            <input 
              type="password" 
              placeholder="Enter password (admin)" 
              className="w-full border border-gray-300 rounded-lg p-2 mb-4"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleLogin} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg">Login</button>
              <button onClick={() => setShowLoginModal(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* --- VOICE INPUT --- */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-indigo-600">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Speak Your Mind</h2>
          <p className="text-gray-600 mb-4 text-sm">
            Share problems or ask questions. Our system automatically sorts them. 
            <br/><span className="text-xs text-gray-400 italic">(e.g., "The roads are bad and when is the town hall?")</span>
          </p>
          <div className="relative">
            <textarea 
              value={voiceInput}
              onChange={(e) => setVoiceInput(e.target.value)}
              placeholder="Type or speak here..."
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
            />
            <button
              onClick={analyzeAndSubmitIssue}
              disabled={isAnalyzing || !voiceInput.trim()}
              className="absolute bottom-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit
            </button>
          </div>
          {submissionStatus === 'success' && (
            <div className="mt-3 text-green-600 flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>Input processed successfully! check the lists below.</span>
            </div>
          )}
          {submissionStatus === 'error' && (
            <div className="mt-3 text-red-600 text-sm font-medium">
              Server connection failed. Make sure server.js is running.
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* --- LEFT: ISSUES LIST --- */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 h-fit">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h2 className="text-xl font-bold">Issues</h2>
              </div>
              
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Filter className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                  <select 
                    value={selectedCategory} 
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 border rounded-lg text-sm bg-gray-50"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="relative w-24">
                  <ListFilter className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                  <select 
                    value={displayLimit} 
                    onChange={e => setDisplayLimit(Number(e.target.value))}
                    className="w-full pl-8 pr-2 py-2 border rounded-lg text-sm bg-gray-50"
                  >
                    <option value={5}>Top 5</option>
                    <option value={10}>Top 10</option>
                    <option value={20}>Top 20</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {visibleIssues.length > 0 ? (
                visibleIssues.map((issue) => (
                  <div key={issue.id} className="p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mb-1 inline-block">
                          {issue.category}
                        </span>
                        <p className="font-medium text-gray-900">{issue.issue}</p>
                      </div>
                      <div className="text-right ml-4">
                        <span className="text-2xl font-bold text-gray-800">{issue.count}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full mt-2">
                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, (issue.count / (topIssues[0]?.count || 1) * 100))}%` }}></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                   {topIssues.length === 0 ? "Loading issues..." : "No issues in this category."}
                </div>
              )}
            </div>
          </div>

          {/* --- RIGHT: QUESTIONS LIST --- */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 h-fit">
            <div className="flex items-center gap-2 mb-6">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-bold">Questions</h2>
            </div>

            <div className="space-y-4">
              {questions.length > 0 ? (
                questions.map((q) => (
                  <div key={q.id} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-medium text-gray-900">{q.question}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${q.answered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {q.answered ? 'Answered' : 'Pending'}
                      </span>
                    </div>
                    
                    {q.answered ? (
                      <div className="bg-white p-3 rounded border border-gray-200 text-sm text-gray-600 mt-2">
                        <span className="font-bold text-green-700">Reply: </span>
                        {q.answer}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic">Waiting for response...</p>
                    )}

                    {/* Admin Reply Box */}
                    {isAuthenticated && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        {editingQuestion === q.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={answerText}
                              onChange={(e) => setAnswerText(e.target.value)}
                              className="w-full p-2 text-sm border rounded"
                              placeholder="Write official response..."
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleAnswerQuestion(q.id)} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Save</button>
                              <button onClick={() => setEditingQuestion(null)} className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { setEditingQuestion(q.id); setAnswerText(q.answer); }}
                            className="text-sm text-indigo-600 font-medium hover:underline"
                          >
                            {q.answered ? 'Edit Response' : 'Write Response'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                   {questions.length === 0 ? "Loading questions..." : "No questions yet."}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Nobis;