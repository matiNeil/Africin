"use client";

import { useState } from "react";
import Image from "next/image";
import { Content } from "@/lib/data";

interface PaywallModalProps {
  content: Content;
  onSuccess: () => void;
  onClose?: () => void;
}

type PaymentMethod = "card" | "flutterwave" | "ecocash" | "innbucks";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
  { id: "card",        label: "Card",          icon: "💳", description: "Visa / Mastercard / Amex" },
  { id: "flutterwave", label: "Flutterwave",    icon: "🦋", description: "Pan-African payments" },
  { id: "ecocash",     label: "EcoCash",        icon: "📱", description: "Zimbabwe mobile money" },
  { id: "innbucks",    label: "InnBucks",       icon: "💚", description: "Zimbabwe — InnBucks wallet" },
];

export default function PaywallModal({ content, onSuccess, onClose }: PaywallModalProps) {
  const [step, setStep] = useState<"choose" | "pay" | "loading" | "success">("choose");
  const [method, setMethod] = useState<PaymentMethod>("card");

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");

  // Mobile money
  const [phone, setPhone] = useState("");

  const price = content.price ?? 0;
  const currency = content.currency ?? "USD";
  const isUpcoming = content.premiereDate
    ? new Date(content.premiereDate).getTime() > Date.now()
    : false;

  const handlePay = () => {
    setStep("loading");
    setTimeout(() => setStep("success"), 2200);
  };

  const handleSuccessDone = () => {
    // Store in localStorage so the watch page knows it's unlocked
    const purchases: string[] = JSON.parse(
      localStorage.getItem("africin_purchases") ?? "[]"
    );
    if (!purchases.includes(content.id)) purchases.push(content.id);
    localStorage.setItem("africin_purchases", JSON.stringify(purchases));
    onSuccess();
  };

  const formatCard = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

  const formatExpiry = (v: string) =>
    v.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2");

  const isCardComplete =
    cardNumber.replace(/\s/g, "").length === 16 &&
    expiry.length === 5 &&
    cvv.length >= 3 &&
    name.trim().length > 1;

  const isMobileComplete = phone.replace(/\D/g, "").length >= 9;

  const canPay =
    method === "card" ? isCardComplete
    : method === "flutterwave" ? true
    : isMobileComplete;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative bg-gray-950 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Close button */}
        {onClose && step !== "loading" && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* ── Success state ── */}
        {step === "success" && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-bold mb-1">Payment Successful!</h2>
            <p className="text-gray-400 text-sm mb-1">You now have access to</p>
            <p className="text-orange-400 font-semibold mb-6">{content.title}</p>
            <button
              onClick={handleSuccessDone}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Watch Now
            </button>
          </div>
        )}

        {/* ── Loading state ── */}
        {step === "loading" && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mb-4" />
            <p className="text-white font-semibold">Processing payment…</p>
            <p className="text-gray-400 text-sm mt-1">Please wait</p>
          </div>
        )}

        {/* ── Choose method ── */}
        {step === "choose" && (
          <>
            {/* Zimbabwe origin badge */}
            <div className="flex items-center gap-2 px-5 pt-4">
              <span className="text-lg">🇿🇼</span>
              <span className="text-xs font-semibold tracking-wider text-amber-400 uppercase">From Zimbabwe</span>
            </div>

            {/* Header with content info */}
            <div className="relative h-28 overflow-hidden mt-2">
              <Image
                src={content.backdrop}
                alt={content.title}
                fill
                className="object-cover opacity-40"
                sizes="448px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex items-center gap-2 mb-1">
                  {content.premiere && (
                    <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                      PREMIERE
                    </span>
                  )}
                  {content.ppv && !content.premiere && (
                    <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                      PAY PER VIEW
                    </span>
                  )}
                </div>
                <h2 className="text-white font-bold text-lg leading-tight">{content.title}</h2>
              </div>
            </div>

            <div className="p-5">
              {/* Price */}
              <div className="flex items-center justify-between mb-5 bg-white/5 rounded-xl px-4 py-3">
                <span className="text-gray-300 text-sm">Access price</span>
                <span className="text-white font-bold text-xl">
                  {currency} {price.toFixed(2)}
                </span>
              </div>

              {isUpcoming && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-orange-300">
                  🎬 This is an upcoming premiere. Payment will be charged on premiere day.
                </div>
              )}

              {/* Method selection */}
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
                Pay with
              </p>
              <p className="text-amber-500/70 text-[10px] mb-2 flex items-center gap-1">
                <span>🇿🇼</span> Accepts Zimbabwean payment methods
              </p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      method === m.id
                        ? "border-orange-500 bg-orange-500/10"
                        : "border-white/10 bg-white/5 hover:border-white/30"
                    }`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{m.label}</p>
                      <p className="text-gray-500 text-[10px] truncate">{m.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep("pay")}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {/* ── Payment form ── */}
        {step === "pay" && (
          <div className="p-5">
            <button
              onClick={() => setStep("choose")}
              className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex items-center gap-2 mb-5">
              <span className="text-2xl">
                {PAYMENT_METHODS.find((m) => m.id === method)?.icon}
              </span>
              <div>
                <h3 className="text-white font-semibold">
                  {PAYMENT_METHODS.find((m) => m.id === method)?.label}
                </h3>
                <p className="text-gray-400 text-xs">
                  {PAYMENT_METHODS.find((m) => m.id === method)?.description}
                </p>
              </div>
            </div>

            {method === "flutterwave" && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-amber-300">
                🦋 You will be redirected to Flutterwave to complete your payment securely.
              </div>
            )}

            {method === "card" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Name on card</label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Card number</label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCard(e.target.value))}
                    className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">CVV</label>
                    <input
                      type="password"
                      placeholder="•••"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>
            ) : method === "flutterwave" ? (
              <div className="text-gray-400 text-sm text-center py-4">
                Click <span className="text-white font-semibold">Pay</span> below to be redirected to Flutterwave.
              </div>
            ) : (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">
                  {method === "ecocash" ? "EcoCash" : "InnBucks"} number
                </label>
                <input
                  type="tel"
                  placeholder={method === "ecocash" ? "+263 77 000 0000" : "+263 71 000 0000"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 text-white placeholder-gray-600 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-gray-500 text-xs mt-2">
                  You will receive a USSD prompt on your Zimbabwean number to confirm.
                </p>
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={!canPay}
              className={`w-full mt-5 font-semibold py-3 rounded-xl transition-colors ${
                canPay
                  ? "bg-orange-600 hover:bg-orange-500 text-white"
                  : "bg-white/10 text-gray-500 cursor-not-allowed"
              }`}
            >
              Pay {currency} {price.toFixed(2)}
            </button>

            <p className="text-gray-600 text-xs text-center mt-3">
              🔒 Secured by 256-bit SSL encryption
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
