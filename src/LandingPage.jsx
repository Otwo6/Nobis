import React from 'react';
import './NobisLanding.css';

const NobisLanding = () => {
  // Logo SVG data URI stored as a constant for cleanliness
  const logoSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='95' fill='%23273e60'/%3E%3Ccircle cx='100' cy='100' r='90' fill='none' stroke='%23FDFBF7' stroke-width='3'/%3E%3Ccircle cx='100' cy='100' r='85' fill='none' stroke='%23FDFBF7' stroke-width='2'/%3E%3Cpath d='M 100 30 Q 120 50 130 70 Q 135 85 130 100 Q 125 120 115 135 Q 100 150 85 145 Q 70 140 65 125 Q 60 110 65 95 Q 70 80 75 70 Q 80 60 85 50 Q 90 40 100 30 Z' fill='%232d5a7b'/%3E%3Ccircle cx='110' cy='65' r='12' fill='%23FDFBF7'/%3E%3Ccircle cx='110' cy='65' r='6' fill='%231a1a1a'/%3E%3Cpath d='M 95 45 Q 90 40 85 42' fill='none' stroke='%232d5a7b' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M 120 50 Q 125 47 130 50' fill='none' stroke='%232d5a7b' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";

  return (
    <div className="nobis-page">
      <header className="header">
        <div className="header-logo-container">
          <img src="/CockadeNobis.png" alt="Nobis Logo" className="header-logo" style={{ width: '8%', height: '8%', objectFit: 'contain' }} />
          <span className="header-title">NOBIS</span>
        </div>
        <a href="#dashboard" className="header-btn">Dashboard</a>
      </header>

      <div className="strength-bar" />

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">For the People</div>
          <h1>Infrastructure for the People-Powered Campaign</h1>
          <p className="hero-subtitle">
            Close the gap between the people and the platform. Stop constituent concerns from disappearing into the "Black Hole".
          </p>
          <div className="cta-buttons">
            <a href="#demo" className="btn btn-primary">Request a Demo</a>
            <a href="#live" className="btn btn-secondary">View Live Dashboard</a>
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
          <div className="section-subtitle">The Broken System</div>
          <h2 className="section-title">
            Current Political Tech is Built for Consultants.<br />
            Nobis is Built for Neighbors.
          </h2>
        </div>
        <div className="pillars">
          <div className="pillar-card">
            <span className="pillar-icon">🕳️</span>
            <h3 className="pillar-title">The Black Hole</h3>
            <p className="pillar-text">
              Messages vanish without a trace, leaving constituents feeling unheard and disconnected from their representatives. Democracy dies in silence.
            </p>
          </div>
          <div className="pillar-card">
            <span className="pillar-icon">⚖️</span>
            <h3 className="pillar-title">The Manual Burden</h3>
            <p className="pillar-text">
              Staffers spend hours manually sorting thousands of DMs, emails, and calls—time that could be spent on real advocacy and organizing.
            </p>
          </div>
          <div className="pillar-card">
            <span className="pillar-icon">🔇</span>
            <h3 className="pillar-title">Disconnected Progress</h3>
            <p className="pillar-text">
              Neighbors rarely know when their concerns actually lead to action, creating a cycle of mistrust, cynicism, and disengagement.
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
            <h3 className="feature-title">AI-Automated Intake</h3>
            <p className="feature-text">
              Meet neighbors where they already are—on social media. Our AI categorizes DMs into actionable insights automatically. No manual sorting required. No voice unheard.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-number">02</div>
            <h3 className="feature-title">Public-Facing Transparency</h3>
            <p className="feature-text">
              A live dashboard allows your district to see that their issues are being heard—and what their neighbors care about most. Democracy made visible. Power made accountable.
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
            <h3 className="persona-title">Real-Time Pulse of Your District</h3>
            <p className="persona-text">
              See exactly what your district needs, categorized by priority—Healthcare, Housing, Education, Workers' Rights, Climate Justice, and more.
            </p>
          </div>
          <div className="persona-card">
            <div className="persona-label">For Campaign Staff</div>
            <h3 className="persona-title">Zero Manual Data Entry</h3>
            <p className="persona-text">
              AI handles the sorting, freeing you to focus on strategy, community advocacy, and organizing. Spend your time building relationships.
            </p>
          </div>
          <div className="persona-card">
            <div className="persona-label">For the Constituent</div>
            <h3 className="persona-title">True Accountability</h3>
            <p className="persona-text">
              No apps to download. No hoops to jump through. Just message an account and see your concern reflected live on the public dashboard.
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
          <a href="#beta" className="btn btn-primary">Become a Beta Partner</a>
        </div>
      </section>
    </div>
  );
};

export default NobisLanding;