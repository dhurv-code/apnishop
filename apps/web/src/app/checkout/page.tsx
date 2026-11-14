
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Address,
  CustomerCart,
  getAddresses,
  getCart,
} from "@/lib/customer";

import { createCodOrder } from "@/lib/orders";

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function CheckoutPage() {
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [cart, setCart] = useState<CustomerCart | null>(null);

  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // Reuse the same idempotency key if the customer retries.
  const idempotencyKey = useRef<string | null>(null);

  const loadCheckout = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [savedAddresses, customerCart] = await Promise.all([
        getAddresses(),
        getCart(),
      ]);

      setAddresses(savedAddresses);
      setCart(customerCart);

      const preferred =
        savedAddresses.find((address) => address.isDefault) ||
        savedAddresses[0];

      setSelectedAddressId(preferred?.id || "");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load checkout.";

      if (message.toLowerCase().includes("authentication required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCheckout();
  }, [loadCheckout]);

  async function handlePlaceOrder() {
    if (!selectedAddressId) {
      setError("Please select a delivery address.");
      return;
    }

    if (!cart || cart.items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (cart.hasUnpricedItems || cart.hasInactiveItems) {
      setError(
        "Some products need price or availability updates before checkout."
      );
      return;
    }

    setPlacing(true);
    setError("");

    try {
      if (!idempotencyKey.current) {
        idempotencyKey.current = crypto.randomUUID();
      }

      const order = await createCodOrder({
        addressId: selectedAddressId,
        paymentMethod: "COD",
        customerNotes: customerNotes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      });

      router.replace(`/orders/${order.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to place order."
      );
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8faf8] p-10 text-center">
        Loading checkout...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-8">
      <div className="mx-auto max-w-6xl">

        <a href="/cart" className="font-bold text-green-800">
          ← Back to basket
        </a>

        <h1 className="mt-7 text-3xl font-extrabold">
          Checkout
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Confirm your address and place your grocery order.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">

          {/* Address and payment */}
          <div className="space-y-6">

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">
                  1. Delivery address
                </h2>

                <a
                  href="/account/addresses"
                  className="text-sm font-bold text-green-700"
                >
                  Manage addresses
                </a>
              </div>

              {addresses.length === 0 ? (
                <div className="mt-5 rounded-xl bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    You haven't saved a delivery address yet.
                  </p>

                  <a
                    href="/account/addresses"
                    className="mt-3 inline-block font-bold text-green-800 underline"
                  >
                    Add delivery address →
                  </a>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
                        selectedAddressId === address.id
                          ? "border-green-700 bg-green-50"
                          : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="deliveryAddress"
                        checked={selectedAddressId === address.id}
                        onChange={() => setSelectedAddressId(address.id)}
                        className="mt-1 accent-green-700"
                      />

                      <div>
                        <p className="font-bold">
                          {address.recipientName}
                          {address.isDefault && (
                            <span className="ml-2 text-xs text-green-700">
                              DEFAULT
                            </span>
                          )}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-gray-600">
                          {address.addressLine1}, {address.locality},
                          {address.city}, {address.district},
                          {address.state} - {address.postalCode}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {address.phone}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold">
                2. Payment method
              </h2>

              <div className="mt-5 rounded-xl border border-green-700 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💵</span>

                  <div>
                    <p className="font-bold">Cash on Delivery</p>
                    <p className="mt-1 text-xs text-gray-600">
                      Pay when your delivery arrives.
                    </p>
                  </div>

                  <span className="ml-auto text-green-800">✓</span>
                </div>
              </div>

              <p className="mt-4 text-xs text-gray-500">
                Online payments will be enabled after payment gateway
                integration and merchant onboarding.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="font-extrabold">
                3. Order instructions (optional)
              </h2>

              <textarea
                value={customerNotes}
                onChange={(event) => setCustomerNotes(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Anything we should know about your order?"
                className="mt-4 w-full rounded-xl border border-gray-200 p-4 text-sm outline-none focus:border-green-700"
              />
            </section>
          </div>

          {/* Order summary */}
          <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-extrabold">Order summary</h2>

            {!cart || cart.items.length === 0 ? (
              <p className="mt-5 text-sm text-gray-500">
                Your basket is empty.
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          {item.unitLabel} × {item.quantity}
                        </p>
                      </div>

                      <p className="font-semibold">
                        {item.pricePaise !== null
                          ? formatPrice(
                              Math.round(item.pricePaise * item.quantity)
                            )
                          : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Estimated subtotal</span>
                    <span className="font-semibold">
                      {formatPrice(cart.subtotalPaise)}
                    </span>
                  </div>

                  <div className="mt-4 flex justify-between">
                    <span className="font-bold">Estimated amount</span>
                    <span className="text-xl font-extrabold text-green-800">
                      {formatPrice(cart.subtotalPaise)}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-xs leading-5 text-gray-500">
                  This is an estimated amount. The delivery partner will
                  record actual purchase prices and the final bill will
                  be calculated after shopping.
                </p>
              </>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={
                placing ||
                !cart ||
                cart.items.length === 0 ||
                addresses.length === 0 ||
                cart.hasUnpricedItems ||
                cart.hasInactiveItems
              }
              className="mt-6 w-full rounded-xl bg-green-700 py-4 font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {placing ? "Placing order..." : "Place COD order"}
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}