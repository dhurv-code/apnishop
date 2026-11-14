"use client";

import { Suspense, useEffect, useState  } from "react";
import { useParams, useRouter } from "next/navigation";

import { getOrder, OrderDetails } from "@/lib/orders";

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function OrderConfirmationContent() { 
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrder() {
      try {
        const result = await getOrder(params.id);

        if (active) setOrder(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load order.";

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

    void loadOrder();

    return () => {
      active = false;
    };
  }, [params.id, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8faf8] p-10 text-center">
        Loading order details...
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-[#f8faf8] px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Unable to load order</h1>
        <p className="mt-3 text-sm text-gray-500">
          {error || "Order not found."}
        </p>

        <a href="/" className="mt-6 inline-block font-bold text-green-700">
          Return to homepage
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-10">
      <div className="mx-auto max-w-2xl">

        <div className="rounded-3xl border border-gray-100 bg-white p-7 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
            ✓
          </div>

          <h1 className="mt-5 text-3xl font-extrabold text-green-800">
            Order placed!
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-500">
            Your grocery order has been received. Our team will
            review and process it.
          </p>

          <div className="mt-7 rounded-2xl bg-green-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Your order number
            </p>

            <p className="mt-2 text-xl font-extrabold">
              {order.orderNumber}
            </p>

            <p className="mt-3 text-xs text-gray-500">
              Status: {order.status}
            </p>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-lg font-extrabold">Delivery details</h2>

          <p className="mt-4 font-semibold">{order.recipientName}</p>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            {order.addressLine1}, {order.locality},
            {order.city}, {order.district}, {order.state} -
            {order.postalCode}
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Phone: {order.recipientPhone}
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="text-lg font-extrabold">Purchased items</h2>

          <div className="mt-5 space-y-4">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-4 border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-semibold">
                    {item.productNameSnapshot}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {item.unitLabelSnapshot} × {item.requestedQuantity}
                  </p>
                </div>

                <p className="text-sm font-semibold">
                  {formatPrice(
                    Math.round(
                      item.estimatedUnitPricePaise *
                      item.requestedQuantity
                    )
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-between">
            <span className="font-bold">Estimated amount</span>
            <span className="text-xl font-extrabold text-green-800">
              {formatPrice(order.estimatedTotalPaise)}
            </span>
          </div>

          <div className="mt-5 rounded-xl bg-amber-50 p-4">
            <p className="font-bold text-amber-900">
              Cash on Delivery
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              This is an estimated amount. Actual product prices and
              the final amount will be confirmed after shopping.
            </p>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <a href="/" className="rounded-xl border border-green-700 bg-white px-4 py-4 text-center text-sm font-bold text-green-800">Continue shopping </a>

          <button
            onClick={() => router.push("/orders")}
            className="rounded-xl bg-green-700 px-4 py-4 text-sm font-bold text-white"
          >
            My orders
          </button>
        </div>
      </div>
    </main>
  );
}
export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen p-8 text-center">Loading order details...</main>}
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
