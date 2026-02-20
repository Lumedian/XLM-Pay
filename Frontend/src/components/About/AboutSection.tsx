'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const AboutSection: React.FC = () => {
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
      description: 'Get personalized crypto education guidance powered by advanced AI technology tailored to your learning pace and goals.',
      icon: '🤖',
    },
    {
      title: 'Stellar Ecosystem',
      description: 'Built on the robust Stellar blockchain network, providing fast, low-cost transactions and comprehensive Web3 education.',
      icon: '⭐',
    },
    {
      title: 'Expert Curated Content',
      description: 'Access carefully selected learning materials from industry experts and experienced crypto practitioners.',
      icon: '📚',
    },
    {
      title: 'Interactive Learning',
      description: 'Engage with hands-on tutorials, real-world projects, and practical exercises to solidify your knowledge.',
      icon: '🎯',
    },
  ];

  const stats = [
    { number: '10K+', label: 'Active Learners' },
    { number: '500+', label: 'Learning Modules' },
    { number: '50+', label: 'Expert Instructors' },
    { number: '95%', label: 'Success Rate' },
  ];

  return (
    <section className="py-20 px-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="text-center mb-16"
        >
          <motion.h1
            variants={itemVariants}
            className="text-5xl md:text-6xl font-bold text-gray-900 mb-6"
          >
            About <span className="text-blue-600">Stellara</span>
          </motion.h1>
          <motion.p
            variants={itemVariants}
            className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
          >
            The intelligent Web3 crypto academy built on the Stellar ecosystem. 
            We're revolutionizing how people learn about cryptocurrency and blockchain technology.
          </motion.p>
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-blue-600 mb-2">
                {stat.number}
              </div>
              <div className="text-gray-600 font-medium">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Mission Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="mb-20"
        >
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <motion.div variants={itemVariants}>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                    Our Mission
                  </h2>
                  <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                    At Stellara, we believe that cryptocurrency and blockchain education should be 
                    accessible, engaging, and effective for everyone, regardless of their technical background.
                  </p>
                  <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                    We're committed to democratizing Web3 education by providing world-class learning 
                    experiences that combine cutting-edge AI technology with expert-curated content.
                  </p>
                  <Button variant="primary" size="lg" className="px-8">
                    Start Your Journey
                  </Button>
                </motion.div>
                <motion.div
                  variants={itemVariants}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-600 rounded-2xl transform rotate-3"></div>
                  <div className="relative bg-white rounded-2xl p-8 shadow-lg">
                    <div className="text-6xl mb-4 text-center">🚀</div>
                    <h3 className="text-2xl font-bold text-center text-gray-900 mb-4">
                      Future of Learning
                    </h3>
                    <p className="text-gray-600 text-center">
                      Join thousands of learners already transforming their understanding of Web3
                    </p>
                  </div>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="mb-20"
        >
          <motion.div
            variants={itemVariants}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose Stellara?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Discover the features that make Stellara the premier platform for Web3 education
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="h-full bg-white/70 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
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
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="text-center"
        >
          <motion.div
            variants={itemVariants}
            className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 md:p-16 text-white"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Start Your Web3 Journey?
            </h2>
            <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
              Join thousands of learners who are already mastering cryptocurrency and blockchain technology with Stellara.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                variant="secondary" 
                size="lg" 
                className="px-8 bg-white text-blue-600 hover:bg-gray-100"
              >
                Get Started Free
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 border-2 border-white text-white hover:bg-white hover:text-blue-600"
              >
                Learn More
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default AboutSection;
