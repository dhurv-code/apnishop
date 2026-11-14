"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collectCod,
  DeliveryCompletion,
  getDeliveryCompletion,
  resendDeliveryOtp,
  startDelivery,
  verifyDeliveryOtp,
} from "@/lib/delivery-completion";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function DeliveryCompletionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<DeliveryCompletion | null>(null);
  const [otp, setOtp] = useState("");
  const [collectedAmount, setCollectedAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await getDeliveryCompletion(orderId);
      setOrder(result.data);
      setCollectedAmount((result.data.finalTotalPaise / 100).toFixed(2));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to load order.";
      setMessage(msg);
      if (msg.toLowerCase().includes("log in")) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    if (orderId) void load();
  }, [orderId, load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      const resultMessage =
        result && typeof result === "object" && "message" in result
          ? String(result.message)
          : "Action completed.";
      setMessage(resultMessage);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    if (!/^\d{6}$/.test(otp)) {
      setMessage("Enter the six-digit OTP provided by the customer.");
      return;
    }
    await run(() => verifyDeliveryOtp(orderId, otp));
    setOtp("");
  }

  async function handleCollectCod() {
    const rupees = Number(collectedAmount);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setMessage("Enter a valid collected amount.");
      return;
    }
    await run(() => collectCod(orderId, Math.round(rupees * 100)));
  }

  if (loading) return <main className="p-8">Loading order...</main>;

  if (!order) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p>{message || "Order not found."}</p>
        <Link href="/delivery" className="mt-4 inline-block underline">Back to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-xl space-y-6">
        <Link href="/delivery" className="text-sm font-medium text-green-700">← Back to delivery dashboard</Link>

        <header>
          <p className="text-sm font-semibold text-green-700">ApnaBasket</p>
          <h1 className="text-2xl font-bold">Delivery completion</h1>
          <p className="mt-1 text-sm text-gray-500">Order {order.orderNumber}</p>
        </header>

        {message && <div className="rounded-lg border bg-white p-3 text-sm">{message}</div>}

        <section className="space-y-2 rounded-xl border bg-white p-5">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Order status</span>
            <strong>{order.status.replaceAll("_", " ")}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Final order total</span>
            <strong>{money(order.finalTotalPaise)}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Payment</span>
            <strong>{order.paymentMethod} · {order.paymentStatus.replaceAll("_", " ")}</strong>
          </div>
        </section>

        {order.status === "READY_FOR_DELIVERY" && (
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Step 1 — Start delivery</h2>
            <p className="text-sm text-gray-600">
              This sends a one-time delivery code to the customer's registered phone number.
              The code expires after 10 minutes.
            </p>
            <button
              disabled={busy}
              onClick={() => run(() => startDelivery(orderId))}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Processing..." : "Start delivery and send OTP"}
            </button>
          </section>
        )}

        {order.status === "OUT_FOR_DELIVERY" && (
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Step 2 — Verify customer OTP</h2>
            <p className="text-sm text-gray-600">
              Ask the customer to read the six-digit code they received. Never guess or bypass this code.
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              className="w-full rounded-lg border px-3 py-3 text-lg tracking-[0.3em]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy || otp.length !== 6}
                onClick={handleVerifyOtp}
                className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Verify and mark delivered
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => resendDeliveryOtp(orderId))}
                className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
              >
                Resend OTP
              </button>
            </div>
            <p className="text-xs text-gray-500">Resending invalidates the previous code. A 60-second cooldown applies.</p>
          </section>
        )}

        {order.status === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus === "COD_PENDING" && (
          <section className="space-y-3 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Step 3 — Record cash collection</h2>
            <p className="text-sm text-gray-600">
              Delivery is verified. Collect the exact final amount from the customer, then record it here.
            </p>
            <label className="block text-sm font-medium" htmlFor="cod-amount">Cash collected (₹)</label>
            <input
              id="cod-amount"
              type="number"
              min="0"
              step="0.01"
              value={collectedAmount}
              onChange={(event) => setCollectedAmount(event.target.value)}
              className="w-full rounded-lg border px-3 py-3"
            />
            <p className="text-xs text-gray-500">Expected: {money(order.finalTotalPaise)}</p>
            <button
              disabled={busy}
              onClick={handleCollectCod}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Confirm COD collected
            </button>
          </section>
        )}

        {order.status === "DELIVERED" && order.paymentStatus === "COD_COLLECTED" && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-800">
            <h2 className="font-bold">Order delivered and COD collected</h2>
            <p className="mt-1 text-sm">Collection recorded: {money(order.finalTotalPaise)}</p>
          </div>
        )}

        {order.status === "DELIVERED" && order.paymentMethod !== "COD" && (
          <div className="rounded-xl border bg-white p-5">
            <h2 className="font-bold">Order delivered</h2>
            <p className="mt-1 text-sm text-gray-600">Delivery OTP verified. Payment status remains {order.paymentStatus} and is handled separately.</p>
          </div>
        )}
      </div>
    </main>
  );
}
