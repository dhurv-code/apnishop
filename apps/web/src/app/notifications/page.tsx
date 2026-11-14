"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function destination(item: AppNotification) {
  if (item.actionUrl) return item.actionUrl;
  if (item.relatedOrderId) return `/orders/${item.relatedOrderId}`;
  return null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await getNotifications({ unreadOnly: showUnreadOnly, limit: 100 });
      setItems(result.data.items);
      setUnreadCount(result.data.unreadCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load notifications.";
      setError(message);
      if (message.toLowerCase().includes("log in")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router, showUnreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    setBusyId(id);
    setError("");
    try {
      await markNotificationRead(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notification.");
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBusyAll(true);
    setError("");
    try {
      await markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notifications.");
    } finally {
      setBusyAll(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/" className="text-sm font-semibold text-green-700">
              ← ApnaBasket
            </Link>
            <h1 className="mt-2 text-2xl font-bold">Notifications</h1>
            <p className="mt-1 text-sm text-gray-500">
              Order updates, delivery alerts and replacement decisions.
            </p>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3 text-right">
            <p className="text-xs text-gray-500">Unread</p>
            <p className="text-2xl font-bold tabular-nums">{unreadCount}</p>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(event) => setShowUnreadOnly(event.target.checked)}
              className="h-4 w-4 accent-green-700"
            />
            Show unread only
          </label>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0 || busyAll}
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAll ? "Updating..." : "Mark all as read"}
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
            Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center">
            <div className="text-3xl">🔔</div>
            <h2 className="mt-3 font-semibold">You're all caught up</h2>
            <p className="mt-1 text-sm text-gray-500">
              {showUnreadOnly ? "There are no unread notifications." : "New updates will appear here."}
            </p>
          </div>
        ) : (
          <section className="space-y-3" aria-label="Notification list">
            {items.map((item) => {
              const href = destination(item);
              return (
                <article
                  key={item.id}
                  className={`rounded-xl border bg-white p-4 shadow-sm ${item.readAt ? "" : "border-l-4 border-l-green-600"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-lg">
                      🔔
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{item.title}</h2>
                        {!item.readAt && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            New
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{item.body}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatDate(item.createdAt)}</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {href && (
                          <Link href={href} className="text-sm font-semibold text-green-700 hover:underline">
                            View details
                          </Link>
                        )}
                        {!item.readAt && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => markRead(item.id)}
                            className="text-sm font-semibold text-gray-600 hover:underline disabled:opacity-50"
                          >
                            {busyId === item.id ? "Updating..." : "Mark as read"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
