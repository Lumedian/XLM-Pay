import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

const featurePills = [
  { label: "AI-Powered Crypto Education", icon: "/Aipowered.png" },
  { label: "Stellar Blockchain", icon: "/stellaricon.png" },
  { label: "Community & Social", icon: "/community.png" },
  { label: "Trading & Wallet", icon: "/tradingicon.png" },
];

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-16 bg-black overflow-hidden">
      {/* Background Decorative Element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl aspect-square bg-[radial-gradient(circle_at_50%_50%,rgba(34,40,214,0.15),transparent_70%)] blur-3xl" />

      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col space-y-8 animate-in fade-in slide-in-from-left duration-700">
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[1.1] text-white">
              <span className="text-[#3D66FF]">Learn.</span> Trade. Connect.
              <br />
              Powered by AI on <span className="text-[#3D66FF]">Stellar</span>.
            </h1>

            <p className="max-w-xl text-lg sm:text-xl text-white/70 leading-relaxed">
              Stellara AI is an all-in-one Web3 academy combining AI-powered
              learning, social crypto insights, and real on-chain trading -
              built on Stellar.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Button variant="primary" className="rounded-full px-8 py-6 bg-[#0012FF] hover:bg-blue-700">
                Get Started
              </Button>
              <Button variant="outline" className="rounded-full px-8 py-6 border-white/20 text-white hover:bg-white/10">
                Learn More
              </Button>
            </div>
          </div>

          <div className="relative aspect-square w-full max-w-[600px] mx-auto animate-in fade-in zoom-in duration-700 delay-200">
            <div className="absolute inset-0 rounded-full bg-blue-600/10 blur-[100px]" />
            <div className="relative h-full w-full rounded-[42px] overflow-hidden border border-white/5 shadow-2xl">
              <Image
                src="/hero-image.jpg"
                alt="Stellara AI hero visual"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 pt-12 border-t border-white/5">
          {featurePills.map((feature) => (
            <div
              key={feature.label}
              className="flex items-center gap-3 group cursor-default transition-transform hover:scale-105"
            >
              <div className="p-2 rounded-lg bg-white/5 border border-white/10 group-hover:border-blue-500/50 transition-colors">
                <Image
                  src={feature.icon}
                  alt={`${feature.label} icon`}
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              </div>
              <span className="text-white/80 group-hover:text-white transition-colors text-sm sm:text-base font-medium">
                {feature.label}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
