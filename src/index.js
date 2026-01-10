import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './LandingPage'; 
import Nobis from './PublicProblems';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <Routes>
        {/* Landing Page is the default (home) */}
        <Route path="/" element={<Landing />} />
        
        {/* Dashboard Page */}
        <Route path="/dashboard" element={<Nobis />} />
      </Routes>
    </Router>
  </React.StrictMode>
);