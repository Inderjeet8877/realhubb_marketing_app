"use client";

import {
  Image as ImageIcon, FileText, Phone, ArrowLeft, Video, MoreVertical, CheckCheck,
  ExternalLink, CornerUpLeft,
} from "lucide-react";

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

interface PreviewProps {
  businessName: string;
  headerType: string;
  headerContent: string;
  content: string;
  footerContent: string;
  buttons: TemplateButton[];
  /** Smaller frame for inline use (dropdown selections, side-by-side with a form).
   *  Default (false) is the full-size frame used in the standalone preview modal. */
  compact?: boolean;
}

// Renders a template the way it will actually look inside WhatsApp on a customer's phone.
export function TemplatePreviewPhone({
  businessName, headerType, headerContent, content, footerContent, buttons, compact = false,
}: PreviewProps) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`w-full mx-auto rounded-[1.75rem] bg-gray-900 shadow-xl overflow-hidden select-none ${
        compact ? "max-w-[220px] border-[4px]" : "max-w-[280px] border-[6px] border-gray-900"
      }`}
    >
      <div className={compact ? "h-3 bg-gray-900" : "h-5 bg-gray-900"} />

      {/* WhatsApp app header */}
      <div className="bg-[#075E54] px-2.5 py-2 flex items-center gap-2">
        <ArrowLeft className="w-3.5 h-3.5 text-white shrink-0" />
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
          {businessName.charAt(0).toUpperCase() || "R"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{businessName || "Your Business"}</p>
          {!compact && <p className="text-white/70 text-[9px]">Business Account</p>}
        </div>
        {!compact && (
          <>
            <Video className="w-3.5 h-3.5 text-white shrink-0" />
            <Phone className="w-3.5 h-3.5 text-white shrink-0" />
          </>
        )}
        <MoreVertical className="w-3.5 h-3.5 text-white shrink-0" />
      </div>

      {/* Chat area — capped height with internal scroll so long template bodies never
          blow up the surrounding layout (modal, dropdown, card) */}
      <div
        className={`p-2.5 overflow-y-auto flex flex-col justify-end ${compact ? "h-[260px]" : "h-[400px]"}`}
        style={{
          backgroundColor: "#e5ddd5",
          backgroundImage: "radial-gradient(circle at 8px 8px, rgba(0,0,0,0.035) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      >
        <div className="flex justify-end">
          <div className="max-w-[90%] w-full">
            <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm overflow-hidden">
              {headerType === "text" && headerContent && (
                <p className="font-semibold text-gray-900 text-xs px-2 pt-1.5">{headerContent}</p>
              )}
              {headerType === "image" && (
                <div className="bg-gray-200 aspect-video flex items-center justify-center overflow-hidden">
                  {headerContent ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={headerContent} alt="Header" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-400" />
                  )}
                </div>
              )}
              {headerType === "video" && headerContent && (
                <video src={headerContent} className="w-full aspect-video object-cover" />
              )}
              {headerType === "document" && (
                <div className="flex items-center gap-2 bg-white/60 mx-2 mt-2 p-1.5 rounded">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-[11px] text-gray-700 truncate">Document attachment</span>
                </div>
              )}

              <div className="px-2 pt-1.5 pb-1">
                <p className="text-[12px] text-gray-900 whitespace-pre-wrap leading-snug">
                  {content || "Your message will appear here..."}
                </p>
                {footerContent && <p className="text-[10px] text-gray-500 mt-1">{footerContent}</p>}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[9px] text-gray-500">{time}</span>
                  <CheckCheck className="w-3 h-3 text-[#53bdeb]" />
                </div>
              </div>
            </div>

            {buttons.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm mt-1 divide-y divide-gray-100 overflow-hidden">
                {buttons.map((btn, idx) => (
                  <div
                    key={idx}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-[12px] font-medium text-[#00a5f4]"
                  >
                    {btn.type === "URL" && <ExternalLink className="w-3 h-3" />}
                    {btn.type === "PHONE" && <Phone className="w-3 h-3" />}
                    {btn.type === "QUICK_REPLY" && <CornerUpLeft className="w-3 h-3" />}
                    {btn.text || "Button"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
