import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  MessageSquare, 
  LogOut, 
  Lock, 
  Filter,
  ListFilter
} from 'lucide-react';

const Nobis = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');

  // --- DISPLAY CONTROLS ---
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [displayLimit, setDisplayLimit] = useState(5);

  // --- DATA STATE ---
  const [topIssues, setTopIssues] = useState([]);
  const [questions, setQuestions] = useState([]);

  // --- ADMIN EDITING STATE ---
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');

  // --- FETCH DATA FROM SERVER ---
  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/data');
      if (!res.ok) throw new Error('Failed to fetch data');
      
      const data = await res.json();
      setTopIssues(data.issues || []);
      setQuestions(data.questions || []);
    } catch (e) {
      console.error("Connection Error:", e);
    }
  };

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
    filtered.sort((a, b) => b.count - a.count);
    return filtered.slice(0, displayLimit);
  }, [topIssues, selectedCategory, displayLimit]);

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
        localStorage.setItem('nobis_token', data.token);
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
      const token = localStorage.getItem('nobis_token');

      await fetch('http://localhost:3001/api/answer', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: questionId, answer: answerText })
      });

      setEditingQuestion(null);
      setAnswerText('');
      await fetchData();
      
    } catch (error) {
      console.error("Failed to save answer", error);
      alert("Failed to save answer. Check server connection.");
    }
  };

  const handleResolveIssue = async (issueId) => {
  const reason = prompt("Enter a reason for the constituents (e.g., 'Work order #123 completed'):");
  if (!reason) return;

  try {
    const token = localStorage.getItem('nobis_token');
    const res = await fetch('http://localhost:3001/api/resolve-issue', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ issueId, reason, actionType: 'resolved' })
    });
    
    if (res.ok) {
      alert("Issue resolved and constituents notified!");
      await fetchData(); // Refresh list
    }
  } catch (error) {
    alert("Error resolving issue.");
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-[400px] border border-gray-100">
            <div className="flex flex-col items-center mb-6">
              <div className="p-3 bg-indigo-50 rounded-full mb-4">
                <Lock className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Representative Login</h3>
              <p className="text-sm text-gray-500">Access administrative dashboard</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={handleLogin} 
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-md active:transform active:scale-[0.98]"
                >
                  Login
                </button>
                <button 
                  onClick={() => setShowLoginModal(false)} 
                  className="w-full bg-gray-50 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
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
                    <div className="flex justify-between items-center mt-2">
                      <div className="w-full bg-gray-200 h-1.5 rounded-full">
                        <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, (issue.count / (topIssues[0]?.count || 1) * 100))}%` }}></div>
                      </div>
                      
                      {isAuthenticated && (
                        <div className="flex gap-2 ml-4">
                          <button 
                            onClick={() => handleResolveIssue(issue.id)}
                            className="text-xs font-bold text-green-600 hover:text-green-800 uppercase"
                          >
                            Resolve
                          </button>
                          <button 
                            onClick={() => { /* Similar logic for delete */ }}
                            className="text-xs font-bold text-red-600 hover:text-red-800 uppercase"
                          >
                            Remove
                          </button>
                        </div>
                      )}
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