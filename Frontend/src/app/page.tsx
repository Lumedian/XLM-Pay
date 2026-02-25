'use client';

import React from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/Navigation/Navbar';
import { HeroSection } from '@/components/sections/HeroSection';

export default function Home() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.1, 0.25, 1] as const,
      },
    },
  };

  const features = [
    {
      title: 'AI-Powered Learning',
      description: 'Get personalized crypto education guidance powered by advanced AI technology.',
      icon: '🤖',
      href: '/academy',
    },
    {
      title: 'Stellar Ecosystem',
      description: 'Built on the robust Stellar blockchain network for fast, low-cost transactions.',
      icon: '⭐',
      href: '/academy',
    },
    {
      title: 'Expert Content',
      description: 'Access carefully selected learning materials from industry experts.',
      icon: '📚',
      href: '/academy',
    },
    {
      title: 'Interactive Learning',
      description: 'Engage with hands-on tutorials and practical exercises.',
      icon: '🎯',
      href: '/academy',
    },
  ];

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <HeroSection />

      {/* Features Section */}
      <section className="py-24 px-4 bg-black">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="text-center mb-20"
          >
            <motion.h2
              variants={itemVariants}
              className="text-4xl md:text-5xl font-serif text-white mb-6"
            >
              Why Choose Stellara?
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-xl text-white/60 max-w-2xl mx-auto"
            >
              Discover the features that make Stellara the premier platform for Web3 education
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Link href={feature.href}>
                  <Card className="h-full bg-white/5 backdrop-blur-xl border border-white/10 hover:border-blue-500/30 transition-all duration-300 cursor-pointer rounded-3xl overflow-hidden group">
                    <CardContent className="p-8 text-center flex flex-col h-full">
                      <div className="text-5xl mb-6 transform transition-transform group-hover:scale-110 duration-300">{feature.icon}</div>
                      <h3 className="text-2xl font-serif text-white mb-4">
                        {feature.title}
                      </h3>
                      <p className="text-white/50 leading-relaxed flex-grow">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 bg-black">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="bg-[#0012FF] rounded-[3rem] p-12 md:p-20 text-white text-center relative overflow-hidden shadow-2xl"
          >
            {/* Decorative background circle */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

            <motion.h2
              variants={itemVariants}
              className="text-4xl md:text-5xl font-serif mb-8 relative z-10"
            >
              Ready to Start Your Web3 Journey?
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-xl mb-10 text-white/80 max-w-2xl mx-auto relative z-10 font-light"
            >
              Join thousands of learners who are already mastering cryptocurrency and blockchain technology with Stellara.
            </motion.p>
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-6 justify-center relative z-10"
            >
              <Link href="/academy">
                <Button
                  variant="secondary"
                  size="lg"
                  className="px-10 py-4 rounded-full bg-white text-[#0012FF] hover:bg-gray-100 font-bold transition-all"
                >
                  Learn About Us
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="px-10 py-4 rounded-full border-2 border-white text-white hover:bg-white/10 font-bold transition-all"
              >
                Get Started
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
