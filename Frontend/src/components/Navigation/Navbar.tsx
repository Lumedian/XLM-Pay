'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';

const Navbar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Academy', href: '/academy' },
    { label: 'AI Assistant', href: '/ai-assistant' },
    { label: 'Community', href: '/community' },
    { label: 'Trade', href: '/trade' },
    { label: 'News', href: '/news' },
  ];

  return (
    <nav className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">
      <div className="w-full max-w-5xl bg-[#0012FF] rounded-full px-6 py-2 flex items-center justify-between shadow-2xl border border-white/10">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <span className="text-white font-bold text-xl tracking-tight">Strellara Ai</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-6">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-white/80 hover:text-white text-sm font-medium transition-colors duration-200"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Action Button */}
        <div className="hidden md:block">
          <Button 
            variant="wallet" 
            size="sm" 
            className="rounded-full border border-white/20 bg-black/20 hover:bg-black/40 text-white px-6"
          >
            Connect Wallet
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-4 right-4 bg-[#0012FF] rounded-3xl p-6 shadow-2xl border border-white/10 md:hidden flex flex-col space-y-4"
          >
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-white hover:bg-white/10 px-4 py-2 rounded-xl transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-white/10">
              <Button 
                variant="wallet" 
                size="md" 
                fullWidth 
                className="rounded-full border border-white/20 bg-black/20"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Connect Wallet
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
