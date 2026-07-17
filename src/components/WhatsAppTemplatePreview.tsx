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
}

// Renders a template the way it will actually look inside WhatsApp on a customer's phone.
export function TemplatePreviewPhone({ businessName, headerType, headerContent, content, footerContent, buttons }: PreviewProps) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-xl overflow-hidden select-none">
      <div className="h-5 bg-gray-900" />

      {/* WhatsApp app header */}
      <div className="bg-[#075E54] px-3 py-2.5 flex items-center gap-2">
        <ArrowLeft className="w-4 h-4 text-white shrink-0" />
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {businessName.charAt(0).toUpperCase() || "R"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{businessName || "Your Business"}</p>
          <p className="text-white/70 text-[10px]">Business Account</p>
        </div>
        <Video className="w-4 h-4 text-white shrink-0" />
        <Phone className="w-4 h-4 text-white shrink-0" />
        <MoreVertical className="w-4 h-4 text-white shrink-0" />
      </div>

      {/* Chat area */}
      <div
        className="p-3 min-h-[420px] flex flex-col justify-end"
        style={{
          backgroundColor: "#e5ddd5",
          backgroundImage: "radial-gradient(circle at 8px 8px, rgba(0,0,0,0.035) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      >
        <div className="flex justify-end">
          <div className="max-w-[85%] w-full">
            <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm overflow-hidden">
              {headerType === "text" && headerContent && (
                <p className="font-semibold text-gray-900 text-sm px-2.5 pt-2">{headerContent}</p>
              )}
              {headerType === "image" && (
                <div className="bg-gray-200 aspect-video flex items-center justify-center overflow-hidden">
                  {headerContent ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={headerContent} alt="Header" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  )}
                </div>
              )}
              {headerType === "video" && headerContent && (
                <video src={headerContent} className="w-full aspect-video object-cover" />
              )}
              {headerType === "document" && (
                <div className="flex items-center gap-2 bg-white/60 mx-2 mt-2 p-2 rounded">
                  <FileText className="w-6 h-6 text-red-500 shrink-0" />
                  <span className="text-xs text-gray-700 truncate">Document attachment</span>
                </div>
              )}

              <div className="px-2.5 pt-1.5 pb-1">
                <p className="text-[13px] text-gray-900 whitespace-pre-wrap leading-snug">
                  {content || "Your message will appear here..."}
                </p>
                {footerContent && <p className="text-[11px] text-gray-500 mt-1">{footerContent}</p>}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <span className="text-[10px] text-gray-500">{time}</span>
                  <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                </div>
              </div>
            </div>

            {buttons.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm mt-1 divide-y divide-gray-100 overflow-hidden">
                {buttons.map((btn, idx) => (
                  <div
                    key={idx}
                    className="w-full flex items-center justify-center gap-2 py-2 text-[13px] font-medium text-[#00a5f4]"
                  >
                    {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                    {btn.type === "PHONE" && <Phone className="w-3.5 h-3.5" />}
                    {btn.type === "QUICK_REPLY" && <CornerUpLeft className="w-3.5 h-3.5" />}
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
