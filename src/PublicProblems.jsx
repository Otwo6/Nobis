import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  MessageSquare, 
  LogOut, 
  Lock, 
  Filter,
  ListFilter,
  ArrowUp,
  Search,
  AlertCircle,
  HelpCircle
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
  const [isLoading, setIsLoading] = useState(true);
  // Added dummy pending issues state to prevent crash since it was referenced in original logic
  const [pendingIssues, setPendingIssues] = useState([]); 

  // --- ADMIN EDITING STATE ---
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');

  // --- FETCH DATA FROM SERVER ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3005/api/data', {
        credentials: 'include' // Include cookies
      });
      if (!res.ok) throw new Error('Failed to fetch data');
      
      const data = await res.json();
      setTopIssues(data.issues || []);
      setQuestions(data.questions || []);
    } catch (e) {
      console.error("Connection Error:", e);
      // Fallback data for visualization if server is down (Removed for production, kept for safety in demo)
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingIssues = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch('http://localhost:3005/api/admin/pending-issues', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch pending issues');
      const data = await res.json();
      setPendingIssues(data.issues || []);
    } catch (e) {
      console.error("Error fetching pending issues:", e);
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

  // --- LOGIN LOGIC (using cookies) ---
  const handleLogin = async () => {
    try {
      const response = await fetch('http://localhost:3005/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies
        body: JSON.stringify({ username: 'admin', password: loginPassword })
      });

      const data = await response.json();

      if (data.success) {
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

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:3005/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setIsAuthenticated(false);
      setPendingIssues([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // --- ADMIN Q&A LOGIC ---
  const handleAnswerQuestion = async (questionId) => {
    try {
      await fetch('http://localhost:3005/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const handleIssueAction = async (issueId, actionType) => {
    const reason = prompt(`Enter a reason for the constituents (e.g., 'This issue is ${actionType} because...'):`);
    if (!reason) return;

    try {
      const res = await fetch('http://localhost:3005/api/resolve-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ issueId, reason, actionType })
      });
      
      if (res.ok) {
        alert(`Issue ${actionType} and constituents notified!`);
        await fetchData(); 
      }
    } catch (error) {
      alert(`Error during ${actionType} action.`);
    }
  };

  // These functions were in the original logic but not used in the render provided. 
  // Kept here to maintain logic integrity.
  const handleApproveIssue = async (issueId) => {
    try {
      const res = await fetch('http://localhost:3005/api/admin/approve-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ issueId })
      });
      if (res.ok) {
        alert('Issue approved and now visible to public!');
        await fetchPendingIssues();
        await fetchData();
      }
    } catch (error) {
      alert('Error approving issue.');
    }
  };

  const handleRejectIssue = async (issueId) => {
    try {
      const res = await fetch('http://localhost:3005/api/admin/reject-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ issueId })
      });
      if (res.ok) {
        alert('Issue rejected.');
        await fetchPendingIssues();
      }
    } catch (error) {
      alert('Error rejecting issue.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-slate-800">
      
      {/* --- HEADER SECTION --- */}
      <header className="shadow-lg relative z-20">
        
        {/* 1. TOP BAR: IDENTITY (Dark Blue) */}
        <div className="bg-[#0d274c] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-2 rounded-full border border-white/20">
                <div className="w-8 h-8 rounded-full bg-[#1a2e55] flex items-center justify-center font-serif font-bold text-[#C5A045]">
                  US
                </div>
              </div>
              <div>
                <h1 className="text-lg font-serif font-bold tracking-wide">Rep. Alexandria Ocasio-Cortez</h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#C5A045]">NY-14 • Nobis Platform</p>
              </div>
            </div>
            
            <div>
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[#C5A045] bg-[#C5A045]/10 px-3 py-1 rounded-full border border-[#C5A045]/50">
                    ADMIN MODE ACTIVE
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white rounded hover:bg-white/20 text-xs uppercase tracking-wider transition-colors border border-white/20"
                  >
                    <LogOut className="w-3 h-3" />
                    Logout
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 px-4 py-1.5 border border-white/30 text-white rounded hover:bg-white/10 text-xs font-medium uppercase tracking-wider transition-colors"
                >
                  <Lock className="w-3 h-3" />
                  Admin Login
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. GOLDEN SEPARATOR BAR */}
        <div className="h-2 w-full bg-[#C5A045] relative z-30 shadow-sm"></div>

        {/* 3. SEARCH AREA (White Background) */}
        <div className="bg-[#06183c] border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:max-w-xl">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search issues & questions..." 
                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C5A045] sm:text-sm transition-all"
                        />
                    </div>
                </div>
            </div>
        </div>

      </header>

      {/* --- LOGIN MODAL (Unchanged functionality, styling matched) --- */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-[#0F1F3D]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFBF7] rounded-xl shadow-2xl p-8 w-full max-w-[400px] border-4 border-[#C5A045]">
            <div className="flex flex-col items-center mb-6">
              <div className="p-3 bg-[#0F1F3D] rounded-full mb-4 shadow-lg">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-serif font-bold text-[#0F1F3D]">Representative Login</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full border-2 border-gray-200 bg-white rounded p-3 focus:border-[#0F1F3D] outline-none transition-all font-serif"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={handleLogin} 
                  className="w-full bg-[#0F1F3D] text-white py-3 rounded font-bold uppercase tracking-wider hover:bg-[#1a2e55] transition-colors shadow-lg"
                >
                  Access Dashboard
                </button>
                <button 
                  onClick={() => setShowLoginModal(false)} 
                  className="w-full text-gray-500 py-2 hover:text-gray-800 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MAIN CONTENT --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* --- LEFT: ISSUES LIST (Matches "Legislative Priorities" Card) --- */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-fit">
            
            {/* Card Header */}
            <div className="p-6 pb-2">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <ListFilter className="w-5 h-5 text-[#C5A045]" />
                        <h2 className="text-xl font-serif font-bold text-[#0F1F3D]">Legislative Priorities & Progress</h2>
                    </div>
                    
                    {/* Filters */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Filter className="absolute left-3 top-2.5 w-4 h-4 text-[#8a7f6b]" />
                            <select 
                            value={selectedCategory} 
                            onChange={e => setSelectedCategory(e.target.value)}
                            className="w-full pl-9 pr-2 py-2 border border-[#E5E0D0] rounded bg-[#FDFBF7] text-sm text-[#0F1F3D] font-medium focus:outline-none focus:border-[#C5A045]"
                            >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="relative w-28">
                            <select 
                            value={displayLimit} 
                            onChange={e => setDisplayLimit(Number(e.target.value))}
                            className="w-full pl-3 pr-2 py-2 border border-[#E5E0D0] rounded bg-[#FDFBF7] text-sm text-[#0F1F3D] font-medium focus:outline-none focus:border-[#C5A045]"
                            >
                            <option value={5}>Top 5</option>
                            <option value={10}>Top 10</option>
                            <option value={20}>Top 20</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="p-4 space-y-3">
              {visibleIssues.length > 0 ? (
                visibleIssues.map((issue) => (
                  <div key={issue.id} className="bg-white p-4 border border-[#E5E0D0] rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex gap-4">
                        {/* Vote Counter */}
                        <div className="flex flex-col items-center justify-center min-w-[3rem]">
                            <ArrowUp className="w-5 h-5 text-[#C5A045] mb-1" />
                            <span className="text-xl font-serif font-bold text-[#0F1F3D] leading-none">{issue.count}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Votes</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                            <div className="mb-1">
                                <span className="inline-block bg-[#0F1F3D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full mb-1">
                                    {issue.category}
                                </span>
                                <h3 className="font-serif font-bold text-gray-900 leading-tight">{issue.issue}</h3>
                            </div>
                            
                            <div className="mt-3">
                                <div className="flex justify-between text-xs font-bold text-[#C5A045] uppercase tracking-wider mb-1">
                                    <span>Funding Progress</span>
                                    <span>{Math.min(100, Math.round((issue.count / (topIssues[0]?.count || 1) * 100)))}%</span>
                                </div>
                                <div className="w-full bg-[#E5E0D0] h-2 rounded-full overflow-hidden">
                                    <div 
                                        className="bg-[#C5A045] h-full rounded-full" 
                                        style={{ width: `${Math.min(100, (issue.count / (topIssues[0]?.count || 1) * 100))}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 italic">Status: In Review</p>
                            </div>

                            {/* Admin Controls */}
                            {isAuthenticated && (
                                <div className="flex gap-3 mt-3 pt-2 border-t border-gray-100">
                                    <button 
                                        onClick={() => handleIssueAction(issue.id, 'resolved')}
                                        className="text-xs font-bold text-green-700 hover:text-green-900 uppercase tracking-wider"
                                    >
                                        Mark Resolved
                                    </button>
                                    <button 
                                        onClick={() => handleIssueAction(issue.id, 'removed')}
                                        className="text-xs font-bold text-red-700 hover:text-red-900 uppercase tracking-wider"
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 italic font-serif">
                   {isLoading ? "Loading issues..." : "No issues in this category."}
                </div>
              )}
            </div>
            
            <div className="bg-[#FDFBF7] p-3 text-center border-t border-[#E5E0D0]">
                <button className="text-xs font-bold text-[#0F1F3D] uppercase tracking-widest hover:underline">View All Issues</button>
            </div>
          </div>

          {/* --- RIGHT: QUESTIONS LIST (Matches "Constituent Questions" Card) --- */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-fit">
            <div className="p-6 border-b border-[#E5E0D0]">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-[#0F1F3D]" />
                    <h2 className="text-xl font-serif font-bold text-[#0F1F3D]">Constituent Questions</h2>
                </div>
            </div>

            <div className="p-6 space-y-6 bg-[#FDFBF7] min-h-[400px]">
              {questions.length > 0 ? (
                questions.map((q) => (
                  <div key={q.id} className="bg-[#F9F7F1] border border-[#E5E0D0] rounded-xl p-5 shadow-sm">
                    {/* Question Header */}
                    <div className="flex justify-between items-start mb-3">
                         <h3 className="font-serif font-bold text-gray-900 text-sm">{q.question}</h3>
                         <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${q.answered ? 'bg-[#d9cba0] text-[#5c4d26]' : 'bg-[#e0d6c2] text-[#7a6e5a]'}`}>
                            {q.answered ? 'Answered' : 'Pending'}
                         </span>
                    </div>

                    {/* Answer Section */}
                    <div className="bg-white border border-[#E5E0D0] rounded-lg p-4 relative">
                        {/* Triangle for chat bubble look */}
                        <div className="absolute -top-2 left-6 w-4 h-4 bg-white border-t border-l border-[#E5E0D0] transform rotate-45"></div>
                        
                        {q.answered ? (
                            <div className="text-sm text-gray-700">
                                <span className="font-bold text-green-700 mr-2">Reply:</span>
                                {q.answer}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-400 italic">
                                <span className="font-bold text-gray-300 mr-2">Reply:</span>
                                No reply yet
                            </div>
                        )}

                        {isAuthenticated && (
                            <div className="mt-3 pt-2 border-t border-gray-100">
                                {editingQuestion === q.id ? (
                                <div className="space-y-2">
                                    <textarea
                                    value={answerText}
                                    onChange={(e) => setAnswerText(e.target.value)}
                                    className="w-full p-2 text-sm border border-gray-300 rounded focus:border-[#C5A045] outline-none"
                                    placeholder="Write official response..."
                                    rows={3}
                                    />
                                    <div className="flex gap-2 justify-end">
                                    <button onClick={() => setEditingQuestion(null)} className="text-gray-500 text-xs uppercase font-bold px-3 py-1">Cancel</button>
                                    <button onClick={() => handleAnswerQuestion(q.id)} className="bg-[#0F1F3D] text-white px-4 py-1 rounded text-xs uppercase font-bold">Save Response</button>
                                    </div>
                                </div>
                                ) : (
                                <button 
                                    onClick={() => { setEditingQuestion(q.id); setAnswerText(q.answer); }}
                                    className="text-xs text-[#C5A045] font-bold uppercase tracking-wider hover:underline"
                                >
                                    {q.answered ? 'Edit Response' : 'Write Response'}
                                </button>
                                )}
                            </div>
                        )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 italic font-serif">
                   {isLoading ? "Loading questions..." : "No questions yet."}
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