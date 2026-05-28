# MaithilCart Marketplace

Deployable Myntra-style fashion ecommerce marketplace:

- Buyer signup/signin, catalog browsing, cart, mock card payment, order history
- Seller signup/signin, approval-gated product upload, order visibility, payout ledger
- Admin signin, seller approval/suspension, listing permissions, product approval
- Go backend with Postgres, JWT auth, bcrypt password hashing, SQL migrations
- React/Vite scalable frontend with role-based workspaces

## Demo Accounts

- Buyer: `buyer@maithilcart.test` / `shop1234`
- Seller: `seller@maithilcart.test` / `seller1234`
- Admin: `admin@maithilcart.test` / `admin1234`

## Local Production-Like Run

Install Docker Desktop first. Then run:

```bash
npm run install:all
docker compose up --build
```

Frontend: `http://localhost:5173`
API: `http://localhost:8080`
Postgres: `localhost:5432`

In Docker Desktop, the frontend container calls `/api/*` and Vite proxies those requests to the API container at `http://api:8080`. For deployed frontend builds, set `VITE_API_BASE_URL` to your live API URL.

The API runs migrations at startup and seeds demo data when `SEED_DEMO=true`.

If you already ran the old app name with Docker, remove the old Postgres volume before starting fresh:

```bash
docker compose down -v
docker compose up --build
```

## Backend Environment

Copy `backend/.env.example` into your deployment environment and set:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `PAYMENT_PROVIDER`

The current payment provider is a production-safe mock boundary: checkout records a successful payment and seller payout entries. Replace the provider implementation in `backend/cmd/api/main.go` with Razorpay/Stripe before taking real money.

## Build

```bash
npm run build --prefix client
cd backend && go build -o maithilcart-api ./cmd/api
```

## Low-Cost Hosting Shape

For early production, put the frontend on a CDN/static host, run the Go API as 2+ small containers/VMs behind a load balancer, and use managed Postgres with connection pooling. Keep product images on object storage/CDN, not in the API server.
