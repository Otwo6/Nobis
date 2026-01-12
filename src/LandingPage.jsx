import React, { useState, useEffect } from 'react';
import './NobisLanding.css';

const NobisLanding = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', organization: '' });
  const [submitted, setSubmitted] = useState(false);

  const toggleModal = (e) => {
    if (e) e.preventDefault();
    setIsModalOpen(!isModalOpen);
    setSubmitted(false);
  };

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isModalOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const response = await fetch("https://formspree.io/f/xqeekkga", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setSubmitted(true);
    } else {
      alert("Something went wrong. Please try again!");
    }
  };

  return (
    <div className="nobis-page">
      <header className="header">
        <div className="header-logo-container">
          <img src="/CockadeNobis.png" alt="Nobis Logo" className="header-logo" />
          <span className="header-title">NOBIS</span>
        </div>
        <a href="dashboard" className="header-btn">Dashboard</a>
      </header>

      <div className="strength-bar" />

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">For the People</div>
          <h1>Infrastructure for People-Powered Campaigns</h1>
          <p className="hero-subtitle">
            Closing the gap between the people and the platform. Stopping constituent concerns from disappearing into black holes.
          </p>
          <div className="cta-buttons">
            <button onClick={toggleModal} className="btn btn-primary">Schedule a Demo</button>
            <a href="#live" className="btn btn-secondary">View Dashboard</a>
          </div>
        </div>
        <div className="scroll-indicator">
          <svg viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </div>
      </section>

      <section className="section problem-section">
        <div className="section-header">
          <div className="section-subtitle">The System is Broken</div>
          <h2 className="section-title">
            Current Politics Focuses on the Elite.<br />
            Nobis is Built for Our Neighbors.
          </h2>
        </div>
        <div className="pillars">
          <div className="pillar-card">
            <span className="pillar-icon">🕳️</span>
            <h3 className="pillar-title">The Black Hole</h3>
            <p className="pillar-text">
              When you call a representative, you only get to speak with interns. When you send an email, you won't get a timely response. This lack of transparency and representation leaves people feeling abandoned by the system.
            </p>
          </div>
          <div className="pillar-card">
            <span className="pillar-icon">⚖️</span>
            <h3 className="pillar-title">The Burden</h3>
            <p className="pillar-text">
              Staffers and interns spend hours manually sorting through thousands of data points from messages and phone calls. This time can be better spent strategizing future political movements and helping your constituents.
            </p>
          </div>
          <div className="pillar-card">
            <span className="pillar-icon">🔇</span>
            <h3 className="pillar-title">The Disconnect</h3>
            <p className="pillar-text">
              Neighbors rarely know when their concerns lead to action or progress. This creates a vicious cycle of mistrust, cynicism, and disengagement.
            </p>
          </div>
        </div>
      </section>

      <section className="section solutions-section">
        <div className="section-header">
          <div className="section-subtitle">The Nobis Solution</div>
          <h2 className="section-title">Technology That Serves the People</h2>
        </div>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-number">01</div>
            <h3 className="feature-title">AI-Automated Categorization</h3>
            <p className="feature-text">
              Meet neighbors where they already are, on social media. Our AI categorizes your constituents' DMs into insights automatically sorting your most vocal concerns. No voice is left unheard.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-number">02</div>
            <h3 className="feature-title">Public-Facing Transparency</h3>
            <p className="feature-text">
              A live dashboard allows your district to see that their issues are being heard and what their neighbors care about most. Democracy made visible. Power made accountable.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-number">03</div>
            <h3 className="feature-title">Closing the Loop</h3>
            <p className="feature-text">
              Automatically notify constituents via DM the moment their issue is resolved or acted upon. True accountability in action. Real results delivered to real people.
            </p>
          </div>
        </div>
      </section>

      <section className="section personas-section">
        <div className="section-header">
          <div className="section-subtitle">Built For Everyone</div>
          <h2 className="section-title">Who is Nobis For?</h2>
        </div>
        <div className="persona-grid">
          <div className="persona-card">
            <div className="persona-label">For the Candidate</div>
            <h3 className="persona-title">Real-Time Look of Your District</h3>
            <p className="persona-text">
              See what your constituents' want, categorized by priority, Healthcare, Housing, Education, Workers' Rights, Climate Justice, and more.
            </p>
          </div>
          <div className="persona-card">
            <div className="persona-label">For Campaign Staff</div>
            <h3 className="persona-title">Zero Manual Data Entry</h3>
            <p className="persona-text">
              AI handles the sorting and categorization, freeing you to focus on strategy, community advocacy, and organizing. Spend your time building relationships instead of data sheets.
            </p>
          </div>
          <div className="persona-card">
            <div className="persona-label">For the Constituent</div>
            <h3 className="persona-title">True Accountability</h3>
            <p className="persona-text">
              No apps to download. No hoops to jump through. Just message an account and see you and your neighbors' concerns reflected live on the public dashboard.
            </p>
          </div>
        </div>
      </section>

      <section className="section mission-section">
        <div className="mission-content">
          <div className="section-subtitle">Our Mission</div>
          <div className="mission-quote">
            As a YDSA software engineer, I built Nobis to empower the ignored. It is for representatives who believe every constituent deserves a voice.
            <div className="mission-author">Josh Widby</div>
            <div className="mission-role">Founder & Engineer</div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="final-cta-content">
          <h2>Ready to Build a More Democratic Office?</h2>
          <p>Join our beta program and lead the most transparent, accountable campaign in your district.</p>
          <button onClick={toggleModal} className="btn btn-primary">Schedule a Demo</button>
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-overlay" onClick={toggleModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={toggleModal}>&times;</button>
            
            {!submitted ? (
              <div className="modal-inner">
                <h3>Request a Nobis Demo</h3>
                <p>Join the future of constituent engagement.</p>
                <form onSubmit={handleSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Campaign Email</label>
                    <input 
                      type="email" 
                      required 
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Organization / District</label>
                    <input 
                      type="text" 
                      required 
                      onChange={(e) => setFormData({...formData, org: e.target.value})}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block">Send Request</button>
                </form>
              </div>
            ) : (
              <div className="modal-success">
                <div className="success-icon">✓</div>
                <h3>Request Sent!</h3>
                <p>Thanks, {formData.name}. We'll reach out to <strong>{formData.email}</strong> shortly.</p>
                <button onClick={toggleModal} className="btn btn-secondary">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NobisLanding;