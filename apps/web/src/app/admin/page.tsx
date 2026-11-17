
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AdminStats,
  AdminOrder,
  AdminShop,
  AdminPartner,
  getAdminStats,
  getAdminOrders,
  getAdminShops,
  getAdminPartners,
  confirmAdminOrder,
  assignOrderShop,
  assignOrderPartner,
} from "@/lib/admin";
import { getNotifications } from "@/lib/notifications";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

const initialStats: AdminStats = {
  totalOrders: 0,
  newOrders: 0,
  inProgressOrders: 0,
  deliveredOrders: 0,
  cancelledOrders: 0,
  activeShops: 0,
  activeDeliveryPartners: 0,
};

export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState(initialStats);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [partners, setPartners] = useState<AdminPartner[]>([]);

  const [shopSelections, setShopSelections] = useState<Record<string, string>>({});
  const [partnerSelections, setPartnerSelections] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [latestAlert, setLatestAlert] = useState<{ title: string; body: string } | null>(null);
  const [reload, setReload] = useState(0);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [dashboard, orderList, shopList, partnerList, notificationResult] =
        await Promise.all([
          getAdminStats(),
          getAdminOrders(),
          getAdminShops(),
          getAdminPartners(),
          getNotifications({ unreadOnly: true, limit: 20 }),
        ]);

      setStats(dashboard);
      setOrders(orderList);
      setShops(shopList);
      setPartners(partnerList);
      setUnreadAlerts(notificationResult?.data.unreadCount ?? 0);
      setLatestAlert(notificationResult?.data.items[0]
        ? { title: notificationResult.data.items[0].title, body: notificationResult.data.items[0].body }
        : null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load dashboard.";

      if (message.includes("Authentication required") ||
        message.includes("Administrator access required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, reload]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setReload((value) => value + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function performAction(
    id: string,
    action: () => Promise<unknown>,
    successMessage: string
  ) {
    try {
      setBusyId(id);
      setError("");
      setNotice("");

      await action();

      setNotice(successMessage);
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete action."
      );
    } finally {
      setBusyId(null);
    }
  }

  const statCards = [
    ["Total orders", stats.totalOrders, "🧾"],
    ["New orders", stats.newOrders, "📥"],
    ["In progress", stats.inProgressOrders, "🚚"],
    ["Delivered", stats.deliveredOrders, "✅"],
    ["Cancelled", stats.cancelledOrders, "✕"],
    ["Active shops", stats.activeShops, "🏪"],
    ["Delivery partners", stats.activeDeliveryPartners, "🛵"],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <a
            href="/admin/catalog"
            className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white"
          >
            Manage Shops & Products →
          </a>
          <div>
            <h1 className="text-xl font-extrabold text-green-800">
              ApnaBasket Admin
            </h1>
            <p className="text-xs text-gray-500">
              Operations and order management
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/notifications"
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Alerts{unreadAlerts > 0 ? ` (${unreadAlerts})` : ""}
            </a>
            <button
              onClick={() => setReload((value) => value + 1)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Refresh
            </button>

            <button
              onClick={() => router.push("/")}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Customer site
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <h2 className="text-2xl font-extrabold">Dashboard overview</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitor ApnaBasket's daily operations.
        </p>

        {notice && (
          <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {unreadAlerts > 0 && (
          <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-amber-900">{unreadAlerts} unread operations alert{unreadAlerts === 1 ? "" : "s"}</p>
                {latestAlert && <><p className="mt-1 text-sm font-semibold text-amber-900">{latestAlert.title}</p><p className="mt-1 text-sm text-amber-800">{latestAlert.body}</p></>}
                <p className="mt-2 text-xs text-amber-800">New alerts are checked automatically while this dashboard is open.</p>
              </div>
              <a href="/notifications" className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white">View alerts</a>
            </div>
          </section>
        )}

        <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map(([label, value, icon]) => (
            <div
              key={label}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <span className="text-2xl">{icon}</span>
              <p className="mt-4 text-2xl font-extrabold">{loading ? "—" : value}</p>
              <p className="mt-1 text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold">Recent orders</h2>
              <p className="mt-1 text-sm text-gray-500">
                Review, confirm and assign incoming orders.
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-green-800">
              {orders.length} records
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-10 text-center text-gray-500">
              Loading dashboard...
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <p className="text-4xl">📦</p>
              <p className="mt-3 font-bold">No customer orders yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-extrabold">{order.orderNumber}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {order.customerName || "Customer"} · {order.customerPhone}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(order.createdAt).toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                        {order.status}
                      </span>
                      <p className="mt-3 font-extrabold">
                        {money(order.estimatedTotalPaise)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.paymentMethod} · {order.paymentStatus}
                      </p>
                    </div>
                  </div>

                  {order.shopName && (
                    <p className="mt-3 text-sm text-gray-600">
                      Shop: <strong>{order.shopName}</strong>
                    </p>
                  )}

                  <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">
                    <p className="font-semibold">Deliver to: {order.recipientName}</p>
                    <p className="mt-1 text-gray-700">
                      {order.addressLine1}
                      {order.addressLine2 ? `, ${order.addressLine2}` : ""}
                      {`, ${order.locality}, ${order.city}, ${order.district}, ${order.state} - ${order.postalCode}`}
                    </p>
                    {order.landmark && <p className="mt-1 text-gray-600">Landmark: {order.landmark}</p>}
                    <p className="mt-1 text-gray-600">Delivery phone: {order.recipientPhone}</p>
                    {order.deliveryInstructions && <p className="mt-1 text-gray-600">Instructions: {order.deliveryInstructions}</p>}
                    <a
                      className="mt-2 inline-block font-semibold text-green-700 underline"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([order.addressLine1, order.addressLine2, order.locality, order.city, order.district, order.state, order.postalCode].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noreferrer"
                    >Open delivery address in Maps</a>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {order.status === "PLACED" && (
                      <button
                        disabled={busyId === order.id}
                        onClick={() =>
                          void performAction(
                            order.id,
                            () => confirmAdminOrder(order.id),
                            "Order confirmed."
                          )
                        }
                        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Confirm order
                      </button>
                    )}

                    {order.status === "CONFIRMED" && (
                      <>
                        <select
                          value={shopSelections[order.id] || order.assignedShopId || ""}
                          onChange={(event) =>
                            setShopSelections((old) => ({
                              ...old,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="">Select shop</option>
                          {shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>
                              {shop.name}
                            </option>
                          ))}
                        </select>

                        <button
                          disabled={
                            busyId === order.id ||
                            !shopSelections[order.id]
                          }
                          onClick={() =>
                            void performAction(
                              order.id,
                              () => assignOrderShop(
                                order.id,
                                shopSelections[order.id]
                              ),
                              "Shop assigned."
                            )
                          }
                          className="rounded-lg border border-green-700 px-4 py-2 text-sm font-bold text-green-800 disabled:opacity-50"
                        >
                          Assign shop
                        </button>
                      </>
                    )}

                    {order.status === "CONFIRMED" && order.assignedShopId && (
                      <>
                        <select
                          value={partnerSelections[order.id] || ""}
                          onChange={(event) =>
                            setPartnerSelections((old) => ({
                              ...old,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="">Select available partner</option>
                          {partners.filter((partner) => partner.isAvailable).map((partner) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.fullName || partner.phone} · {partner.vehicleType || "Vehicle not set"}
                            </option>
                          ))}
                        </select>
                        {partners.filter((partner) => partner.isAvailable).length === 0 && (
                          <p className="w-full text-xs text-amber-700">
                            No active partner is online. Activate a partner in Partner Management, then ask them to log in and switch their status to Available on the delivery dashboard.
                          </p>
                        )}

                        <button
                          disabled={
                            busyId === order.id ||
                            !partnerSelections[order.id]
                          }
                          onClick={() =>
                            void performAction(
                              order.id,
                              () => assignOrderPartner(
                                order.id,
                                partnerSelections[order.id]
                              ),
                              "Delivery partner assigned."
                            )
                          }
                          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Assign delivery
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
