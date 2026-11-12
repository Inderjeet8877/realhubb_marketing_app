import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { Funnel } from "@/components/landing/Funnel";
import { EnquiryForm } from "@/components/landing/EnquiryForm";
import { AdsView, BroadcastReportView, InboxView } from "@/components/landing/ProductViews";

const muted = "text-[#A0AECC]";
const primaryCta =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-signal px-6 font-semibold text-ink transition-[filter,transform] duration-fast ease-out hover:brightness-110 active:scale-[0.99]";
const ghostCta =
  "inline-flex min-h-[48px] items-center justify-center rounded-lg border border-ink-line px-6 font-semibold text-white transition-colors duration-fast hover:border-white/40 hover:bg-white/5";

const path = [
  ["Lead ads", "Leads from your Facebook and Instagram Instant Forms arrive with the campaign they came from."],
  ["Contacts", "Leads join your contacts. Import CSV or Excel files too; duplicates are merged."],
  ["Broadcast", "Send a Meta-approved template to a list, and watch sent, delivered and read update live."],
  ["Inbox", "Replies land in one inbox, labelled with the ad or broadcast that started them."],
  ["Cost per lead", "Spend, leads and replies sit in one table, so you see which campaign is worth it."],
] as const;

const more = [
  "Template editor with a phone preview and a content check before you submit to Meta",
  "WhatsApp number quality rating and messaging tier, with plain reasons when it drops",
  "Opted-out numbers skipped automatically",
  "Lead export to CSV, broadcast reports with failure reasons",
  "An Android app for replies and broadcasts, coming soon to Google Play",
];

const trust = [
  ["Every account is reviewed by a person", "New sign-ups wait for approval before the workspace opens, so only real businesses send from Broadzen."],
  ["Your data stays in your workspace", "Each business's contacts, leads and conversations are separated at the database level. Other accounts cannot see them."],
  ["Meta's rules, shown plainly", "Template approval, quality rating, messaging limits and the 60-day Meta login are explained where they matter."],
] as const;

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-ink-line">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 id={`${id}-h`} className="max-w-2xl text-balance font-display text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
          {title}
        </h2>
        {intro && <p className={`mt-4 max-w-2xl text-lg ${muted}`}>{intro}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function Feature({ title, body, view, flip }: { title: string; body: string; view: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 md:grid-cols-2 md:gap-14">
      <div className={flip ? "md:order-2" : ""}>
        <h3 className="font-display text-2xl font-semibold text-white">{title}</h3>
        <p className={`mt-3 max-w-md ${muted}`}>{body}</p>
      </div>
      <div className="min-w-0">{view}</div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/90 backdrop-blur supports-[backdrop-filter]:bg-ink/75">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Broadzen home">
            <Image src="/brand/logo_dark.png" alt="Broadzen" width={160} height={34} priority className="h-6 w-auto sm:h-8" />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-white/80 md:flex">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#trust" className="hover:text-white">Privacy &amp; approval</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="inline-flex min-h-[44px] items-center whitespace-nowrap px-2 text-sm font-medium text-white/90 hover:text-white sm:px-3">
              Sign in
            </Link>
            <Link href="/signup" className={`${primaryCta} min-h-[44px] whitespace-nowrap px-3.5 text-sm`}>
              Request access
            </Link>
          </div>
        </nav>
      </header>

      <section aria-labelledby="hero-h">
        <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:pb-28 md:pt-24">
          <div>
            <h1 id="hero-h" className="text-balance font-display text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-6xl">
              From ad click to WhatsApp reply, in one place.
            </h1>
            <p className={`mt-6 max-w-xl text-lg leading-relaxed ${muted}`}>
              Broadzen puts your Meta lead ads, WhatsApp broadcasts and customer replies side by side, so you can see
              what each lead cost and who actually answered.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={primaryCta}>
                Request access <ArrowRight className="h-5 w-5" aria-hidden />
              </Link>
              <a href="#how" className={ghostCta}>See how it works</a>
            </div>
            <p className={`mt-6 max-w-md text-sm ${muted}`}>
              Every account is checked by a person before it opens. Prefer to talk first?{" "}
              <a href="#access" className="font-medium text-signal-soft underline-offset-4 hover:underline">Send us an enquiry</a>.
            </p>
          </div>
          <Funnel />
        </div>
      </section>

      <Section id="how" title="The whole path, not just the messages" intro="Most WhatsApp tools stop at sending. Broadzen follows a lead from the ad that found it to the reply that matters.">
        <ol className="relative grid gap-8 md:grid-cols-5 md:gap-6">
          <span aria-hidden className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-ink-line md:left-0 md:top-[7px] md:h-px md:w-full" />
          {path.map(([t, d], i) => (
            <li key={t} className="relative pl-8 md:pl-0 md:pt-8">
              <span
                aria-hidden
                className={`absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-ink md:top-0 ${i === path.length - 1 ? "bg-signal" : "bg-ink-line"}`}
              />
              <h3 className="font-display text-lg font-semibold text-white">{t}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="product" title="Built for the work you do every day">
        <div className="space-y-20 sm:space-y-28">
          <Feature
            title="See what every broadcast did"
            body="Sent, delivered, read, replied and failed, counted as they happen. Failures come with the reason, so a bad list gets cleaner every time you send."
            view={<BroadcastReportView />}
          />
          <Feature
            flip
            title="Reply from one inbox"
            body="Every WhatsApp conversation in one list, with unread counts and the ad or broadcast that started it. Answer from the web, and soon from the Android app."
            view={<InboxView />}
          />
          <Feature
            title="Know which ad is worth the money"
            body="Spend, leads and cost per lead from Meta, next to the WhatsApp replies those leads sent. Stop paying for campaigns that never talk back."
            view={<AdsView />}
          />
        </div>
        <ul className="mt-20 grid gap-x-10 gap-y-4 border-t border-ink-line pt-10 sm:grid-cols-2">
          {more.map((m) => (
            <li key={m} className="flex gap-3 text-white/90">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-signal-mint" aria-hidden />
              {m}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="trust" title="Reviewed accounts, private workspaces">
        <dl className="grid gap-10 md:grid-cols-3">
          {trust.map(([t, d]) => (
            <div key={t} className="border-t border-ink-line pt-6">
              <dt className="font-display text-lg font-semibold text-white">{t}</dt>
              <dd className={`mt-2 leading-relaxed ${muted}`}>{d}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="access" title="Get your workspace">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <p className={`max-w-md text-lg ${muted}`}>
              Create an account and a person reviews it before your workspace opens. We are finishing self-serve WhatsApp
              and Meta connection, so for now our team connects them with each new client. Or leave your details and we
              will call you.
            </p>
            <Link href="/signup" className={`${primaryCta} mt-8`}>
              Create an account <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <p className={`mt-4 text-sm ${muted}`}>
              Already approved? <Link href="/auth/login" className="font-medium text-signal-soft underline-offset-4 hover:underline">Sign in</Link>
            </p>
          </div>
          <EnquiryForm />
        </div>
      </Section>

      <footer className="border-t border-ink-line">
        <div className={`mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 ${muted}`}>
          <div className="flex items-center gap-3">
            <Image src="/brand/symbol.png" alt="" width={24} height={27} className="h-6 w-auto" />
            <span>Broadcast smarter. Grow faster.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white">Privacy policy</Link>
            <span>© {new Date().getFullYear()} Realhubb Ventures</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
