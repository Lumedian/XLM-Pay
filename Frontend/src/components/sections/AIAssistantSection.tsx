'use client';
import Image from 'next/image';

export function AIAssistantSection() {
  return (
    <section className="bg-black min-h-screen flex items-center justify-center px-6 py-20">
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-20 items-center">
        
        {/* Left Column */}
        <div className="space-y-12 lg:space-y-16 text-center lg:text-right">
          <p className="text-[#DDDDDD] text-base md:text-lg leading-relaxed font-light">
            Learn crypto the smart way with guided lessons, quizzes, and real explanations powered by AI — from beginner basics to advanced trading concepts.
          </p>
          <p className="text-[#DDDDDD] text-base md:text-lg leading-relaxed font-light">
            Join a social crypto community to share ideas, discuss trends, and connect with traders, builders, and educators in real time.
          </p>
        </div>

        {/* Center - AI Head */}
        <div className="flex justify-center">
          <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
            <Image
              src="/ai-head.png"
              alt="Stellara AI"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-12 lg:space-y-16 text-center lg:text-left">
          <p className="text-[#DDDDDD] text-base md:text-lg leading-relaxed font-light">
            Chat or speak with Stellara AI to understand markets, strategies, and Stellar tools — available 24/7 to guide your learning journey.
          </p>
          <p className="text-[#DDDDDD] text-base md:text-lg leading-relaxed font-light">
            Connect your wallet, explore Stellar assets, track your portfolio, and move from learning to real on-chain trading seamlessly.
          </p>
        </div>
      </div>
    </section>
  );
}
