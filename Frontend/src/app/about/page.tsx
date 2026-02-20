import React from 'react';
import Navbar from '@/components/Navigation/Navbar';
import AboutSection from '@/components/About/AboutSection';

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <AboutSection />
    </div>
  );
}
