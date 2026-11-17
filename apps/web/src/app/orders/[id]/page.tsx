"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrder, type OrderDetails, type OrderEvent } from "@/lib/orders";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function eventTitle(event: OrderEvent) {
  const labels: Record<string, string> = {
    ORDER_PLACED: "Order placed",
    ORDER_CONFIRMED: "Order confirmed by ApnaBasket",
    SHOP_ASSIGNED: "Local shop assigned",
    DELIVERY_PARTNER_ASSIGNED: "Delivery partner assigned",
    DELIVERY_ACCEPTED: "Delivery partner accepted the order",
    SHOPPING_STARTED: "Partner started shopping",
    ITEM_PURCHASED: "Item purchased",
    ITEM_UNAVAILABLE: "An item is unavailable",
    SUBSTITUTION_REQUESTED: "Replacement approval requested",
    SUBSTITUTION_APPROVED: "Replacement approved",
    SUBSTITUTION_REJECTED: "Replacement rejected",
    SHOPPING_COMPLETED: "Shopping completed; final bill prepared",
    DELIVERY_STARTED: "Order is out for delivery",
    ORDER_DELIVERED: "Delivery verified",
    COD_COLLECTED: "Cash payment recorded",
    ORDER_CANCELLED: "Order cancelled",
  };

  if (labels[event.eventType]) return labels[event.eventType];
  if (event.newStatus) return event.newStatus.replaceAll("_", " ");
  return event.eventType.replaceAll("_", " ").toLowerCase();
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CustomerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const result = await getOrder(orderId);
      setOrder(result);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load order.";
      setError(message);
      if (message.toLowerCase().includes("authentication required")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    if (!orderId) return;
    void load(true);
    const timer = window.setInterval(() => void load(false), 15000);
    return () => window.clearInterval(timer);
  }, [orderId, load]);

  if (loading) {
    return <main className="min-h-screen bg-[#f8faf8] p-8 text-center">Loading your order...</main>;
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-[#f8faf8] px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center">
          <h1 className="text-xl font-bold">Unable to load order</h1>
          <p className="mt-3 text-sm text-gray-600">{error || "Order not found."}</p>
          <Link href="/orders" className="mt-6 inline-block font-semibold text-green-700">Back to my orders</Link>
        </div>
      </main>
    );
  }

  const address = [
    order.addressLine1,
    order.addressLine2,
    order.locality,
    order.landmark ? `Near ${order.landmark}` : null,
    order.city,
    order.district,
    order.state,
    order.postalCode,
  ].filter(Boolean).join(", ");
  const isFinal = ["DELIVERED", "CANCELLED", "FAILED"].includes(order.status);

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/orders" className="text-sm font-semibold text-green-700">← My orders</Link>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">ApnaBasket order</p>
              <h1 className="mt-1 text-2xl font-extrabold">{order.orderNumber}</h1>
              <p className="mt-1 text-sm text-gray-500">Placed {new Date(order.createdAt).toLocaleString("en-IN")}</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-green-800">{statusLabel(order.status)}</span>
          </div>
          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Latest status</p>
            <p className="mt-1 text-lg font-bold">{statusLabel(order.status)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {isFinal ? "This order has reached its final status." : "Status updates refresh automatically while this page is open."}
              {lastUpdated ? ` Last checked ${lastUpdated.toLocaleTimeString("en-IN")}.` : ""}
            </p>
          </div>
          <button type="button" onClick={() => void load(true)} className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold">Refresh status</button>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">Order tracking</h2>
          {order.events.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Tracking updates will appear here as the order is processed.</p>
          ) : (
            <ol className="mt-5 space-y-4">
              {order.events.map((event, index) => (
                <li key={event.id} className="relative flex gap-3">
                  <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === order.events.length - 1 ? "bg-green-700 text-white" : "bg-green-100 text-green-800"}`}>{index + 1}</span>
                  <div className="min-w-0 flex-1 border-b border-gray-100 pb-4 last:border-0">
                    <p className="font-semibold">{eventTitle(event)}</p>
                    {event.newStatus && <p className="mt-1 text-xs text-gray-500">Status: {statusLabel(event.newStatus)}</p>}
                    <p className="mt-1 text-xs text-gray-400">{new Date(event.createdAt).toLocaleString("en-IN")}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">Items ordered</h2>
          <div className="mt-4 divide-y divide-gray-100">
            {order.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{item.productNameSnapshot}</p>
                  <p className="text-sm text-gray-500">Qty: {item.requestedQuantity} {item.unitLabelSnapshot}</p>
                  <p className="text-xs text-gray-500">{statusLabel(item.status)}</p>
                </div>
                <p className="font-semibold">{money(item.actualLineTotalPaise > 0 ? item.actualLineTotalPaise : Math.round(item.estimatedUnitPricePaise * item.requestedQuantity))}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Estimated subtotal</span><strong>{money(order.itemSubtotalEstimatedPaise)}</strong></div>
            {order.priceFinalizedAt ? <div className="flex justify-between"><span className="text-gray-500">Final amount</span><strong>{money(order.finalTotalPaise)}</strong></div> : <p className="text-xs text-gray-500">Final product prices are confirmed after the partner shops.</p>}
            <div className="flex justify-between"><span className="text-gray-500">Payment</span><strong>{order.paymentMethod} · {statusLabel(order.paymentStatus)}</strong></div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-extrabold">Delivery address</h2>
          <p className="mt-3 font-semibold">{order.recipientName}</p>
          <p className="mt-1 text-sm leading-6 text-gray-600">{address}</p>
          <p className="mt-1 text-sm text-gray-500">Phone: {order.recipientPhone}</p>
          {order.deliveryInstructions && <p className="mt-2 text-sm text-gray-500">Instructions: {order.deliveryInstructions}</p>}
        </section>
      </div>
    </main>
  );
}
