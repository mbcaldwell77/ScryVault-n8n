import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import {
  ScanBarcode,
  Sparkles,
  ShoppingCart,
  BarChart3,
} from "lucide-react";

const features = [
  {
    icon: ScanBarcode,
    title: "Scan & Stage",
    description: "Scan barcodes or enter ISBNs. Auto-populate book metadata from Google Books.",
  },
  {
    icon: Sparkles,
    title: "AI Listing Generation",
    description: "Claude generates SEO-optimized eBay titles, descriptions, and condition notes from your photos.",
  },
  {
    icon: ShoppingCart,
    title: "One-Click Publish",
    description: "Publish directly to eBay via the Inventory API. ScryVault is your draft system.",
  },
  {
    icon: BarChart3,
    title: "Financial Tracking",
    description: "Track COGS, revenue, fees, and profit per item. Know which sources give the best ROI.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-vault-base">
      {/* Ambient glow effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-[600px] -translate-x-1/2 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute top-1/2 right-0 h-96 w-96 rounded-full bg-accent/3 blur-3xl" />
      </div>

      <div className="relative">
        {/* Nav */}
        <header className="flex items-center justify-between px-6 py-4 md:px-12">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center md:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-sm text-accent">
            <Sparkles className="h-4 w-4" />
            AI-Powered Book Listings
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-6xl">
            Scan. List. Sell.
            <br />
            <span className="text-gradient-accent">Effortlessly.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-text-muted">
            The inventory management platform built for collectible booksellers.
            Scan a barcode, let AI craft your listing, and publish to eBay in one click.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button size="lg" className="px-8">
                Start Free
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="lg" className="px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <div className="grid gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-panel group transition-all duration-300 hover:border-accent/20"
              >
                <div className="mb-4 inline-flex rounded-xl bg-accent/10 p-3">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 px-6 py-8 text-center text-sm text-text-muted">
          <p>&copy; {new Date().getFullYear()} ScryVault. Built for booksellers, by a bookseller.</p>
        </footer>
      </div>
    </div>
  );
}
