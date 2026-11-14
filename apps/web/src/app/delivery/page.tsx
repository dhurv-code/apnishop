"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptDeliveryOrder,
  DeliveryOrder,
  finishShopping,
  getDeliveryOrders,
  getDeliveryProfile,
  rejectDeliveryOrder,
  setDeliveryAvailability,
  startShopping,
  updateDeliveryItem,
} from "@/lib/delivery";
import { requestSubstitution } from "@/lib/substitutions";

type ReplacementDraft = {
  name: string;
  unit: string;
  price: string;
  quantity: string;
  reason: string;
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function DeliveryDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [replacementDrafts, setReplacementDrafts] = useState<
    Record<string, ReplacementDraft>
  >({});

  const loadData = useCallback(async () => {
    try {
      const [profileResult, orderResult] = await Promise.all([
        getDeliveryProfile(),
        getDeliveryOrders(),
      ]);
      setIsAvailable(profileResult.data.isAvailable);
      setOrders(orderResult.data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unable to load dashboard.";

      if (errorMessage.toLowerCase().includes("log in")) {
        router.replace("/login");
        return;
      }

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runAction(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setMessage("");

    try {
      await action();
      await loadData();
      setMessage("Updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAvailability() {
    const nextValue = !isAvailable;
    await runAction("availability", () => setDeliveryAvailability(nextValue));
  }

  async function markPurchased(
    orderId: string,
    item: DeliveryOrder["items"][number]
  ) {
    const quantity = Number(quantities[item.id] ?? item.requestedQuantity);
    const priceRupees = Number(
      prices[item.id] ?? (item.estimatedUnitPricePaise / 100).toFixed(2)
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Enter a valid purchased quantity.");
      return;
    }

    if (!Number.isFinite(priceRupees) || priceRupees < 0) {
      setMessage("Enter a valid actual unit price.");
      return;
    }

    await runAction(`item-${item.id}`, () =>
      updateDeliveryItem(orderId, item.id, {
        status: "PURCHASED",
        quantity,
        unitPricePaise: Math.round(priceRupees * 100),
      })
    );
  }

  function getReplacementDraft(
    itemId: string,
    originalUnit: string,
    requestedQuantity: number
  ): ReplacementDraft {
    return (
      replacementDrafts[itemId] ?? {
        name: "",
        unit: originalUnit,
        price: "",
        quantity: String(requestedQuantity),
        reason: "",
      }
    );
  }

  function updateReplacementDraft(
    itemId: string,
    originalUnit: string,
    requestedQuantity: number,
    patch: Partial<ReplacementDraft>
  ) {
    setReplacementDrafts((current) => ({
      ...current,
      [itemId]: {
        ...getReplacementDraft(itemId, originalUnit, requestedQuantity),
        ...patch,
      },
    }));
  }

  async function submitReplacement(orderId: string, itemId: string) {
    const draft = replacementDrafts[itemId];
    if (!draft || !draft.name.trim() || !draft.unit.trim()) {
      setMessage("Enter a replacement product name and unit.");
      return;
    }

    const quantity = Number(draft.quantity);
    const priceRupees = Number(draft.price);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Enter a valid replacement quantity.");
      return;
    }
    if (!Number.isFinite(priceRupees) || priceRupees < 0) {
      setMessage("Enter a valid replacement unit price.");
      return;
    }

    await runAction(`sub-${itemId}`, () =>
      requestSubstitution(orderId, itemId, {
        replacementName: draft.name.trim(),
        replacementUnitLabel: draft.unit.trim(),
        replacementUnitPricePaise: Math.round(priceRupees * 100),
        replacementQuantity: quantity,
        reason: draft.reason.trim() || undefined,
      })
    );
  }

  if (loading) {
    return <main className="p-8">Loading delivery dashboard...</main>;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-700">ApnaBasket</p>
            <h1 className="text-2xl font-bold">Delivery Partner Dashboard</h1>
            <p className="text-sm text-gray-500">
              Manage assigned orders, shopping and customer replacement approvals.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void toggleAvailability()}
              disabled={busy === "availability"}
              className={`rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50 ${
                isAvailable ? "bg-green-600" : "bg-gray-700"
              }`}
            >
              {busy === "availability"
                ? "Updating..."
                : isAvailable
                  ? "Available — Go offline"
                  : "Offline — Go available"}
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-lg border bg-white p-3 text-sm" role="status">
            {message}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Total assignments</p>
            <p className="text-2xl font-bold">{orders.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Awaiting acceptance</p>
            <p className="text-2xl font-bold">
              {orders.filter((order) => order.assignmentStatus === "ASSIGNED").length}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Shopping / approval</p>
            <p className="text-2xl font-bold">
              {orders.filter((order) =>
                ["SHOPPING", "AWAITING_APPROVAL"].includes(order.orderStatus)
              ).length}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold">Your assignments</h2>

          {orders.length === 0 && (
            <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
              No assignments yet.
            </div>
          )}

          {orders.map((order) => {
            const allItemsProcessed =
              order.items.length > 0 &&
              order.items.every((item) =>
                ["PURCHASED", "UNAVAILABLE", "REMOVED"].includes(item.status)
              );

            const canShop = order.orderStatus === "SHOPPING";
            const canPropose = ["SHOPPING", "AWAITING_APPROVAL"].includes(
              order.orderStatus
            );

            return (
              <article
                key={order.assignmentId}
                className="space-y-4 rounded-xl border bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{order.orderNumber}</h3>
                    <p className="text-sm text-gray-500">
                      {order.recipientName} · {order.recipientPhone}
                    </p>
                    <p className="mt-1 text-sm">
                      {order.addressLine1}
                      {order.addressLine2 ? `, ${order.addressLine2}` : ""}
                      {`, ${order.locality}, ${order.city}, ${order.postalCode}`}
                    </p>
                    {order.landmark && (
                      <p className="text-sm text-gray-500">Landmark: {order.landmark}</p>
                    )}
                    {order.deliveryInstructions && (
                      <p className="text-sm text-gray-500">
                        Instructions: {order.deliveryInstructions}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">Order status</p>
                    <p className="font-semibold">{order.orderStatus.replaceAll("_", " ")}</p>
                    <p className="text-xs text-gray-500">
                      Assignment: {order.assignmentStatus}
                    </p>
                  </div>
                </div>

                {order.assignmentStatus === "ASSIGNED" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === order.orderId}
                      onClick={() =>
                        void runAction(order.orderId, () => acceptDeliveryOrder(order.orderId))
                      }
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Accept order
                    </button>
                    <button
                      type="button"
                      disabled={busy === order.orderId}
                      onClick={() =>
                        void runAction(order.orderId, () => rejectDeliveryOrder(order.orderId))
                      }
                      className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {order.orderStatus === "ACCEPTED" &&
                  order.assignmentStatus === "ACCEPTED" && (
                    <button
                      type="button"
                      disabled={busy === order.orderId}
                      onClick={() =>
                        void runAction(order.orderId, () => startShopping(order.orderId))
                      }
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Start shopping
                    </button>
                  )}

                {(canShop || order.orderStatus === "AWAITING_APPROVAL") && (
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-semibold">Shopping list</h4>

                    {order.orderStatus === "AWAITING_APPROVAL" && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Waiting for customer decisions. You can submit other replacement
                        proposals, but cannot record purchases or finish shopping until all
                        pending approvals are resolved. Refresh after the customer responds.
                      </div>
                    )}

                    {order.items.map((item) => {
                      const draft = getReplacementDraft(
                        item.id,
                        item.unitLabelSnapshot,
                        item.requestedQuantity
                      );
                      const canBuy =
                        canShop &&
                        ["PENDING", "REPLACEMENT_APPROVED"].includes(item.status);
                      const canMarkUnavailable =
                        canShop &&
                        ["PENDING", "REPLACEMENT_APPROVED"].includes(item.status);
                      const canSuggestReplacement =
                        canPropose && ["PENDING", "UNAVAILABLE"].includes(item.status);

                      return (
                        <div key={item.id} className="space-y-3 rounded-lg bg-gray-50 p-3">
                          <div className="flex flex-wrap justify-between gap-2">
                            <div>
                              <p className="font-medium">{item.productNameSnapshot}</p>
                              <p className="text-sm text-gray-500">
                                Requested: {item.requestedQuantity} {item.unitLabelSnapshot}
                              </p>
                              <p className="text-xs text-gray-500">
                                Original estimate: {money(item.estimatedUnitPricePaise)} per unit
                              </p>
                            </div>
                            <span className="text-xs font-semibold">
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </div>

                          {canBuy && (
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                aria-label={`Purchased quantity for ${item.productNameSnapshot}`}
                                placeholder="Purchased quantity"
                                value={quantities[item.id] ?? String(item.requestedQuantity)}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="min-w-0 rounded-lg border bg-white px-3 py-2 text-sm"
                              />
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`Actual unit price for ${item.productNameSnapshot}`}
                                placeholder="Actual unit price ₹"
                                value={
                                  prices[item.id] ??
                                  (item.estimatedUnitPricePaise / 100).toFixed(2)
                                }
                                onChange={(event) =>
                                  setPrices((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="min-w-0 rounded-lg border bg-white px-3 py-2 text-sm"
                              />
                              <button
                                type="button"
                                disabled={busy === `item-${item.id}`}
                                onClick={() => void markPurchased(order.orderId, item)}
                                className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Purchased
                              </button>
                            </div>
                          )}

                          {canMarkUnavailable && (
                            <button
                              type="button"
                              disabled={busy === `item-${item.id}`}
                              onClick={() =>
                                void runAction(`item-${item.id}`, () =>
                                  updateDeliveryItem(order.orderId, item.id, {
                                    status: "UNAVAILABLE",
                                  })
                                )
                              }
                              className="rounded-lg border bg-white px-3 py-2 text-sm"
                            >
                              Mark unavailable
                            </button>
                          )}

                          {canSuggestReplacement && (
                            <div className="space-y-2 rounded-lg border bg-white p-3">
                              <p className="text-sm font-semibold">Suggest a replacement</p>
                              <input
                                value={draft.name}
                                onChange={(event) =>
                                  updateReplacementDraft(item.id, item.unitLabelSnapshot, item.requestedQuantity, {
                                    name: event.target.value,
                                  })
                                }
                                placeholder="Replacement product name"
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                              />
                              <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                  value={draft.unit}
                                  onChange={(event) =>
                                    updateReplacementDraft(item.id, item.unitLabelSnapshot, item.requestedQuantity, {
                                      unit: event.target.value,
                                    })
                                  }
                                  placeholder="Unit (e.g. 1 kg)"
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                                <input
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={draft.quantity}
                                  onChange={(event) =>
                                    updateReplacementDraft(item.id, item.unitLabelSnapshot, item.requestedQuantity, {
                                      quantity: event.target.value,
                                    })
                                  }
                                  placeholder="Quantity"
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draft.price}
                                  onChange={(event) =>
                                    updateReplacementDraft(item.id, item.unitLabelSnapshot, item.requestedQuantity, {
                                      price: event.target.value,
                                    })
                                  }
                                  placeholder="Proposed unit price ₹"
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                                <input
                                  value={draft.reason}
                                  onChange={(event) =>
                                    updateReplacementDraft(item.id, item.unitLabelSnapshot, item.requestedQuantity, {
                                      reason: event.target.value,
                                    })
                                  }
                                  placeholder="Reason (optional)"
                                  className="rounded-lg border px-3 py-2 text-sm"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy === `sub-${item.id}`}
                                onClick={() => void submitReplacement(order.orderId, item.id)}
                                className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {busy === `sub-${item.id}`
                                  ? "Sending..."
                                  : "Send to customer for approval"}
                              </button>
                            </div>
                          )}

                          {item.status === "REPLACEMENT_REQUESTED" && (
                            <p className="text-sm font-medium text-amber-700">
                              Replacement proposed — waiting for customer approval.
                            </p>
                          )}
                          {item.status === "REPLACEMENT_APPROVED" && (
                            <p className="text-sm font-medium text-green-700">
                              Customer approved this replacement. Record the actual purchase details.
                            </p>
                          )}
                          {item.status === "REMOVED" && (
                            <p className="text-sm text-gray-500">
                              Customer rejected the replacement. This item is excluded from the bill.
                            </p>
                          )}
                          {item.status === "PURCHASED" && (
                            <p className="text-sm text-green-700">
                              Purchased: {item.purchasedQuantity} {item.unitLabelSnapshot} · Actual
                              total: {money(item.actualLineTotalPaise)}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {canShop && allItemsProcessed && (
                      <button
                        type="button"
                        disabled={busy === order.orderId}
                        onClick={() =>
                          void runAction(order.orderId, () => finishShopping(order.orderId))
                        }
                        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Finish shopping and calculate bill
                      </button>
                    )}
                  </div>
                )}

                {order.orderStatus === "READY_FOR_DELIVERY" && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                    <span>Shopping completed. Final bill: {money(order.finalTotalPaise)}.</span>
                    <Link
                      href={`/delivery/orders/${order.orderId}`}
                      className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white"
                    >
                      Start delivery
                    </Link>
                  </div>
                )}

                {["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.orderStatus) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <span>Delivery status: {order.orderStatus.replaceAll("_", " ")}</span>
                    <Link
                      href={`/delivery/orders/${order.orderId}`}
                      className="rounded-lg border px-4 py-2 font-semibold"
                    >
                      Open delivery details
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
