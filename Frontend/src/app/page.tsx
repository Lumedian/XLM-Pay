'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/Navigation/Navbar';

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
  };

  const features = [
    {
      title: 'AI-Powered Learning',
      description: 'Get personalized crypto education guidance powered by advanced AI technology.',
      icon: '🤖',
      href: '/about',
    },
    {
      title: 'Stellar Ecosystem',
      description: 'Built on the robust Stellar blockchain network for fast, low-cost transactions.',
      icon: '⭐',
      href: '/about',
    },
    {
      title: 'Expert Content',
      description: 'Access carefully selected learning materials from industry experts.',
      icon: '📚',
      href: '/about',
    },
    {
      title: 'Interactive Learning',
      description: 'Engage with hands-on tutorials and practical exercises.',
      icon: '🎯',
      href: '/about',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="text-center"
          >
            <motion.h1
              variants={itemVariants}
              className="text-5xl md:text-7xl font-bold text-gray-900 mb-6"
            >
              Stellara <span className="text-blue-600">AI</span>
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed"
            >
              The intelligent Web3 crypto academy built on the Stellar ecosystem. 
              Start your journey into cryptocurrency and blockchain today.
            </motion.p>
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button variant="primary" size="lg" className="px-8">
                Get Started Free
              </Button>
              <Link href="/about">
                <Button variant="outline" size="lg" className="px-8">
                  Learn More
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="text-center mb-16"
          >
            <motion.h2
              variants={itemVariants}
              className="text-3xl md:text-4xl font-bold text-gray-900 mb-4"
            >
              Why Choose Stellara?
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-xl text-gray-600 max-w-2xl mx-auto"
            >
              Discover the features that make Stellara the premier platform for Web3 education
            </motion.p>
          </motion.div>
          
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <Link href={feature.href}>
                  <Card className="h-full bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer">
                    <CardContent className="p-6 text-center">
                      <div className="text-4xl mb-4">{feature.icon}</div>
                      <h3 className="text-xl font-bold text-gray-900 mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
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
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 md:p-16 text-white text-center"
          >
            <motion.h2
              variants={itemVariants}
              className="text-3xl md:text-4xl font-bold mb-6"
            >
              Ready to Start Your Web3 Journey?
            </motion.h2>
            <motion.p
              variants={itemVariants}
              className="text-xl mb-8 opacity-90 max-w-2xl mx-auto"
            >
              Join thousands of learners who are already mastering cryptocurrency and blockchain technology with Stellara.
            </motion.p>
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="/about">
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="px-8 bg-white text-blue-600 hover:bg-gray-100"
                >
                  Learn About Us
                </Button>
              </Link>
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 border-2 border-white text-white hover:bg-white hover:text-blue-600"
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
