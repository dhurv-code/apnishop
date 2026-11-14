
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CustomerCart,
  getCart,
  updateCartItem,
  removeCartItem,
} from "@/lib/customer";

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function CartPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadCart = useCallback(async () => {
    try {
      setError("");
      const result = await getCart();
      setCart(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load your cart.";

      if (message.includes("Authentication required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function changeQuantity(id: string, quantity: number) {
    if (quantity <= 0) {
      await removeItem(id);
      return;
    }

    try {
      setBusyItem(id);
      setError("");
      const result = await updateCartItem(id, quantity);
      setCart(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update quantity.");
    } finally {
      setBusyItem(null);
    }
  }

  async function removeItem(id: string) {
    try {
      setBusyItem(id);
      setError("");
      const result = await removeCartItem(id);
      setCart(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove item.");
    } finally {
      setBusyItem(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8faf8] p-8 text-center">
        Loading your cart...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="font-bold text-green-800">
          ← Continue shopping
        </a>

        <h1 className="mt-7 text-3xl font-extrabold">My basket</h1>
        <p className="mt-2 text-sm text-gray-500">
          Review your selected groceries.
        </p>

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button onClick={() => void loadCart()} className="ml-3 font-bold underline">
              Retry
            </button>
          </div>
        )}

        {!cart || cart.items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed bg-white p-12 text-center">
            <span className="text-5xl">🧺</span>
            <h2 className="mt-4 text-xl font-bold">Your basket is empty</h2>
            <p className="mt-2 text-sm text-gray-500">
              Add groceries from your local shops.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-xl bg-green-700 px-6 py-3 font-bold text-white"
            >
              Start shopping
            </a>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
            <section className="space-y-4">
              {cart.items.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-green-50 text-4xl">
                    🛒
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold">{item.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.unitLabel}
                    </p>

                    <p className="mt-2 font-bold text-green-800">
                      {item.pricePaise !== null
                        ? formatPrice(item.pricePaise)
                        : "Price unavailable"}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {item.productStatus === "ACTIVE"
                        ? item.categoryName || "Grocery"
                        : "Currently inactive"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <div className="flex items-center gap-3 rounded-lg border px-2 py-1">
                      <button
                        disabled={busyItem === item.id}
                        onClick={() => void changeQuantity(item.id, item.quantity - 1)}
                        className="font-bold text-green-800 disabled:opacity-40"
                      >
                        −
                      </button>

                      <span className="min-w-5 text-center text-sm font-bold">
                        {item.quantity}
                      </span>

                      <button
                        disabled={busyItem === item.id}
                        onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                        className="font-bold text-green-800 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>

                    <button
                      disabled={busyItem === item.id}
                      onClick={() => void removeItem(item.id)}
                      className="text-xs font-semibold text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold">Order summary</h2>

              <div className="mt-5 flex justify-between text-sm">
                <span className="text-gray-500">Items quantity</span>
                <span className="font-semibold">{cart.itemCount}</span>
              </div>

              <div className="mt-4 flex justify-between text-sm">
                <span className="text-gray-500">Estimated subtotal</span>
                <span className="font-semibold">
                  {formatPrice(cart.subtotalPaise)}
                </span>
              </div>

              <div className="mt-4 border-t border-dashed pt-4">
                <div className="flex justify-between">
                  <span className="font-bold">Estimated total</span>
                  <span className="text-xl font-extrabold text-green-800">
                    {formatPrice(cart.subtotalPaise)}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Delivery and platform charges, if applicable, will be
                  calculated during checkout. Final product prices are
                  subject to confirmation from the local shop.
                </p>
              </div>

              {(cart.hasUnpricedItems || cart.hasInactiveItems) && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  Some products need availability or price confirmation
                  before checkout.
                </p>
              )}

              <button
                disabled={cart.items.length === 0}
                onClick={() => router.push("/checkout")}
                className="mt-5 w-full rounded-xl bg-green-700 py-4 font-bold text-white hover:bg-green-800 disabled:opacity-50"
              >
                Proceed to checkout →
              </button>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
