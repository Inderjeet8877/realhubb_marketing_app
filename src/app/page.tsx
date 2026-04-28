import Link from "next/link";
import { ArrowRight, BarChart3, MessageSquare, Users } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <nav className="flex justify-between items-center mb-20">
          <div className="text-2xl font-bold text-blue-600">Realhubb</div>
          <div className="space-x-4">
            <Link
              href=" /auth/login"
              className="px-6 py-2 text-blue-600 font-medium hover:text-blue-800"
            >
              Sign In
            </Link>
            <Link
              href=" /auth/login"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </nav>

        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Marketing Automation
            <br />
            <span className="text-blue-600">Made Simple</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10">
            Manage your Meta Ads and WhatsApp campaigns in one place.
            Track performance, send bulk messages, and grow your business.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href=" /auth/login"
              className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2"
            >
              Start Free <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400">
              Watch Demo
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <FeatureCard
            icon={<BarChart3 className="w-8 h-8" />}
            title="Meta Ads Analytics"
            description="Track your ad performance with real-time analytics and insights"
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="WhatsApp Bulk Send"
            description="Send personalized messages to thousands of contacts instantly"
          />
          <FeatureCard
            icon={<Users className="w-8 h-8" />}
            title="Contact Management"
            description="Organize and tag your contacts for targeted campaigns"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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
