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
  HelpCircle,
  CheckCircle,
  CheckCircle2,
  Circle,
  MessageCircle, 
  Send,         
  X             
} from 'lucide-react';

const Nobis = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');

  // --- CONTACT MODAL STATE ---
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // { type: 'success' | 'error', text: '' }
  
  // New OTP State Variables
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // --- DISPLAY CONTROLS (Issues) ---
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [displayLimit, setDisplayLimit] = useState(5);
  const [isViewAll, setIsViewAll] = useState(false);

  // --- DISPLAY CONTROLS (Questions) ---
  const [questionLimit, setQuestionLimit] = useState(5);
  const [isViewAllQuestions, setIsViewAllQuestions] = useState(false);
  const [answerStatusFilter, setAnswerStatusFilter] = useState('All');

  // --- SEARCH QUERY ---
  const [searchQuery, setSearchQuery] = useState('');

  // --- DATA STATE ---
  const [topIssues, setTopIssues] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIssues, setPendingIssues] = useState([]); 

  // --- ADMIN EDITING STATE ---
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');

  // --- FETCH DATA FROM SERVER ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3005/api/data', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch data');
      
      const data = await res.json();
      setTopIssues(data.issues || []);
      setQuestions(data.questions || []);
    } catch (e) {
      console.error("Connection Error:", e);
    } finally {
      setIsLoading(false);
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
    let filtered = [...topIssues];
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(issue => issue.category === selectedCategory);
    }

    if(searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.issue.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => b.count - a.count);
    return isViewAll ? filtered : filtered.slice(0, displayLimit);
  }, [topIssues, selectedCategory, displayLimit, isViewAll, searchQuery]);

  const visibleQuestions = useMemo(() => {
    let filtered = [...questions]; 
    if (answerStatusFilter === 'Answered') {
      filtered = filtered.filter(q => q.answered);
    } else if (answerStatusFilter === 'Unanswered') {
      filtered = filtered.filter(q => !q.answered);
    }

    if(searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(q =>
        q.question.toLowerCase().includes(query) ||
        (q.answer && q.answer.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => b.askedCount - a.askedCount);
    return isViewAllQuestions ? filtered : filtered.slice(0, questionLimit);
  }, [questions, answerStatusFilter, questionLimit, isViewAllQuestions, searchQuery]);

  // --- WEB SUBMISSION LOGIC ---
  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setSubmitStatus(null);

    // Phase 1: Request OTP
    if (!showOtpInput) {
      setIsSendingCode(true);
      try {
        const res = await fetch('http://localhost:3005/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: contactEmail })
        });
        
        const data = await res.json();
        
        if (res.ok) {
          setShowOtpInput(true);
          setSubmitStatus({ type: 'success', text: "Verification code sent to your email." });
        } else {
          setSubmitStatus({ type: 'error', text: data.error || "Failed to send code." });
        }
      } catch (err) {
        setSubmitStatus({ type: 'error', text: "Cannot connect to server. Please try again." });
      } finally {
        setIsSendingCode(false);
      }
      return;
    }

    // Phase 2: Submit Message with OTP
    setIsSubmitting(true);
    try {
      const res = await fetch('http://localhost:3005/api/web-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: contactEmail, 
          message: contactMessage, 
          otp 
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitStatus({ type: 'success', text: "Your message has been securely submitted to the Representative's office." });
        // Reset form completely upon success
        setContactMessage(''); 
        setContactEmail('');
        setOtp('');
        setShowOtpInput(false);
        fetchData(); 
      } else {
        setSubmitStatus({ type: 'error', text: data.error || "Verification failed." });
      }
    } catch (err) {
      setSubmitStatus({ type: 'error', text: "Cannot connect to server. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowContactModal(false);
    setSubmitStatus(null);
    setShowOtpInput(false);
    setOtp('');
  };

  // --- LOGIN/LOGOUT & ADMIN ACTIONS ---
  const handleLogin = async () => {
    try {
      const response = await fetch('http://localhost:3005/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      await fetch('http://localhost:3005/api/logout', { method: 'POST', credentials: 'include' });
      setIsAuthenticated(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

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

  useEffect(() => setIsViewAll(false), [selectedCategory, displayLimit]);
  useEffect(() => setIsViewAllQuestions(false), [answerStatusFilter, questionLimit]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-slate-800 relative">
      
      {/* --- HEADER SECTION --- */}
      <header className="shadow-lg relative z-20">
        <div className="bg-[#0d274c] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <a href='/'>
                <img src="/CockadeNobis2.png" alt="Nobis Logo" className="w-10 h-10" />
              </a>
              <div>
                <h1 className="text-lg font-serif font-bold tracking-wide">Rep. Politician Name</h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#C5A045]">US-0 • Nobis Platform</p>
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

        <div className="h-2 w-full bg-[#C5A045] relative z-30 shadow-sm"></div>

        <div className="bg-[#06183c] border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:max-w-xl">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="Search issues, categories, or responses..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#C5A045] sm:text-sm transition-all"
                        />
                        {searchQuery && (
                          <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </header>

      {/* --- CONTACT MODAL --- */}
      {showContactModal && (
        <div className="fixed inset-0 bg-[#0F1F3D]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FDFBF7] rounded-xl shadow-2xl p-8 w-full max-w-[500px] border-4 border-[#C5A045] relative">
            
            <button 
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center mb-6">
              <div className="p-3 bg-[#0F1F3D] rounded-full mb-4 shadow-lg">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-serif font-bold text-[#0F1F3D]">Write to Rep. Nobis</h3>
              <p className="text-sm text-gray-500 text-center mt-2">
                Share an issue or ask a question. Our AI system will categorize it for the Representative to review.
              </p>
            </div>
            
            <form onSubmit={handleContactSubmit} className="space-y-4">
              
              {!showOtpInput ? (
                // Original Email and Message Form
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Email Address</label>
                    <input 
                      type="email" 
                      required
                      placeholder="citizen@example.com" 
                      className="w-full border-2 border-gray-200 bg-white rounded p-3 focus:border-[#0F1F3D] outline-none transition-all font-sans"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Your Message</label>
                    <textarea 
                      required
                      placeholder="I'm concerned about..." 
                      rows={4}
                      className="w-full border-2 border-gray-200 bg-white rounded p-3 focus:border-[#0F1F3D] outline-none transition-all font-sans resize-none"
                      value={contactMessage}
                      onChange={e => setContactMessage(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                // OTP Input Form
                <div className="mb-6">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 text-center">Enter 6-Digit Code</label>
                  <p className="text-xs text-gray-500 mb-4 text-center">
                    Please enter the verification code sent to <strong>{contactEmail}</strong>
                  </p>
                  <input 
                    type="text" 
                    required
                    placeholder="123456" 
                    maxLength={6}
                    className="w-full border-2 border-gray-200 bg-white rounded p-4 focus:border-[#0F1F3D] outline-none transition-all font-sans text-center tracking-[0.5em] text-2xl font-bold"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} // only allow numbers
                  />
                </div>
              )}

              {submitStatus && (
                <div className={`p-3 text-sm rounded border ${submitStatus.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                  {submitStatus.text}
                </div>
              )}
              
              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={isSubmitting || isSendingCode}
                  className="w-full bg-[#0F1F3D] text-white py-3 rounded font-bold uppercase tracking-wider hover:bg-[#1a2e55] transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-70"
                >
                  {isSendingCode ? 'Sending Code...' : isSubmitting ? 'Submitting...' : !showOtpInput ? (
                    <>
                      Send Message <Send className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Verify & Submit <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LOGIN MODAL --- */}
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

      {/* --- FLOATING ACTION BUTTON --- */}
      {!showContactModal && !isAuthenticated && (
        <button
          onClick={() => setShowContactModal(true)}
          className="fixed bottom-8 right-8 bg-[#0F1F3D] text-white p-4 rounded-full shadow-2xl hover:bg-[#1a2e55] hover:scale-105 transition-all flex items-center justify-center z-40 border-2 border-[#C5A045] group"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold uppercase text-sm tracking-wider group-hover:ml-3">
            Contact Rep
          </span>
        </button>
      )}

      {/* --- MAIN CONTENT --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* --- LEFT: ISSUES LIST --- */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-fit">
            <div className="p-6 pb-2">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <ListFilter className="w-5 h-5 text-[#C5A045]" />
                        <h2 className="text-xl font-serif font-bold text-[#0F1F3D]">Legislative Priorities & Progress</h2>
                    </div>
                    
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

            <div className="p-4 space-y-3">
              {visibleIssues.length > 0 ? (
                visibleIssues.map((issue) => (
                  <div key={issue.id} className="bg-white p-4 border border-[#E5E0D0] rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center justify-center min-w-[3rem]">
                            <span className="text-xl font-serif font-bold text-[#0F1F3D] leading-none">{issue.count}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Votes</span>
                        </div>
                        <div className="flex-1">
                            <div className="mb-1">
                                <span className="inline-block bg-[#0F1F3D] text-white text-[10px] font-bold px-2 py-0.5 rounded-full mb-1">
                                    {issue.category}
                                </span>
                                <h3 className="font-serif font-bold text-gray-900 leading-tight">{issue.issue}</h3>
                            </div>
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
                <button
                  onClick={() => setIsViewAll(!isViewAll)}
                  className="text-xs font-bold text-[#0F1F3D] uppercase tracking-widest hover:underline"
                >
                  {isViewAll ? "Show Top Priorities" : "View All Issues"}
                </button>
            </div>
          </div>

          {/* --- RIGHT: QUESTIONS LIST --- */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden h-fit">
            <div className="p-6 pb-2 border-b border-[#E5E0D0]">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#0F1F3D]" />
                  <h2 className="text-xl font-serif font-bold text-[#0F1F3D]">Constituent Questions</h2>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-[#8a7f6b]" />
                    <select
                      value={answerStatusFilter}
                      onChange={(e) => setAnswerStatusFilter(e.target.value)}
                      className="w-full pl-9 pr-2 py-2 border border-[#E5E0D0] rounded bg-[#FDFBF7] text-sm text-[#0F1F3D] font-medium focus:outline-none focus:border-[#C5A045] transition-all"
                    >
                      <option value="All">All Questions</option>
                      <option value="Answered">Answered</option>
                      <option value="Unanswered">Unanswered</option>
                    </select>
                  </div>
                  <div className="relative w-28">
                    <select
                      value={questionLimit}
                      onChange={(e) => setQuestionLimit(Number(e.target.value))}
                      className="w-full pl-3 pr-2 py-2 border border-[#E5E0D0] rounded bg-[#FDFBF7] text-sm text-[#0F1F3D] font-medium focus:outline-none focus:border-[#C5A045] transition-all"
                    >
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 bg-[#FDFBF7] min-h-[400px]">
              {visibleQuestions.length > 0 ? (
                visibleQuestions.map((q) => (
                  <div key={q.id} className="bg-[#F9F7F1] border border-[#E5E0D0] rounded-xl p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-serif font-bold text-gray-900 text-sm leading-tight">{q.question}</h3>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Asked {q.askedCount} times</span>
                      </div>
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full whitespace-nowrap ${q.answered ? 'bg-[#d9cba0] text-[#5c4d26]' : 'bg-[#e0d6c2] text-[#7a6e5a]'}`}>
                        {q.answered ? 'Answered' : 'Pending'}
                      </span>
                    </div>

                    <div className="bg-white border border-[#E5E0D0] rounded-lg p-4 relative shadow-inner">
                      <div className="absolute -top-2 left-6 w-4 h-4 bg-white border-t border-l border-[#E5E0D0] transform rotate-45"></div>

                      {q.answered ? (
                        <div className="text-sm text-gray-700">
                          <span className="font-bold text-green-700 mr-2">Reply:</span>
                          {q.answer}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">
                          <span className="font-bold text-gray-300 mr-2">Reply:</span>
                          No official response yet
                        </div>
                      )}

                      {isAuthenticated && (
                        <div className="mt-3 pt-2 border-t border-gray-100">
                          {editingQuestion === q.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={answerText}
                                onChange={(e) => setAnswerText(e.target.value)}
                                className="w-full p-2 text-sm border border-gray-300 rounded focus:border-[#C5A045] outline-none font-sans"
                                placeholder="Write official response..."
                                rows={3}
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingQuestion(null)} className="text-gray-500 text-xs uppercase font-bold px-3 py-1 hover:text-gray-800 transition-colors">
                                  Cancel
                                </button>
                                <button onClick={() => handleAnswerQuestion(q.id)} className="bg-[#0F1F3D] text-white px-4 py-1 rounded text-xs uppercase font-bold hover:bg-[#1a2e55] transition-colors">
                                  Save Response
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingQuestion(q.id); setAnswerText(q.answer); }}
                              className="text-xs text-[#C5A045] font-bold uppercase tracking-wider hover:underline"
                            >
                              {q.answered ? 'Edit Official Response' : 'Draft Official Response'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-500 italic font-serif bg-white/50 rounded-lg border-2 border-dashed border-gray-200">
                  {isLoading ? "Fetching data from archives..." : "No questions found matching these filters."}
                </div>
              )}
            </div>

            <div className="bg-[#FDFBF7] p-3 text-center border-t border-[#E5E0D0]">
              <button
                onClick={() => setIsViewAllQuestions(!isViewAllQuestions)}
                className="text-xs font-bold text-[#0F1F3D] uppercase tracking-widest hover:underline"
              >
                {isViewAllQuestions ? "Collapse to Top Questions" : `View All ${questions.length} Questions`}
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Nobis;