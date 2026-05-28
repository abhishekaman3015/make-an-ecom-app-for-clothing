import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    name: "Ridge Overshirt",
    slug: "ridge-overshirt",
    description: "Structured cotton twill overshirt with room for layered city days.",
    category: "Outerwear",
    priceCents: 8900,
    image: "/assets/ridge-overshirt.svg",
    featured: true,
    variants: [
      ["S", "Moss", "TH-RDG-MOS-S", 12],
      ["M", "Moss", "TH-RDG-MOS-M", 18],
      ["L", "Ink", "TH-RDG-INK-L", 9]
    ]
  },
  {
    name: "Loopback Hoodie",
    slug: "loopback-hoodie",
    description: "Midweight fleece hoodie with a compact fit and brushed interior.",
    category: "Sweats",
    priceCents: 7600,
    image: "/assets/loopback-hoodie.svg",
    featured: true,
    variants: [
      ["S", "Clay", "TH-LPB-CLY-S", 11],
      ["M", "Clay", "TH-LPB-CLY-M", 15],
      ["L", "Charcoal", "TH-LPB-CHR-L", 20]
    ]
  },
  {
    name: "Everyday Tee",
    slug: "everyday-tee",
    description: "Garment-dyed organic cotton tee built for repeat wear.",
    category: "Tops",
    priceCents: 3400,
    image: "/assets/everyday-tee.svg",
    featured: false,
    variants: [
      ["XS", "White", "TH-EVD-WHT-XS", 25],
      ["M", "Black", "TH-EVD-BLK-M", 31],
      ["XL", "Sage", "TH-EVD-SAG-XL", 16]
    ]
  },
  {
    name: "Tapered Utility Pant",
    slug: "tapered-utility-pant",
    description: "Clean utility pant with reinforced seams and a gentle taper.",
    category: "Bottoms",
    priceCents: 9400,
    image: "/assets/utility-pant.svg",
    featured: true,
    variants: [
      ["30", "Black", "TH-TUP-BLK-30", 8],
      ["32", "Black", "TH-TUP-BLK-32", 14],
      ["34", "Stone", "TH-TUP-STN-34", 10]
    ]
  }
];

async function main() {
  const adminPassword = await bcrypt.hash("admin1234", 10);
  const customerPassword = await bcrypt.hash("shop1234", 10);

  await prisma.user.upsert({
    where: { email: "admin@threadhaus.test" },
    update: {},
    create: {
      name: "Threadhaus Admin",
      email: "admin@threadhaus.test",
      passwordHash: adminPassword,
      role: "ADMIN"
    }
  });

  await prisma.user.upsert({
    where: { email: "mira@threadhaus.test" },
    update: {},
    create: {
      name: "Mira Customer",
      email: "mira@threadhaus.test",
      passwordHash: customerPassword,
      role: "CUSTOMER"
    }
  });

  for (const item of products) {
    await prisma.product.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
        name: item.name,
        slug: item.slug,
        description: item.description,
        category: item.category,
        priceCents: item.priceCents,
        image: item.image,
        featured: item.featured,
        variants: {
          create: item.variants.map(([size, color, sku, stock]) => ({
            size,
            color,
            sku,
            stock
          }))
        }
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
