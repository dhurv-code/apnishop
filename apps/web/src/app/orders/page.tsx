
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyOrders, type CreatedOrder } from "@/lib/orders";

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function OrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<CreatedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await getMyOrders();
        if (active) setOrders(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load orders.";

        if (active) {
          if (message.toLowerCase().includes("authentication required")) {
            router.replace("/login");
            return;
          }
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="font-bold text-green-800">
          ← ApnaBasket
        </a>

        <h1 className="mt-7 text-3xl font-extrabold">My orders</h1>
        <p className="mt-2 text-sm text-gray-500">
          View your grocery order history.
        </p>

        {loading ? (
          <p className="mt-8 rounded-xl bg-white p-8 text-center">
            Loading your orders...
          </p>
        ) : error ? (
          <p role="alert" className="mt-8 rounded-xl bg-red-50 p-5 text-sm text-red-700">
            {error}
          </p>
        ) : orders.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-10 text-center">
            <div className="text-5xl">🧺</div>
            <h2 className="mt-4 font-bold">No orders yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your placed orders will appear here.
            </p>
            <a href="/"
              className="mt-5 inline-block rounded-xl bg-green-700 px-6 py-3 font-bold text-white"
            > Start shopping </a></div>
        ) : (
          <div className="mt-8 space-y-4">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="w-full rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-bold">{order.orderNumber}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>

                  <span className="h-fit rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                    {order.status}
                  </span>
                </div>

                <div className="mt-4 flex justify-between">
                  <span className="text-sm text-gray-500">
                    Estimated amount
                  </span>
                  <span className="font-extrabold">
                    {formatPrice(order.estimatedTotalPaise)}
                  </span>
                </div>

                <p className="mt-3 text-xs font-semibold text-green-700">
                  View order details →
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
