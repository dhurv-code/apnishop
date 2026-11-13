
import { db, pool } from "./index.js";
import { categories, products } from "./schema.js";

const categoryData = [
  { name: "Fruits", slug: "fruits", sortOrder: 1 },
  { name: "Vegetables", slug: "vegetables", sortOrder: 2 },
  { name: "Dairy", slug: "dairy", sortOrder: 3 },
  { name: "Atta & Rice", slug: "atta-rice", sortOrder: 4 },
  { name: "Snacks", slug: "snacks", sortOrder: 5 },
  { name: "Essentials", slug: "essentials", sortOrder: 6 },
];

const productData = [
  {
    name: "Fresh Tomatoes",
    slug: "fresh-tomatoes",
    description: "Farm fresh tomatoes",
    unitLabel: "500 g",
    estimatedPricePaise: 3000,
    categorySlug: "vegetables",
  },
  {
    name: "Fresh Potatoes",
    slug: "fresh-potatoes",
    description: "Everyday cooking essential",
    unitLabel: "1 kg",
    estimatedPricePaise: 2500,
    categorySlug: "vegetables",
  },
  {
    name: "Fresh Bananas",
    slug: "fresh-bananas",
    description: "Naturally sweet bananas",
    unitLabel: "6 pcs",
    estimatedPricePaise: 4000,
    categorySlug: "fruits",
  },
  {
    name: "Full Cream Milk",
    slug: "full-cream-milk",
    description: "Daily dairy essential",
    unitLabel: "500 ml",
    estimatedPricePaise: 3400,
    categorySlug: "dairy",
  },
  {
    name: "Basmati Rice",
    slug: "basmati-rice",
    description: "Premium quality rice",
    unitLabel: "1 kg",
    estimatedPricePaise: 7500,
    categorySlug: "atta-rice",
  },
  {
    name: "Whole Wheat Atta",
    slug: "whole-wheat-atta",
    description: "Everyday wheat flour",
    unitLabel: "1 kg",
    estimatedPricePaise: 4500,
    categorySlug: "atta-rice",
  },
  {
    name: "Fresh Apples",
    slug: "fresh-apples",
    description: "Crisp and juicy apples",
    unitLabel: "500 g",
    estimatedPricePaise: 9000,
    categorySlug: "fruits",
  },
  {
    name: "Tea Biscuits",
    slug: "tea-biscuits",
    description: "Biscuits for tea time",
    unitLabel: "Pack",
    estimatedPricePaise: 2000,
    categorySlug: "snacks",
  },
];

async function seedDatabase() {
  try {
    await db
      .insert(categories)
      .values(categoryData)
      .onConflictDoNothing();

    const savedCategories = await db
      .select({
        id: categories.id,
        slug: categories.slug,
      })
      .from(categories);

    const categoryMap = new Map(
      savedCategories.map((category) => [
        category.slug,
        category.id,
      ])
    );

    const savedProducts = productData.map((product) => {
      const categoryId = categoryMap.get(product.categorySlug);

      if (!categoryId) {
        throw new Error(
          `Category missing: ${product.categorySlug}`
        );
      }

      return {
        name: product.name,
        slug: product.slug,
        description: product.description,
        unitLabel: product.unitLabel,
        estimatedPricePaise: product.estimatedPricePaise,
        categoryId,
      };
    });

    await db
      .insert(products)
      .values(savedProducts)
      .onConflictDoNothing();

    console.log("ApnaBasket sample data seeded successfully.");
    console.log(`Categories: ${savedCategories.length}`);
    console.log(`Products processed: ${savedProducts.length}`);
  } catch (error) {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedDatabase();
