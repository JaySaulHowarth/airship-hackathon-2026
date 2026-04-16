import { resolve } from "node:path";
import { config } from "dotenv";
import { MongoClient } from "mongodb";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const MENU_ITEMS_COLLECTION = "menu_items";
const ORDERS_COLLECTION = "orders";

const SEED_ITEMS = [
  {
    id: "item-crispy-wings",
    name: "Crispy wings",
    price: 750,
    kind: "food" as const,
    description: "Six wings, house rub",
    available: true,
  },
  {
    id: "item-cheeseburger",
    name: "Cheeseburger",
    price: 1250,
    kind: "food" as const,
    description: "Beef patty, cheddar, pickles",
    available: true,
  },
  {
    id: "item-garden-salad",
    name: "Garden salad",
    price: 650,
    kind: "food" as const,
    description: "Seasonal greens, vinaigrette",
    available: true,
  },
  {
    id: "item-lager",
    name: "House lager",
    price: 550,
    kind: "drink" as const,
    description: "Pint",
    available: true,
  },
  {
    id: "item-espresso",
    name: "Espresso",
    price: 280,
    kind: "drink" as const,
    description: "Double shot",
    available: true,
  },
  {
    id: "item-sparkling-water",
    name: "Sparkling water",
    price: 320,
    kind: "drink" as const,
    description: "500ml bottle",
    available: true,
  },
];

function rethrow(message: string, cause: unknown): never {
  if (cause instanceof Error) {
    throw new Error(message, { cause });
  }
  throw new Error(`${message} ${String(cause)}`);
}

function logError(label: string, err: unknown) {
  console.error(label);
  let current: unknown = err;
  let depth = 0;
  while (current instanceof Error && depth < 6) {
    console.error(current.message);
    if (current.stack) console.error(current.stack);
    current = current.cause;
    depth += 1;
  }
  if (current !== undefined && !(current instanceof Error)) {
    console.error(String(current));
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required (set in .env.local or the environment).");
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB ?? "table_order";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });

  try {
    try {
      console.log(
        `Connecting to MongoDB (database "${dbName}", server selection timeout 10s)...`,
      );
      await client.connect();
      console.log("Connected. Ensuring indexes and upserting menu items...");
    } catch (err) {
      rethrow("Failed to connect to MongoDB.", err);
    }

    const db = client.db(dbName);

    try {
      await db.collection(MENU_ITEMS_COLLECTION).createIndex({ id: 1 }, { unique: true });
      await db.collection(ORDERS_COLLECTION).createIndex({ createdAt: -1 });
    } catch (err) {
      rethrow(`Failed to ensure indexes on database "${dbName}".`, err);
    }

    for (const item of SEED_ITEMS) {
      try {
        await db.collection(MENU_ITEMS_COLLECTION).replaceOne(
          { id: item.id },
          { ...item },
          { upsert: true },
        );
      } catch (err) {
        rethrow(`Failed to upsert menu item "${item.id}" (${item.name}).`, err);
      }
    }

    console.log(
      `Seeded ${SEED_ITEMS.length} menu items into "${dbName}" / "${MENU_ITEMS_COLLECTION}".`,
    );
  } finally {
    try {
      await client.close();
    } catch (err) {
      logError("Failed to close MongoDB client.", err);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  logError("Seed failed.", err);
  process.exit(1);
});
