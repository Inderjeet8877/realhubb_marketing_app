"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BarChart3, MessageSquare, Users, Radio, ShieldCheck,
  Zap, CheckCircle2, Loader2, Mail, Phone, Building2,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex justify-between items-center gap-2">
          <div className="text-lg sm:text-2xl font-bold text-blue-600 shrink-0">Realhubb</div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/auth/login"
              className="px-2.5 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base text-gray-700 font-medium hover:text-blue-600 whitespace-nowrap"
            >
              Sign In
            </Link>
            <a
              href="#enquiry"
              className="px-2.5 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap"
            >
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-4 py-20 text-center max-w-4xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" /> WhatsApp + Meta Ads, in one platform
          </span>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Marketing Automation
            <br />
            <span className="text-blue-600">Made Simple</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Run WhatsApp campaigns, track your Meta Ads performance, and manage every lead
            and conversation — all from one dashboard built for real businesses.
          </p>
          <div className="flex justify-center gap-4">
            <a href="#enquiry" className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2">
              Get Started <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/auth/login" className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<BarChart3 className="w-7 h-7" />}
            title="Meta Ads Analytics"
            description="Track campaign performance, spend, and leads with real-time analytics across every ad account."
          />
          <FeatureCard
            icon={<MessageSquare className="w-7 h-7" />}
            title="WhatsApp Bulk Send"
            description="Send personalized template messages to thousands of contacts, with delivery and read tracking."
          />
          <FeatureCard
            icon={<Users className="w-7 h-7" />}
            title="Contact & Lead Management"
            description="Organize contacts, tag audiences, and pull leads straight from your Meta lead-gen forms."
          />
          <FeatureCard
            icon={<Radio className="w-7 h-7" />}
            title="RCS Messaging"
            description="Rich, branded messages beyond plain SMS — coming soon to every connected number."
          />
          <FeatureCard
            icon={<ShieldCheck className="w-7 h-7" />}
            title="Number Quality Monitoring"
            description="Live WhatsApp quality-rating tracking, with plain-language reasons and fixes when it drops."
          />
          <FeatureCard
            icon={<Zap className="w-7 h-7" />}
            title="One-Click Meta Login"
            description="Connect your Facebook Business account once — campaigns, leads, and WhatsApp all sync automatically."
          />
        </div>
      </section>

      {/* Enquiry form */}
      <section id="enquiry" className="bg-gray-50 border-t border-gray-100">
        <div className="container mx-auto px-4 py-20 max-w-xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Get Started</h2>
            <p className="text-gray-600">Tell us about your business and we&apos;ll reach out to set you up.</p>
          </div>
          <EnquiryForm />
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Realhubb. All rights reserved.
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function EnquiryForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong. Please try again.");
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Thanks — we&apos;ve got it!</h3>
        <p className="text-gray-600">Our team will reach out to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
        <input
          type="text" required value={form.name} onChange={handleChange("name")}
          placeholder="Your name"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Email *
          </label>
          <input
            type="email" required value={form.email} onChange={handleChange("email")}
            placeholder="you@company.com"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Phone *
          </label>
          <input
            type="tel" required value={form.phone} onChange={handleChange("phone")}
            placeholder="+91 98765 43210"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Company
        </label>
        <input
          type="text" value={form.company} onChange={handleChange("company")}
          placeholder="Your business name"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
        <textarea
          rows={3} value={form.message} onChange={handleChange("message")}
          placeholder="Tell us a bit about what you're looking for"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
        {submitting ? "Submitting..." : "Submit Enquiry"}
      </button>
    </form>
  );
}
