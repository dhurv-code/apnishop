
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await requestOtp(phone, fullName.trim() || undefined);

      setStep("otp");
      setMessage(result.message || "OTP requested successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to request OTP."
      );
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
      const user = await verifyOtp(phone, otp, fullName);

      if (user.role === "ADMIN") {
        router.replace("/admin");
      } else if (user.role === "DELIVERY_PARTNER") {
        router.replace("/delivery");
      } else {
        router.replace("/");
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Verification failed."
      );
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

          <span className="text-2xl font-extrabold text-green-800">
            ApnaBasket
          </span>
        </a>

        <h1 className="mt-9 text-2xl font-extrabold">
          {step === "phone"
            ? "Welcome to ApnaBasket"
            : "Verify your mobile number"}
        </h1>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          {step === "phone"
            ? "Enter your mobile number to get started."
            : `Enter the six-digit OTP for ${phone}.`}
        </p>

        {step === "phone" ? (
          <form onSubmit={handleRequestOtp} className="mt-7 space-y-5">

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Mobile number
              </label>

              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="9876543210"
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-4 outline-none focus:border-green-700"
              />

              <p className="mt-2 text-xs text-gray-400">
                Enter your 10-digit Indian mobile number.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Full name (for new customers)
              </label>

              <input
                type="text"
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
              {loading ? "Please wait..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-7 space-y-5">

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Six-digit OTP
              </label>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, ""))
                }
                placeholder="000000"
                required
                className="w-full rounded-xl border border-gray-200 px-4 py-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-green-700"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Full name (required for new customers)
              </label>

              <input
                type="text"
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
              {loading ? "Verifying..." : "Verify and login"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError("");
                setMessage("");
              }}
              className="w-full py-2 text-sm font-semibold text-green-700"
            >
              Change mobile number
            </button>
          </form>
        )}

        {message && (
          <div className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-800">
            {message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-gray-400">
          By continuing, you agree to ApnaBasket's terms and privacy policy.
        </p>

        <a
          href="/"
          className="mt-6 block text-center text-sm font-semibold text-green-700"
        >
          ← Back to shopping
        </a>
      </div>
    </main>
  );
}
