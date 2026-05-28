import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "dev-secret";

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

const money = (cents) => Math.round(Number(cents));

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: "7d" });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authorization token" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ message: "Invalid user" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function productInclude() {
  return {
    variants: { orderBy: [{ color: "asc" }, { size: "asc" }] }
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "threadhaus-api" });
});

app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8)
  });
  const data = schema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash }
  });

  res.status(201).json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });
  const data = schema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ id, name, email, role });
});

app.get("/api/products", async (req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: productInclude(),
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }]
  });
  res.json(products);
});

app.get("/api/admin/products", requireAuth, requireAdmin, async (req, res) => {
  const products = await prisma.product.findMany({
    include: productInclude(),
    orderBy: { createdAt: "desc" }
  });
  res.json(products);
});

app.post("/api/admin/products", requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().min(5),
    category: z.string().min(2),
    priceCents: z.number().int().positive(),
    image: z.string().default("/assets/everyday-tee.svg"),
    featured: z.boolean().default(false),
    active: z.boolean().default(true),
    variants: z.array(z.object({
      size: z.string().min(1),
      color: z.string().min(1),
      sku: z.string().min(3),
      stock: z.number().int().nonnegative()
    })).min(1)
  });
  const data = schema.parse(req.body);
  const product = await prisma.product.create({
    data: {
      ...data,
      variants: { create: data.variants }
    },
    include: productInclude()
  });
  res.status(201).json(product);
});

app.patch("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    description: z.string().min(5).optional(),
    category: z.string().min(2).optional(),
    priceCents: z.number().int().positive().optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional()
  });
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: schema.parse(req.body),
    include: productInclude()
  });
  res.json(product);
});

app.get("/api/cart", requireAuth, async (req, res) => {
  const items = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: {
      variant: {
        include: { product: true }
      }
    },
    orderBy: { id: "asc" }
  });
  res.json(items);
});

app.post("/api/cart", requireAuth, async (req, res) => {
  const schema = z.object({
    variantId: z.string(),
    quantity: z.number().int().min(1).max(20)
  });
  const data = schema.parse(req.body);
  const item = await prisma.cartItem.upsert({
    where: { userId_variantId: { userId: req.user.id, variantId: data.variantId } },
    update: { quantity: { increment: data.quantity } },
    create: { userId: req.user.id, variantId: data.variantId, quantity: data.quantity }
  });
  res.status(201).json(item);
});

app.patch("/api/cart/:id", requireAuth, async (req, res) => {
  const schema = z.object({ quantity: z.number().int().min(1).max(20) });
  const existing = await prisma.cartItem.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!existing) return res.status(404).json({ message: "Cart item not found" });
  const item = await prisma.cartItem.update({
    where: { id: req.params.id },
    data: schema.parse(req.body)
  });
  res.json(item);
});

app.delete("/api/cart/:id", requireAuth, async (req, res) => {
  const existing = await prisma.cartItem.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  });
  if (!existing) return res.status(404).json({ message: "Cart item not found" });
  await prisma.cartItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

app.post("/api/checkout", requireAuth, async (req, res) => {
  const schema = z.object({
    customerName: z.string().min(2),
    email: z.string().email(),
    address: z.string().min(8)
  });
  const data = schema.parse(req.body);
  const cart = await prisma.cartItem.findMany({
    where: { userId: req.user.id },
    include: { variant: { include: { product: true } } }
  });

  if (!cart.length) return res.status(400).json({ message: "Cart is empty" });

  const insufficient = cart.find((item) => item.quantity > item.variant.stock);
  if (insufficient) {
    return res.status(409).json({ message: `${insufficient.variant.sku} does not have enough stock` });
  }

  const totalCents = cart.reduce(
    (sum, item) => sum + item.quantity * money(item.variant.product.priceCents),
    0
  );

  const order = await prisma.$transaction(async (tx) => {
    for (const item of cart) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } }
      });
    }

    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        totalCents,
        ...data,
        items: {
          create: cart.map((item) => ({
            productId: item.variant.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            priceCents: item.variant.product.priceCents
          }))
        }
      },
      include: { items: { include: { product: true, variant: true } } }
    });

    await tx.cartItem.deleteMany({ where: { userId: req.user.id } });
    return created;
  });

  res.status(201).json(order);
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const where = req.user.role === "ADMIN" ? {} : { userId: req.user.id };
  const orders = await prisma.order.findMany({
    where,
    include: { items: { include: { product: true, variant: true } } },
    orderBy: { createdAt: "desc" }
  });
  res.json(orders);
});

app.patch("/api/admin/orders/:id", requireAuth, requireAdmin, async (req, res) => {
  const schema = z.object({
    status: z.enum(["PENDING", "PAID", "FULFILLED", "CANCELLED"])
  });
  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: schema.parse(req.body),
    include: { items: { include: { product: true, variant: true } } }
  });
  res.json(order);
});

app.get("/api/admin/summary", requireAuth, requireAdmin, async (req, res) => {
  const [products, orders, users, revenue] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.user.count(),
    prisma.order.aggregate({ _sum: { totalCents: true } })
  ]);
  res.json({
    products,
    orders,
    users,
    revenueCents: revenue._sum.totalCents || 0
  });
});

app.use((error, req, res, next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Validation failed", details: error.flatten() });
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
});

app.listen(port, () => {
  console.log(`Threadhaus API running at http://localhost:${port}`);
});
