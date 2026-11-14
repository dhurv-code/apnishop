
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getCategories,
  getProducts,
  type Category,
  type Product,
} from "@/lib/api";

import {
  CustomerCart,
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
} from "@/lib/customer";

const categoryIcons: Record<string, string> = {
  fruits: "🍎",
  vegetables: "🥦",
  dairy: "🥛",
  "atta-rice": "🌾",
  snacks: "🍪",
  essentials: "🧴",
};

const productIcons: Record<string, string> = {
  fruits: "🍎",
  vegetables: "🥕",
  dairy: "🥛",
  "atta-rice": "🌾",
  snacks: "🍪",
  essentials: "🧴",
};

function formatPrice(paise: number | null) {
  if (paise === null) return "Price unavailable";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export default function Home() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CustomerCart | null>(null);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [loading, setLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Persistent cart summary from PostgreSQL.
  const cartCount = cart?.itemCount ?? 0;
  const cartTotalPaise = cart?.subtotalPaise ?? 0;
  const cartTotal = formatPrice(cartTotalPaise);

  // ------------------------------------------
  // LOAD CATEGORIES
  // ------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const result = await getCategories(controller.signal);
        setCategories(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Category loading failed:", err);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  // ------------------------------------------
  // LOAD CUSTOMER CART
  // ------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadCart() {
      try {
        const result = await getCart();

        if (active) {
          setCart(result);
        }
      } catch (err) {
        if (
          active &&
          !(
            err instanceof Error &&
            err.message.toLowerCase().includes("authentication required")
          )
        ) {
          console.error("Unable to load customer cart:", err);
        }
      } finally {
        if (active) setCartLoading(false);
      }
    }

    void loadCart();

    return () => {
      active = false;
    };
  }, []);

  // ------------------------------------------
  // LOAD PRODUCTS
  // ------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await getProducts(
          {
            search: search.trim() || undefined,

            // "all" means no category filter.
            category:
              activeCategory === "all"
                ? undefined
                : activeCategory,

            page: 1,
            limit: 50,
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setProducts(response.data);
        }
      } catch (err) {
        if (
          !controller.signal.aborted &&
          !(err instanceof Error && err.name === "AbortError")
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load products."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, activeCategory, retryCount]);

  // ------------------------------------------
  // AUTHENTICATION ERROR HANDLING
  // ------------------------------------------

  function handleCustomerError(err: unknown) {
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("authentication required")
    ) {
      router.push("/login");
      return;
    }

    setNotice(
      err instanceof Error
        ? err.message
        : "Something went wrong. Please try again."
    );
  }

  // ------------------------------------------
  // ADD PRODUCT TO PERSISTENT CART
  // ------------------------------------------

  async function addToCart(product: Product) {
    if (product.estimatedPricePaise === null) {
      setNotice("Price unavailable for this product.");
      return;
    }

    if (busyProductId) return;

    setBusyProductId(product.id);
    setNotice("");

    try {
      const updatedCart = await addCartItem(product.id, 1);

      setCart(updatedCart);
      setNotice(`${product.name} added to your basket.`);
    } catch (err) {
      handleCustomerError(err);
    } finally {
      setBusyProductId(null);
    }
  }

  // ------------------------------------------
  // UPDATE PERSISTENT CART QUANTITY
  // ------------------------------------------

  async function changeCartQuantity(
    productId: string,
    change: number
  ) {
    if (!cart || busyProductId) return;

    const item = cart.items.find(
      (cartItem) => cartItem.productId === productId
    );

    if (!item) return;

    const newQuantity = item.quantity + change;

    setBusyProductId(productId);
    setNotice("");

    try {
      let updatedCart: CustomerCart;

      if (newQuantity <= 0) {
        updatedCart = await removeCartItem(item.id);
      } else {
        updatedCart = await updateCartItem(item.id, newQuantity);
      }

      setCart(updatedCart);
    } catch (err) {
      handleCustomerError(err);
    } finally {
      setBusyProductId(null);
    }
  }

  // ------------------------------------------
  // CART ITEM QUANTITY
  // ------------------------------------------

  function getProductQuantity(productId: string) {
    return (
      cart?.items.find(
        (item) => item.productId === productId
      )?.quantity ?? 0
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf8] pb-28 text-gray-900">

      {/* Announcement */}
      <div className="bg-green-800 px-4 py-2 text-center text-xs text-white sm:text-sm">
        Fresh groceries from your local shops, delivered to your doorstep.
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-8">

          <a href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-700 text-2xl">
              🛒
            </div>

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-green-800">
                ApnaBasket
              </h1>
              <p className="text-[10px] font-medium tracking-wider text-gray-500">
                APNA BAZAAR, APNI SUVIDHA
              </p>
            </div>
          </a>

          <div className="hidden flex-1 md:block">
            <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">Delivering to</p>
              <p className="text-sm font-semibold">
                📍 Shahabad, Rampur
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/account/addresses"
              className="hidden rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:inline-block"
            >
              Addresses
            </a>

            <a
              href="/login"
              className="hidden rounded-xl border border-green-700 px-3 py-3 text-sm font-semibold text-green-800 hover:bg-green-50 sm:inline-block"
            >
              Login
            </a>

            <button
              type="button"
              onClick={() => router.push("/cart")}
              className="flex items-center gap-2 rounded-xl bg-green-700 px-3 py-3 text-sm font-semibold text-white hover:bg-green-800 sm:px-4"
            >
              🛍️
              <span className="hidden sm:inline">My Cart</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-green-800">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile location */}
      <div className="border-b border-gray-100 bg-white px-4 py-3 md:hidden">
        <p className="text-xs text-gray-500">Your delivery location</p>
        <p className="text-sm font-semibold">
          📍 Shahabad, Rampur, Uttar Pradesh
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-green-950 via-green-800 to-green-600 px-6 py-10 text-white md:px-12 md:py-16">
          <div className="relative z-10 max-w-xl">
            <span className="inline-block rounded-full bg-white/15 px-4 py-2 text-xs font-semibold">
              🌿 YOUR NEIGHBOURHOOD GROCERY PARTNER
            </span>

            <h2 className="mt-5 text-4xl font-extrabold leading-tight md:text-5xl">
              Your daily needs,
              <br />
              <span className="text-green-200">
                just a basket away.
              </span>
            </h2>

            <p className="mt-4 max-w-md text-sm leading-7 text-green-50 md:text-base">
              Shop fresh groceries and everyday essentials
              from trusted local shops in Shahabad.
            </p>

            <a
              href="#products"
              className="mt-7 inline-flex rounded-xl bg-white px-6 py-3 font-bold text-green-900 hover:bg-green-100"
            >
              Start Shopping →
            </a>
          </div>

          <div className="pointer-events-none absolute -right-5 -top-8 text-[190px] opacity-20 md:right-10 md:text-[260px]">
            🧺
          </div>
        </section>

        {/* Search */}
        <section className="mt-8">
          <label
            htmlFor="product-search"
            className="mb-2 block text-sm font-bold"
          >
            What are you looking for?
          </label>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
            <span className="text-xl">🔍</span>

            <input
              id="product-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search atta, rice, milk, vegetables..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-sm font-semibold text-green-700"
              >
                Clear
              </button>
            )}
          </div>
        </section>

        {/* Categories */}
        <section className="mt-9">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-extrabold">
              Shop by category
            </h3>

            <span className="text-xs text-gray-500">
              Explore essentials
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${
                activeCategory === "all"
                  ? "border-green-700 bg-green-50 text-green-800"
                  : "border-gray-100 bg-white"
              }`}
            >
              <span className="text-3xl">🛒</span>
              <span className="text-xs font-semibold">All</span>
            </button>

            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => setActiveCategory(category.slug)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${
                  activeCategory === category.slug
                    ? "border-green-700 bg-green-50 text-green-800"
                    : "border-gray-100 bg-white"
                }`}
              >
                <span className="text-3xl">
                  {categoryIcons[category.slug] ?? "🛍️"}
                </span>

                <span className="text-center text-xs font-semibold">
                  {category.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Products */}
        <section id="products" className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-extrabold">
                {search
                  ? "Search results"
                  : activeCategory === "all"
                    ? "Popular products"
                    : categories.find(
                        (category) => category.slug === activeCategory
                      )?.name ?? "Products"}
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                Products from your local grocery catalogue
              </p>
            </div>

            <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-semibold text-green-800">
              {products.length} products
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-12 text-center text-sm text-gray-500">
              <div className="mb-3 text-3xl">🛒</div>
              Loading fresh products...
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-white p-10 text-center">
              <p className="font-bold text-red-700">
                Unable to load products
              </p>

              <p className="mt-2 text-sm text-gray-500">{error}</p>

              <button
                type="button"
                onClick={() => setRetryCount((value) => value + 1)}
                className="mt-4 rounded-lg bg-green-700 px-5 py-2 font-semibold text-white"
              >
                Retry
              </button>
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {products.map((product) => {
                const quantity = getProductQuantity(product.id);
                const isBusy = busyProductId === product.id;

                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="flex h-32 items-center justify-center bg-gradient-to-br from-green-50 to-gray-50 sm:h-40">
                      <span className="text-6xl">
                        {productIcons[product.categorySlug ?? ""] ?? "🛍️"}
                      </span>
                    </div>

                    <div className="p-3 sm:p-4">
                      <h4 className="line-clamp-1 text-sm font-bold">
                        {product.name}
                      </h4>

                      <p className="mt-1 text-xs text-gray-500">
                        {product.description ||
                          product.categoryName ||
                          "Daily essential"}
                      </p>

                      <p className="mt-2 text-xs text-gray-500">
                        {product.unitLabel}
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold">
                          {formatPrice(product.estimatedPricePaise)}
                        </span>

                        {quantity > 0 ? (
                          <div className="flex items-center gap-2 rounded-lg bg-green-700 px-2 py-1 text-white">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void changeCartQuantity(product.id, -1)
                              }
                              aria-label={`Decrease ${product.name} quantity`}
                              className="px-1 font-bold disabled:opacity-50"
                            >
                              −
                            </button>

                            <span className="min-w-5 text-center text-xs font-bold">
                              {quantity}
                            </span>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void addToCart(product)}
                              aria-label={`Increase ${product.name} quantity`}
                              className="px-1 font-bold disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              product.estimatedPricePaise === null ||
                              isBusy ||
                              cartLoading
                            }
                            onClick={() => void addToCart(product)}
                            className="rounded-lg border border-green-700 px-3 py-2 text-xs font-bold text-green-800 transition hover:bg-green-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isBusy ? "..." : "ADD +"}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <div className="text-4xl">🔎</div>

              <h4 className="mt-3 font-bold">No products found</h4>

              <p className="mt-2 text-sm text-gray-500">
                Try another search or category.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("all");
                }}
                className="mt-4 font-semibold text-green-700"
              >
                View all products
              </button>
            </div>
          )}
        </section>

        {/* Trust section */}
        <section className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: "🏪",
              title: "Local shops",
              detail: "Supporting neighbourhood stores",
            },
            {
              icon: "🛵",
              title: "Doorstep delivery",
              detail: "Convenience at your doorstep",
            },
            {
              icon: "💵",
              title: "Cash on delivery",
              detail: "Pay when your order arrives",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5"
            >
              <span className="text-3xl">{item.icon}</span>

              <div>
                <h4 className="text-sm font-bold">{item.title}</h4>
                <p className="mt-1 text-xs text-gray-500">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Mobile navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-3 py-3 md:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          <a href="/" className="flex flex-col items-center gap-1 text-green-800">
            <span>🏠</span>
            <span className="text-[10px] font-semibold">Home</span>
          </a>

          <a
            href="#products"
            className="flex flex-col items-center gap-1 text-gray-500"
          >
            <span>🛒</span>
            <span className="text-[10px]">Shop</span>
          </a>

          <button
            type="button"
            onClick={() => router.push("/cart")}
            className="flex flex-col items-center gap-1 text-gray-500"
          >
            <span>🧺</span>
            <span className="text-[10px]">Cart ({cartCount})</span>
          </button>

          <a
            href="/login"
            className="flex flex-col items-center gap-1 text-gray-500"
          >
            <span>👤</span>
            <span className="text-[10px]">Login</span>
          </a>
        </div>
      </nav>

      {/* Persistent cart summary */}
      {cartCount > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-30 mx-auto flex max-w-xl items-center justify-between rounded-2xl bg-green-800 p-4 text-white shadow-xl md:bottom-5">
          <div>
            <p className="text-xs text-green-100">
              {cartCount} items · Estimated subtotal
            </p>

            <p className="font-extrabold">{cartTotal}</p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/cart")}
            className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-green-900"
          >
            View Cart →
          </button>
        </div>
      )}

      {/* Feedback */}
      {notice && (
        <div
          role="status"
          className="fixed left-1/2 top-20 z-50 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-xl"
        >
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice("")}
            className="font-bold text-green-300"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
