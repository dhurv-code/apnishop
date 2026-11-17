
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  Shop,
  CatalogCategory,
  CatalogProduct,
  ShopProduct,
  getCatalogShops,
  createCatalogShop,
  updateShopStatus,
  getCatalogCategories,
  createCatalogCategory,
  getCatalogProducts,
  createCatalogProduct,
  updateProductStatus,
  getShopProducts,
  saveShopProduct,
} from "@/lib/admin-catalog";

type Tab = "shops" | "categories" | "products" | "pricing";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-green-600";

export default function AdminCatalogPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("shops");

  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);

  const [selectedShop, setSelectedShop] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [shopData, categoryData, productData] = await Promise.all([
        getCatalogShops(),
        getCatalogCategories(),
        getCatalogProducts(),
      ]);

      setShops(shopData);
      setCategories(categoryData);
      setProducts(productData);

      if (!selectedShop && shopData.length > 0) {
        setSelectedShop(
          shopData.find((shop) => shop.status === "ACTIVE")?.id ||
          shopData[0].id
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load catalogue.";

      if (message.includes("Authentication required") ||
          message.includes("Administrator access required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router, selectedShop]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedShop) {
      setShopProducts([]);
      return;
    }

    getShopProducts(selectedShop)
      .then(setShopProducts)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Unable to load shop products."
        );
      });
  }, [selectedShop]);

  async function handleAction(
    action: () => Promise<unknown>,
    successMessage: string
  ) {
    try {
      setSaving(true);
      setError("");
      setNotice("");

      await action();

      setNotice(successMessage);
      await loadData();

      if (selectedShop) {
        const result = await getShopProducts(selectedShop);
        setShopProducts(result);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Operation failed."
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const data = {
      name: String(form.get("name")),
      ownerName: String(form.get("ownerName")),
      phone: String(form.get("phone")),
      email: String(form.get("email") || "") || undefined,
      addressLine1: String(form.get("addressLine1")),
      locality: String(form.get("locality")),
      city: String(form.get("city")),
      district: String(form.get("district")),
      state: String(form.get("state")),
      postalCode: String(form.get("postalCode")),
      landmark: String(form.get("landmark") || "") || undefined,
    };

    await handleAction(
      () => createCatalogShop(data),
      "Shop registered. It is awaiting approval."
    );

    event.currentTarget.reset();
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const data = {
      name: String(form.get("name")),
      slug: String(form.get("slug")).toLowerCase().trim(),
      description: String(form.get("description") || "") || null,
      sortOrder: Number(form.get("sortOrder") || 0),
      isActive: true,
    };

    await handleAction(
      () => createCatalogCategory(data),
      "Category created successfully."
    );

    event.currentTarget.reset();
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const price = String(form.get("price"));

    const data = {
      name: String(form.get("name")),
      slug: String(form.get("slug")).toLowerCase().trim(),
      brand: String(form.get("brand") || "") || null,
      description: String(form.get("description") || "") || null,
      unitLabel: String(form.get("unitLabel")),
      categoryId: String(form.get("categoryId") || "") || null,
      estimatedPricePaise:
        price.trim() === "" ? null : Math.round(Number(price) * 100),
      imageUrl: String(form.get("imageUrl") || "").trim() || null,
    };

    await handleAction(
      () => createCatalogProduct(data),
      "Product created successfully."
    );

    event.currentTarget.reset();
  }

  async function submitShopPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    if (!selectedShop || !selectedProduct) {
      setError("Select a shop and product.");
      return;
    }

    await handleAction(
      () =>
        saveShopProduct(
          selectedShop,
          selectedProduct,
          {
            pricePaise: Math.round(
              Number(form.get("price")) * 100
            ),
            availability: String(
              form.get("availability")
            ) as ShopProduct["availability"],
          }
        ),
      "Shop product price and availability saved."
    );
  }

  function money(paise: number | null) {
    if (paise === null) return "Not set";

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(paise / 100);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "shops", label: "Shops" },
    { id: "categories", label: "Categories" },
    { id: "products", label: "Products" },
    { id: "pricing", label: "Shop pricing" },
  ];

  return (
    <main className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div>
            <a href="/admin" className="text-xs font-semibold text-green-700">
              ← Admin dashboard
            </a>
            <h1 className="mt-1 text-xl font-extrabold text-green-800">
              Shop & Product Management
            </h1>
          </div>

          <button
            onClick={() => void loadData()}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-2xl font-extrabold">{shops.length}</p>
            <p className="mt-1 text-xs text-gray-500">Registered shops</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-2xl font-extrabold">{products.length}</p>
            <p className="mt-1 text-xs text-gray-500">Master products</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-2xl font-extrabold">{categories.length}</p>
            <p className="mt-1 text-xs text-gray-500">Categories</p>
          </div>
        </div>

        {notice && (
          <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2 rounded-xl bg-gray-100 p-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                tab === item.id
                  ? "bg-white text-green-800 shadow-sm"
                  : "text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-10 text-center text-gray-500">
            Loading catalogue...
          </div>
        ) : (
          <>
            {/* SHOPS */}
            {tab === "shops" && (
              <div className="mt-7 grid gap-6 lg:grid-cols-[360px_1fr]">
                <form onSubmit={submitShop} className="h-fit space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-extrabold">Register a local shop</h2>

                  {[
                    ["name", "Shop name"],
                    ["ownerName", "Owner name"],
                    ["phone", "Shop mobile number"],
                    ["email", "Email (optional)"],
                    ["addressLine1", "Shop address"],
                    ["locality", "Locality"],
                    ["landmark", "Landmark (optional)"],
                    ["city", "City"],
                    ["district", "District"],
                    ["state", "State"],
                    ["postalCode", "PIN code"],
                  ].map(([name, label]) => (
                    <input
                      key={name}
                      name={name}
                      required={!["email", "landmark"].includes(name)}
                      placeholder={label}
                      className={inputClass}
                      maxLength={name === "postalCode" ? 6 : 200}
                    />
                  ))}

                  <button
                    disabled={saving}
                    className="w-full rounded-xl bg-green-700 py-3 font-bold text-white disabled:opacity-50"
                  >
                    Register shop
                  </button>
                </form>

                <section className="space-y-3">
                  <h2 className="text-lg font-extrabold">Registered shops</h2>

                  {shops.length === 0 ? (
                    <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
                      No shops registered yet.
                    </div>
                  ) : shops.map((shop) => (
                    <article key={shop.id} className="rounded-2xl bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{shop.name}</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            Owner: {shop.ownerName}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            {shop.phone} · {shop.locality}, {shop.city}
                          </p>
                        </div>
                        <span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                          {shop.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {shop.status !== "ACTIVE" && (
                          <button
                            disabled={busyId === shop.id}
                            onClick={() => {
                              setBusyId(shop.id);
                              void handleAction(
                                () => updateShopStatus(shop.id, "ACTIVE"),
                                "Shop activated."
                              ).finally(() => setBusyId(""));
                            }}
                            className="rounded-lg bg-green-700 px-4 py-2 text-xs font-bold text-white"
                          >
                            Approve and activate
                          </button>
                        )}

                        {shop.status === "ACTIVE" && (
                          <button
                            onClick={() => {
                              void handleAction(
                                () => updateShopStatus(shop.id, "INACTIVE"),
                                "Shop deactivated."
                              );
                            }}
                            className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-600"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            )}

            {/* CATEGORIES */}
            {tab === "categories" && (
              <div className="mt-7 grid gap-6 lg:grid-cols-[360px_1fr]">
                <form onSubmit={submitCategory} className="h-fit space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-extrabold">Create category</h2>

                  <input name="name" required placeholder="Category name" className={inputClass}/>
                  <input name="slug" required placeholder="Slug (e.g. fresh-fruits)" className={inputClass}/>
                  <textarea name="description" placeholder="Description" className={inputClass}/>
                  <input name="sortOrder" type="number" min="0" defaultValue="0" className={inputClass}/>

                  <button disabled={saving} className="w-full rounded-xl bg-green-700 py-3 font-bold text-white">
                    Create category
                  </button>
                </form>

                <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <h2 className="p-5 text-lg font-extrabold">Categories</h2>
                  <div className="divide-y">
                    {categories.map((category) => (
                      <div key={category.id} className="flex justify-between gap-3 p-4">
                        <div>
                          <p className="font-bold">{category.name}</p>
                          <p className="text-xs text-gray-500">{category.slug}</p>
                        </div>
                        <span className="text-xs text-gray-500">
                          {category.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* PRODUCTS */}
            {tab === "products" && (
              <div className="mt-7 grid gap-6 lg:grid-cols-[360px_1fr]">
                <form onSubmit={submitProduct} className="h-fit space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-extrabold">Create product</h2>

                  <input name="name" required placeholder="Product name" className={inputClass}/>
                  <input name="slug" required placeholder="Slug (e.g. fresh-tomatoes)" className={inputClass}/>
                  <input name="brand" placeholder="Brand (optional)" className={inputClass}/>
                  <input name="unitLabel" required placeholder="Unit (e.g. 1 kg, 500 ml)" className={inputClass}/>
                  <input name="price" type="number" step="0.01" min="0" placeholder="Estimated price (₹)" className={inputClass}/>
                  <input name="imageUrl" type="url" placeholder="Product image URL (https://...)" className={inputClass}/>
                  <p className="-mt-1 text-xs text-gray-500">Paste a direct, publicly accessible image URL. The image will appear on the customer homepage.</p>

                  <select name="categoryId" className={inputClass}>
                    <option value="">No category</option>
                    {categories.filter((category) => category.isActive).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>

                  <textarea name="description" placeholder="Product description" className={inputClass}/>

                  <button disabled={saving} className="w-full rounded-xl bg-green-700 py-3 font-bold text-white">
                    Create product
                  </button>
                </form>

                <section className="space-y-3">
                  <h2 className="text-lg font-extrabold">Master catalogue</h2>

                  {products.map((product) => (
                    <article key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
                      <div>
                        <p className="font-bold">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          {product.categoryName || "Uncategorised"} · {product.unitLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-green-800">
                          {money(product.estimatedPricePaise)}
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          void handleAction(
                            () => updateProductStatus(
                              product.id,
                              product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                            ),
                            "Product status updated."
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${
                          product.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {product.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                    </article>
                  ))}
                </section>
              </div>
            )}

            {/* SHOP-SPECIFIC PRICES */}
            {tab === "pricing" && (
              <div className="mt-7 grid gap-6 lg:grid-cols-[360px_1fr]">
                <form onSubmit={submitShopPrice} className="h-fit space-y-4 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-extrabold">Configure shop product</h2>

                  <div>
                    <label className="mb-1 block text-xs font-semibold">Select shop</label>
                    <select
                      required
                      value={selectedShop}
                      onChange={(e) => setSelectedShop(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose shop</option>
                      {shops.filter((shop) => shop.status === "ACTIVE").map((shop) => (
                        <option key={shop.id} value={shop.id}>
                          {shop.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold">Select product</label>
                    <select
                      required
                      value={selectedProduct}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose product</option>
                      {products.filter((product) => product.status === "ACTIVE").map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold">Shop price (₹)</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      className={inputClass}
                      placeholder="30.00"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold">Availability</label>
                    <select name="availability" className={inputClass}>
                      <option value="AVAILABLE">Available</option>
                      <option value="UNAVAILABLE">Unavailable</option>
                      <option value="NOT_CHECKED">Not checked</option>
                    </select>
                  </div>

                  <button
                    disabled={saving || !selectedShop || !selectedProduct}
                    className="w-full rounded-xl bg-green-700 py-3 font-bold text-white disabled:opacity-50"
                  >
                    Save shop pricing
                  </button>
                </form>

                <section>
                  <h2 className="mb-4 text-lg font-extrabold">
                    Shop catalogue
                  </h2>

                  {shopProducts.length === 0 ? (
                    <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
                      No shop products configured yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {shopProducts.map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
                          <div>
                            <p className="font-bold">{item.productName}</p>
                            <p className="text-xs text-gray-500">{item.unitLabel}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{money(item.pricePaise)}</p>
                            <p className="text-xs text-gray-500">{item.availability}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
