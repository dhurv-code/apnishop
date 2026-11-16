"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await requestOtp(
        phone.trim(),
        email.trim(),
        fullName.trim() || undefined
      );
      setStep("otp");
      setMessage(result.message || "Check your inbox for the verification code.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const user = await verifyOtp(phone.trim(), email.trim(), otp, fullName.trim() || undefined);

      if (user.role === "ADMIN") {
        router.replace("/admin");
      } else if (user.role === "DELIVERY_PARTNER") {
        router.replace("/delivery");
      } else if (user.role === "SHOPKEEPER") {
        router.replace("/");
      } else {
        router.replace("/");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f8f5] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-7 shadow-xl sm:p-9">
        <a href="/" className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-700 text-2xl">
            🛒
          </span>
          <span className="text-2xl font-extrabold text-green-800">ApnaBasket</span>
        </a>

        <h1 className="mt-9 text-2xl font-extrabold">
          {step === "details" ? "Welcome to ApnaBasket" : "Verify your email"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          {step === "details"
            ? "Enter your mobile number for delivery and your email to receive a free login code."
            : `Enter the six-digit code sent to ${email}.`}
        </p>

        {step === "details" ? (
          <form onSubmit={handleRequestOtp} className="mt-7 space-y-5">
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-semibold">
                Mobile number (delivery contact)
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="9876543210"
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-4 outline-none focus:border-green-700"
              />
              <p className="mt-2 text-xs text-gray-400">
                Enter your 10-digit Indian mobile number. Email OTP verifies your email, not this number.
              </p>
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold">
                Email address (login verification)
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                maxLength={255}
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-4 outline-none focus:border-green-700"
              />
            </div>

            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm font-semibold">
                Full name (required for new customers)
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                maxLength={120}
                className="w-full rounded-xl border border-gray-200 px-4 py-4 outline-none focus:border-green-700"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-700 py-4 font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {loading ? "Sending code..." : "Send free email code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-7 space-y-5">
            <div>
              <label htmlFor="otp" className="mb-2 block text-sm font-semibold">
                Six-digit email code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-green-700"
              />
            </div>

            <div>
              <label htmlFor="verifyName" className="mb-2 block text-sm font-semibold">
                Full name (required for new customers)
              </label>
              <input
                id="verifyName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                maxLength={120}
                className="w-full rounded-xl border border-gray-200 px-4 py-4 outline-none focus:border-green-700"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full rounded-xl bg-green-700 py-4 font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify email and login"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("details");
                setOtp("");
                setError("");
                setMessage("");
              }}
              className="w-full py-2 text-sm font-semibold text-green-700"
            >
              Change mobile number or email
            </button>
          </form>
        )}

        {message && (
          <div className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-gray-400">
          Email OTP verifies your email address. Your mobile number is retained for delivery contact.
        </p>

        <a href="/" className="mt-6 block text-center text-sm font-semibold text-green-700">
          ← Back to shopping
        </a>
      </div>
    </main>
  );
}
