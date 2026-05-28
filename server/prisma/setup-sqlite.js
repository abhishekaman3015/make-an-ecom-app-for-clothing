import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databasePath = join(__dirname, "dev.db");

mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CUSTOMER',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS Product (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priceCents INTEGER NOT NULL,
  image TEXT NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS ProductVariant (
  id TEXT PRIMARY KEY NOT NULL,
  productId TEXT NOT NULL,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  stock INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT ProductVariant_productId_fkey FOREIGN KEY (productId) REFERENCES Product (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS CartItem (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  variantId TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT CartItem_userId_fkey FOREIGN KEY (userId) REFERENCES User (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT CartItem_variantId_fkey FOREIGN KEY (variantId) REFERENCES ProductVariant (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  totalCents INTEGER NOT NULL,
  customerName TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL,
  CONSTRAINT Order_userId_fkey FOREIGN KEY (userId) REFERENCES User (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS OrderItem (
  id TEXT PRIMARY KEY NOT NULL,
  orderId TEXT NOT NULL,
  productId TEXT NOT NULL,
  variantId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  priceCents INTEGER NOT NULL,
  CONSTRAINT OrderItem_orderId_fkey FOREIGN KEY (orderId) REFERENCES "Order" (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT OrderItem_productId_fkey FOREIGN KEY (productId) REFERENCES Product (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT OrderItem_variantId_fkey FOREIGN KEY (variantId) REFERENCES ProductVariant (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS Product_category_idx ON Product(category);
CREATE INDEX IF NOT EXISTS Product_active_idx ON Product(active);
CREATE INDEX IF NOT EXISTS ProductVariant_productId_idx ON ProductVariant(productId);
CREATE UNIQUE INDEX IF NOT EXISTS CartItem_userId_variantId_key ON CartItem(userId, variantId);
CREATE INDEX IF NOT EXISTS Order_userId_idx ON "Order"(userId);
CREATE INDEX IF NOT EXISTS Order_status_idx ON "Order"(status);
`);

db.close();
console.log(`SQLite database ready at ${databasePath}`);
