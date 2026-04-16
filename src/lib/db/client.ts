import { MongoClient, type Db } from "mongodb";
import { MENU_ITEMS_COLLECTION, ORDERS_COLLECTION } from "./collections";

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
};

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  return uri;
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB ?? "table_order";
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(getMongoUri());
    await globalForMongo.mongoClient.connect();
  }
  return globalForMongo.mongoClient;
}

let indexesEnsured = false;

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  if (!indexesEnsured) {
    indexesEnsured = true;
    await db.collection(ORDERS_COLLECTION).createIndex({ createdAt: -1 });
    await db.collection(MENU_ITEMS_COLLECTION).createIndex({ id: 1 }, { unique: true });
  }
  return db;
}
