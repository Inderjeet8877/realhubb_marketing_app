// Coded miniatures of real Broadzen screens for the landing page. Sample data,
// labelled; layouts mirror the product so nothing here promises a feature it lacks.

const muted = "text-[#A0AECC]";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-line bg-ink-2 p-4 sm:p-5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-white/90">{title}</span>
        <span className={`font-mono ${muted}`}>Sample data</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const report = [
  { k: "Sent", n: 1200, tone: "bg-white/70" },
  { k: "Delivered", n: 1164, tone: "bg-white/70" },
  { k: "Read", n: 902, tone: "bg-signal-cyan" },
  { k: "Replied", n: 148, tone: "bg-signal-mint" },
  { k: "Failed", n: 36, tone: "bg-[#F5A524]" },
];

export function BroadcastReportView() {
  return (
    <Frame title="Broadcast report · Weekend site visits">
      <ul className="space-y-3">
        {report.map(({ k, n, tone }) => (
          <li key={k} className="grid grid-cols-[84px_1fr_56px] items-center gap-3 text-sm">
            <span className="text-white/90">{k}</span>
            <span className="h-2 overflow-hidden rounded-full bg-ink">
              <span className={`block h-full rounded-full ${tone}`} style={{ width: `${(n / 1200) * 100}%` }} />
            </span>
            <span className="text-right font-mono text-white">{n.toLocaleString("en-IN")}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-4 border-t border-ink-line pt-3 text-xs ${muted}`}>
        <span className="text-[#F5A524]">36 failed:</span> 31 numbers aren&apos;t on WhatsApp, 5 opted out. They are skipped next time.
      </p>
    </Frame>
  );
}

const chats = [
  { name: "Priya S.", msg: "Yes, Saturday 11 am works.", from: "3 BHK lead ad", unread: 1, time: "10:44" },
  { name: "Rahul M.", msg: "Can you share the floor plan?", from: "Broadcast reply", unread: 2, time: "10:31" },
  { name: "Anita K.", msg: "Thank you, will visit with family", from: "2 BHK lead ad", unread: 0, time: "09:58" },
];

export function InboxView() {
  return (
    <Frame title="Inbox">
      <ul className="divide-y divide-ink-line">
        {chats.map((c) => (
          <li key={c.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-3 text-sm font-semibold text-white" aria-hidden>
              {c.name[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-white">{c.name}</p>
                <span className={`font-mono text-xs ${muted}`}>{c.time}</span>
              </div>
              <p className={`truncate text-sm ${muted}`}>{c.msg}</p>
              <span className="mt-1 inline-block rounded border border-ink-line px-1.5 py-0.5 text-[11px] text-white/80">From: {c.from}</span>
            </div>
            {c.unread > 0 && (
              <span className="mt-1 grid h-5 min-w-5 place-items-center rounded-full bg-signal-mint px-1.5 font-mono text-[11px] font-medium text-ink">
                <span className="sr-only">Unread: </span>{c.unread}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

const campaigns = [
  { name: "3 BHK · Wakad", spend: 4250, leads: 34, replies: 21 },
  { name: "2 BHK · Hinjewadi", spend: 6100, leads: 29, replies: 12 },
  { name: "Plots · Talegaon", spend: 2800, leads: 6, replies: 2 },
];

export function AdsView() {
  return (
    <Frame title="Meta Ads · last 7 days">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className={`text-left text-xs ${muted}`}>
              <th scope="col" className="px-1 pb-2 font-medium">Campaign</th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">Spend</th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">Leads</th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">Cost per lead</th>
              <th scope="col" className="px-1 pb-2 text-right font-medium">WhatsApp replies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-line font-mono text-white">
            {campaigns.map((c) => {
              const cpl = Math.round(c.spend / c.leads);
              return (
                <tr key={c.name}>
                  <td className="px-1 py-2.5 font-sans">{c.name}</td>
                  <td className="px-1 py-2.5 text-right">₹{c.spend.toLocaleString("en-IN")}</td>
                  <td className="px-1 py-2.5 text-right">{c.leads}</td>
                  <td className={`px-1 py-2.5 text-right ${cpl > 400 ? "text-[#F5A524]" : ""}`}>₹{cpl}</td>
                  <td className="px-1 py-2.5 text-right text-signal-soft">{c.replies}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}
