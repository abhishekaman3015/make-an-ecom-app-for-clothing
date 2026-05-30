package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

type app struct {
	db              *pgxpool.Pool
	jwtSecret       []byte
	corsOrigins     []string
	paymentProvider string
}

type user struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatarUrl"`
	Phone     *string `json:"phone"`
}

type authContext struct {
	UserID string
	Role   string
}

type product struct {
	ID             string    `json:"id"`
	SellerID       string    `json:"sellerId"`
	StoreName      string    `json:"storeName"`
	Title          string    `json:"title"`
	Slug           string    `json:"slug"`
	Description    string    `json:"description"`
	Brand          string    `json:"brand"`
	Category       string    `json:"category"`
	Gender         string    `json:"gender"`
	ImageURL       string    `json:"imageUrl"`
	MRPCents       int       `json:"mrpCents"`
	SalePriceCents int       `json:"salePriceCents"`
	Active         bool      `json:"active"`
	Approved       bool      `json:"approved"`
	Variants       []variant `json:"variants"`
}

type variant struct {
	ID        string `json:"id"`
	ProductID string `json:"productId"`
	SKU       string `json:"sku"`
	Size      string `json:"size"`
	Color     string `json:"color"`
	Stock     int    `json:"stock"`
}

type order struct {
	ID              string      `json:"id"`
	Status          string      `json:"status"`
	SubtotalCents   int         `json:"subtotalCents"`
	ShippingCents   int         `json:"shippingCents"`
	TotalCents      int         `json:"totalCents"`
	ShippingName    string      `json:"shippingName"`
	ShippingPhone   string      `json:"shippingPhone"`
	ShippingAddress string      `json:"shippingAddress"`
	PaymentStatus   string      `json:"paymentStatus"`
	CreatedAt       time.Time   `json:"createdAt"`
	Items           []orderItem `json:"items"`
}

type orderItem struct {
	ID                string `json:"id"`
	ProductTitle      string `json:"productTitle"`
	SellerStore       string `json:"sellerStore"`
	Size              string `json:"size"`
	Color             string `json:"color"`
	Quantity          int    `json:"quantity"`
	UnitPriceCents    int    `json:"unitPriceCents"`
	SellerAmountCents int    `json:"sellerAmountCents"`
}

func main() {
	ctx := context.Background()
	databaseURL := env("DATABASE_URL", "postgres://maithilcart:maithilcart@localhost:5432/maithilcart?sslmode=disable")
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	a := &app{
		db:              db,
		jwtSecret:       []byte(env("JWT_SECRET", "dev-secret-change-me")),
		corsOrigins:     parseOrigins(env("CORS_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173")),
		paymentProvider: env("PAYMENT_PROVIDER", "mock"),
	}

	if err := a.migrate(ctx); err != nil {
		log.Fatal(err)
	}
	if env("SEED_DEMO", "true") == "true" {
		if err := a.seed(ctx); err != nil {
			log.Fatal(err)
		}
	}

	if err := os.MkdirAll("uploads", 0755); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	
	// File Upload Serving
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))
	mux.HandleFunc("POST /api/upload", a.upload)

	// Auth & Profile
	mux.HandleFunc("POST /api/auth/signup", a.signup)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/google", a.googleLogin)
	mux.HandleFunc("PATCH /api/user/profile", a.withAuth("", a.updateProfile))

	// User Addresses
	mux.HandleFunc("GET /api/user/addresses", a.withAuth("BUYER", a.getAddresses))
	mux.HandleFunc("POST /api/user/addresses", a.withAuth("BUYER", a.createAddress))
	mux.HandleFunc("DELETE /api/user/addresses/{id}", a.withAuth("BUYER", a.deleteAddress))

	// Catalog
	mux.HandleFunc("GET /api/products", a.products)
	
	// Cart & Checkout
	mux.HandleFunc("GET /api/cart", a.withAuth("BUYER", a.cart))
	mux.HandleFunc("POST /api/cart", a.withAuth("BUYER", a.addCart))
	mux.HandleFunc("PATCH /api/cart/{id}", a.withAuth("BUYER", a.updateCart))
	mux.HandleFunc("DELETE /api/cart/{id}", a.withAuth("BUYER", a.deleteCart))
	mux.HandleFunc("POST /api/checkout", a.withAuth("BUYER", a.checkout))
	mux.HandleFunc("GET /api/orders", a.withAuth("", a.orders))
	
	// Seller endpoints
	mux.HandleFunc("GET /api/seller/me", a.withAuth("SELLER", a.sellerMe))
	mux.HandleFunc("PATCH /api/seller/me", a.withAuth("SELLER", a.updateSellerMe))
	mux.HandleFunc("GET /api/seller/products", a.withAuth("SELLER", a.sellerProducts))
	mux.HandleFunc("POST /api/seller/products", a.withAuth("SELLER", a.createProduct))
	mux.HandleFunc("GET /api/seller/payouts", a.withAuth("SELLER", a.sellerPayouts))
	
	// Admin endpoints
	mux.HandleFunc("GET /api/admin/sellers", a.withAuth("ADMIN", a.adminSellers))
	mux.HandleFunc("PATCH /api/admin/sellers/{id}", a.withAuth("ADMIN", a.adminUpdateSeller))
	mux.HandleFunc("GET /api/admin/orders", a.withAuth("ADMIN", a.adminOrders))
	mux.HandleFunc("PATCH /api/admin/products/{id}", a.withAuth("ADMIN", a.adminUpdateProduct))

	port := env("PORT", "8080")
	log.Printf("MaithilCart API listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, a.cors(mux)))
}

func (a *app) migrate(ctx context.Context) error {
	files, err := filepath.Glob("migrations/*.sql")
	if err != nil || len(files) == 0 {
		return err
	}
	for _, file := range files {
		body, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		if _, err := a.db.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", file, err)
		}
	}
	return nil
}

func (a *app) seed(ctx context.Context) error {
	adminPass, _ := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
	buyerPass, _ := bcrypt.GenerateFromPassword([]byte("shop1234"), bcrypt.DefaultCost)
	sellerPass, _ := bcrypt.GenerateFromPassword([]byte("seller1234"), bcrypt.DefaultCost)

	var adminID, buyerID, sellerUserID, sellerID, catID, productID string
	err := a.db.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role)
		VALUES($1,$2,$3,'ADMIN')
		ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role,updated_at=now()
		RETURNING id`, "Platform Admin", "admin@maithilcart.test", string(adminPass)).Scan(&adminID)
	if err != nil {
		return err
	}

	userAdminPass, _ := bcrypt.GenerateFromPassword([]byte("Ravishek.,99580"), bcrypt.DefaultCost)
	var userAdminID string
	err = a.db.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role)
		VALUES($1,$2,$3,'ADMIN')
		ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role,updated_at=now()
		RETURNING id`, "Abhishek Admin", "admin", string(userAdminPass)).Scan(&userAdminID)
	if err != nil {
		return err
	}
	err = a.db.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role,phone)
		VALUES($1,$2,$3,'BUYER',$4)
		ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role,phone=excluded.phone,updated_at=now()
		RETURNING id`, "Aarav Buyer", "buyer@maithilcart.test", string(buyerPass), "9999999999").Scan(&buyerID)
	if err != nil {
		return err
	}
	err = a.db.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role,phone)
		VALUES($1,$2,$3,'SELLER',$4)
		ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role,phone=excluded.phone,updated_at=now()
		RETURNING id`, "Nisha Seller", "seller@maithilcart.test", string(sellerPass), "8888888888").Scan(&sellerUserID)
	if err != nil {
		return err
	}
	err = a.db.QueryRow(ctx, `INSERT INTO sellers(user_id,store_name,legal_name,gstin,payout_account,status,can_list_products,can_receive_payouts)
		VALUES($1,$2,$3,$4,$5,'APPROVED',true,true)
		ON CONFLICT(user_id) DO UPDATE SET store_name=excluded.store_name,legal_name=excluded.legal_name,gstin=excluded.gstin,payout_account=excluded.payout_account,status=excluded.status,can_list_products=true,can_receive_payouts=true,updated_at=now()
		RETURNING id`, sellerUserID, "Urban Loom", "Urban Loom Private Limited", "29ABCDE1234F1Z5", "acct_demo_urbanloom").Scan(&sellerID)
	if err != nil {
		return err
	}
	categoriesList := []string{
		"Men Topwear",
		"Women Topwear",
		"Men Bottomwear",
		"Women Bottomwear",
		"Ethnic Wear",
		"Footwear",
		"Accessories",
		"Sportswear",
		"Kids Wear",
	}

	brandsMap := map[string][]string{
		"Men Topwear":      {"Roadster", "WROGN", "H&M", "Jack & Jones"},
		"Women Topwear":    {"Zara", "Forever 21", "H&M", "Mango"},
		"Men Bottomwear":    {"Levi's", "Pepe Jeans", "Wrangler", "Roadster"},
		"Women Bottomwear":  {"Levi's", "Only", "Vero Moda", "Zara"},
		"Ethnic Wear":      {"Biba", "Fabindia", "W", "Aurelia"},
		"Footwear":         {"Nike", "Adidas", "Puma", "Bata"},
		"Accessories":      {"Fastrack", "Casio", "Wildhorn", "Skybags"},
		"Sportswear":       {"Nike", "Adidas", "Under Armour", "Decathlon"},
		"Kids Wear":        {"Gini & Jony", "U.S. Polo Assn. Kids", "H&M Kids", "Mothercare"},
	}

	stylesMap := map[string][]string{
		"Men Topwear":      {"Slim Fit Printed Shirt", "Regular Polo Tee", "Oversized Cotton Hoodie", "Casual Denim Jacket", "Classic Linen Shirt"},
		"Women Topwear":    {"Floral Summer Top", "Oversized Knit Sweater", "Chiffon Blouse", "Ribbed Crop Tee", "Boho Tunic"},
		"Men Bottomwear":    {"Slim Fit Chinos", "Regular Fit Denim", "Cargo Utility Pants", "Linen Lounge Trousers", "Joggers Track Pants"},
		"Women Bottomwear":  {"High Waist Jeans", "Wide Leg Trousers", "Pleated Midi Skirt", "Paperbag Waist Pants", "Lounge Joggers"},
		"Ethnic Wear":      {"Anarkali Kurta Suit", "Cotton Pathani Kurta", "Embroidered Festive Saree", "Printed Nehru Jacket", "Silk Kurta Pajama Set"},
		"Footwear":         {"Breathable Running Shoes", "Casual Canvas Sneakers", "Leather Formal Brogues", "Slide Sandals", "Sport Training Shoes"},
		"Accessories":      {"Leather Bi-Fold Wallet", "Minimalist Analog Watch", "Polarized Sunglasses", "Durable Canvas Backpack", "Classic Leather Belt"},
		"Sportswear":       {"Dry-Fit Training Tee", "Compression Shorts", "Athletic Windbreaker", "Active Sports Joggers", "Gym Workout Tank"},
		"Kids Wear":        {"Cotton Playsuit", "Graphic Print Tee", "Denim Dungarees", "Patterned Party Dress", "Cozy Fleece Pyjamas"},
	}

	imagePresets := map[string]string{
		"Men Topwear":      "/assets/ridge-overshirt.svg",
		"Women Topwear":    "/assets/everyday-tee.svg",
		"Men Bottomwear":    "/assets/utility-pant.svg",
		"Women Bottomwear":  "/assets/utility-pant.svg",
		"Ethnic Wear":      "/assets/ridge-overshirt.svg",
		"Footwear":         "/assets/loopback-hoodie.svg",
		"Accessories":      "/assets/everyday-tee.svg",
		"Sportswear":       "/assets/loopback-hoodie.svg",
		"Kids Wear":        "/assets/everyday-tee.svg",
	}

	for _, catName := range categoriesList {
		catSlug := strings.ReplaceAll(strings.ToLower(catName), " ", "-")
		err = a.db.QueryRow(ctx, `INSERT INTO categories(name,slug) VALUES($1,$2)
			ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id`, catName, catSlug).Scan(&catID)
		if err != nil {
			return err
		}

		brands := brandsMap[catName]
		styles := stylesMap[catName]
		img := imagePresets[catName]
		gender := "Unisex"
		if strings.HasPrefix(catName, "Men") {
			gender = "Men"
		} else if strings.HasPrefix(catName, "Women") {
			gender = "Women"
		} else if catName == "Kids Wear" {
			gender = "Kids"
		}

		for i := 1; i <= 20; i++ {
			brand := brands[i % len(brands)]
			styleName := styles[i % len(styles)]
			title := fmt.Sprintf("%s %s - Style %02d", brand, styleName, i)
			slug := strings.ReplaceAll(strings.ToLower(brand+"-"+styleName+"-"+strconv.Itoa(i)), " ", "-")
			desc := fmt.Sprintf("High quality %s from %s. Designed for comfort, durability, and a premium look.", styleName, brand)
			mrp := (999 + (i*149)%2000) * 100
			price := mrp * 60 / 100 // 40% discount

			err = a.db.QueryRow(ctx, `INSERT INTO products(seller_id,category_id,title,slug,description,brand,gender,image_url,mrp_cents,sale_price_cents,active,approved)
				VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true)
				ON CONFLICT(slug) DO UPDATE SET seller_id=excluded.seller_id,category_id=excluded.category_id,title=excluded.title,description=excluded.description,brand=excluded.brand,gender=excluded.gender,image_url=excluded.image_url,mrp_cents=excluded.mrp_cents,sale_price_cents=excluded.sale_price_cents,active=true,approved=true,updated_at=now()
				RETURNING id`, sellerID, catID, title, slug, desc, brand, gender, img, mrp, price).Scan(&productID)
			if err != nil {
				return err
			}

			sizes := []string{"S", "M", "L", "XL"}
			colors := []string{"Blue", "Black", "Grey", "Beige"}
			color := colors[i % len(colors)]
			for _, size := range sizes {
				// Prevent empty/short brands or styleNames causing dynamic substring panic
				safeBrand := brand
				if len(safeBrand) < 3 {
					safeBrand = "GEN"
				}
				safeStyle := styleName
				if len(safeStyle) < 3 {
					safeStyle = "STY"
				}
				sku := fmt.Sprintf("%s-%s-%s-%s-%d", strings.ToUpper(safeBrand[:3]), strings.ToUpper(safeStyle[:3]), size, strings.ToUpper(color[:3]), i)
				sku = strings.ReplaceAll(sku, " ", "")
				stock := 10 + (i*7)%40

				_, err = a.db.Exec(ctx, `INSERT INTO product_variants(product_id,sku,size,color,stock)
					VALUES($1,$2,$3,$4,$5)
					ON CONFLICT(sku) DO UPDATE SET product_id=excluded.product_id,size=excluded.size,color=excluded.color,stock=excluded.stock`,
					productID, sku, size, color, stock)
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (a *app) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "maithilcart-go-api"})
}

func (a *app) signup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name          string `json:"name"`
		Email         string `json:"email"`
		Password      string `json:"password"`
		Role          string `json:"role"`
		Phone         string `json:"phone"`
		StoreName     string `json:"storeName"`
		LegalName     string `json:"legalName"`
		GSTIN         string `json:"gstin"`
		PayoutAccount string `json:"payoutAccount"`
	}
	if !decode(w, r, &req) {
		return
	}
	req.Role = strings.ToUpper(req.Role)
	if req.Role == "" {
		req.Role = "BUYER"
	}
	if req.Role != "BUYER" && req.Role != "SELLER" {
		errorJSON(w, http.StatusBadRequest, "signup role must be BUYER or SELLER")
		return
	}
	if len(req.Password) < 8 || req.Email == "" || req.Name == "" {
		errorJSON(w, http.StatusBadRequest, "name, email and password are required")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start signup")
		return
	}
	defer tx.Rollback(r.Context())
	var u user
	err = tx.QueryRow(r.Context(), "INSERT INTO users(name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,phone,avatar_url", req.Name, strings.ToLower(req.Email), string(hash), req.Role, req.Phone).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone, &u.AvatarURL)
	if err != nil {
		errorJSON(w, 409, "email already exists")
		return
	}
	if req.Role == "SELLER" {
		if req.StoreName == "" || req.LegalName == "" {
			errorJSON(w, 400, "storeName and legalName are required for sellers")
			return
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO sellers(user_id,store_name,legal_name,gstin,payout_account) VALUES($1,$2,$3,$4,$5)", u.ID, req.StoreName, req.LegalName, req.GSTIN, req.PayoutAccount)
		if err != nil {
			errorJSON(w, 500, "could not create seller profile")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "could not finish signup")
		return
	}
	token, _ := a.token(u.ID, u.Role)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": u})
}

func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var req struct{ Email, Password string }
	if !decode(w, r, &req) {
		return
	}
	var u user
	var hash *string
	err := a.db.QueryRow(r.Context(), "SELECT id,name,email,role,password_hash,phone,avatar_url FROM users WHERE email=$1", strings.ToLower(req.Email)).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &hash, &u.Phone, &u.AvatarURL)
	if err != nil || hash == nil || bcrypt.CompareHashAndPassword([]byte(*hash), []byte(req.Password)) != nil {
		errorJSON(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	token, _ := a.token(u.ID, u.Role)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
}

func (a *app) googleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDToken string `json:"idToken"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.IDToken == "" {
		errorJSON(w, http.StatusBadRequest, "idToken is required")
		return
	}

	var email, name, googleID string

	// For dev environment/testing: support a mock idToken to bypass Google network API calls
	if strings.HasPrefix(req.IDToken, "mock_") {
		parts := strings.Split(req.IDToken, "_")
		if len(parts) >= 4 {
			googleID = parts[1]
			email = parts[2]
			name = strings.ReplaceAll(parts[3], "-", " ")
		} else {
			googleID = "mock-google-id"
			email = "mock-google@maithilcart.test"
			name = "Mock Google User"
		}
	} else {
		oauth2Service, err := oauth2.NewService(r.Context(), option.WithoutAuthentication())
		if err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to initialize google client")
			return
		}
		tokenInfo, err := oauth2Service.Tokeninfo().IdToken(req.IDToken).Do()
		if err != nil {
			errorJSON(w, http.StatusUnauthorized, "invalid google ID token: " + err.Error())
			return
		}
		googleID = tokenInfo.UserId
		email = tokenInfo.Email
		name = tokenInfo.Email
		if name == "" {
			name = email
		}
		if idx := strings.Index(name, "@"); idx != -1 {
			name = name[:idx]
		}
	}

	if googleID == "" || email == "" {
		errorJSON(w, http.StatusUnauthorized, "google token did not contain id or email")
		return
	}

	var u user
	// 1. Check if user already exists with google_id
	err := a.db.QueryRow(r.Context(), "SELECT id, name, email, role, phone, avatar_url FROM users WHERE google_id = $1", googleID).
		Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone, &u.AvatarURL)
	if err == nil {
		token, _ := a.token(u.ID, u.Role)
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
		return
	}

	// 2. Check if a user with this email exists (without google_id) to link accounts
	var existingID, existingRole string
	err = a.db.QueryRow(r.Context(), "SELECT id, role FROM users WHERE email = $1", strings.ToLower(email)).
		Scan(&existingID, &existingRole)
	if err == nil {
		_, err = a.db.Exec(r.Context(), "UPDATE users SET google_id = $1, updated_at = now() WHERE id = $2", googleID, existingID)
		if err != nil {
			errorJSON(w, http.StatusInternalServerError, "failed to link google account")
			return
		}
		u.ID = existingID
		u.Email = email
		u.Role = existingRole
		_ = a.db.QueryRow(r.Context(), "SELECT name, phone, avatar_url FROM users WHERE id = $1", u.ID).Scan(&u.Name, &u.Phone, &u.AvatarURL)

		token, _ := a.token(u.ID, u.Role)
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": u})
		return
	}

	// 3. User does not exist, create new BUYER
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to start user creation")
		return
	}
	defer tx.Rollback(r.Context())

	err = tx.QueryRow(r.Context(), `
		INSERT INTO users(name, email, role, google_id)
		VALUES($1, $2, 'BUYER', $3)
		RETURNING id, name, email, role, phone, avatar_url`,
		name, strings.ToLower(email), googleID,
	).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone, &u.AvatarURL)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to create user account")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to finish user creation")
		return
	}

	token, _ := a.token(u.ID, u.Role)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": u})
}


func (a *app) products(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT p.id,p.seller_id,s.store_name,p.title,p.slug,p.description,p.brand,coalesce(c.name,''),p.gender,p.image_url,p.mrp_cents,p.sale_price_cents,p.active,p.approved
		FROM products p JOIN sellers s ON s.id=p.seller_id LEFT JOIN categories c ON c.id=p.category_id
		WHERE p.active=true AND p.approved=true ORDER BY p.created_at DESC`)
	if err != nil {
		errorJSON(w, 500, "could not load products")
		return
	}
	defer rows.Close()
	items, err := scanProducts(r.Context(), a.db, rows)
	if err != nil {
		errorJSON(w, 500, "could not read products")
		return
	}
	writeJSON(w, 200, items)
}

func (a *app) cart(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	rows, err := a.db.Query(r.Context(), `SELECT ci.id, ci.quantity, pv.id, pv.product_id, pv.sku, pv.size, pv.color, pv.stock,
		p.id,p.seller_id,s.store_name,p.title,p.slug,p.description,p.brand,coalesce(c.name,''),p.gender,p.image_url,p.mrp_cents,p.sale_price_cents,p.active,p.approved
		FROM cart_items ci JOIN product_variants pv ON pv.id=ci.variant_id JOIN products p ON p.id=pv.product_id JOIN sellers s ON s.id=p.seller_id LEFT JOIN categories c ON c.id=p.category_id
		WHERE ci.user_id=$1 ORDER BY ci.created_at`, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not load cart")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var itemID string
		var qty int
		var v variant
		var p product
		err := rows.Scan(&itemID, &qty, &v.ID, &v.ProductID, &v.SKU, &v.Size, &v.Color, &v.Stock, &p.ID, &p.SellerID, &p.StoreName, &p.Title, &p.Slug, &p.Description, &p.Brand, &p.Category, &p.Gender, &p.ImageURL, &p.MRPCents, &p.SalePriceCents, &p.Active, &p.Approved)
		if err != nil {
			errorJSON(w, 500, "could not read cart")
			return
		}
		p.Variants = []variant{v}
		out = append(out, map[string]any{"id": itemID, "quantity": qty, "variant": v, "product": p})
	}
	writeJSON(w, 200, out)
}

func (a *app) addCart(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		VariantID string `json:"variantId"`
		Quantity  int    `json:"quantity"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Quantity < 1 {
		req.Quantity = 1
	}
	_, err := a.db.Exec(r.Context(), `INSERT INTO cart_items(user_id,variant_id,quantity) VALUES($1,$2,$3)
		ON CONFLICT(user_id,variant_id) DO UPDATE SET quantity=cart_items.quantity + excluded.quantity`, auth.UserID, req.VariantID, req.Quantity)
	if err != nil {
		errorJSON(w, 400, "could not add item")
		return
	}
	writeJSON(w, 201, map[string]any{"ok": true})
}

func (a *app) updateCart(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	qty, _ := strconv.Atoi(r.URL.Query().Get("quantity"))
	var req struct {
		Quantity int `json:"quantity"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Quantity > 0 {
		qty = req.Quantity
	}
	if qty < 1 {
		errorJSON(w, 400, "quantity must be positive")
		return
	}
	_, err := a.db.Exec(r.Context(), "UPDATE cart_items SET quantity=$1 WHERE id=$2 AND user_id=$3", qty, r.PathValue("id"), auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not update cart")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *app) deleteCart(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	_, err := a.db.Exec(r.Context(), "DELETE FROM cart_items WHERE id=$1 AND user_id=$2", r.PathValue("id"), auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not remove cart item")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) checkout(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		ShippingName    string `json:"shippingName"`
		ShippingPhone   string `json:"shippingPhone"`
		ShippingAddress string `json:"shippingAddress"`
		PaymentMethod   string `json:"paymentMethod"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.ShippingName == "" || req.ShippingPhone == "" || req.ShippingAddress == "" {
		errorJSON(w, 400, "shipping details are required")
		return
	}
	tx, err := a.db.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		errorJSON(w, 500, "could not start checkout")
		return
	}
	defer tx.Rollback(r.Context())
	rows, err := tx.Query(r.Context(), `SELECT ci.quantity,pv.id,pv.stock,p.id,p.seller_id,p.sale_price_cents,s.commission_bps
		FROM cart_items ci JOIN product_variants pv ON pv.id=ci.variant_id JOIN products p ON p.id=pv.product_id JOIN sellers s ON s.id=p.seller_id
		WHERE ci.user_id=$1 FOR UPDATE`, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not load cart")
		return
	}
	type line struct {
		qty, stock, price, commission  int
		variantID, productID, sellerID string
	}
	var lines []line
	subtotal := 0
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.qty, &l.variantID, &l.stock, &l.productID, &l.sellerID, &l.price, &l.commission); err != nil {
			errorJSON(w, 500, "could not read cart")
			return
		}
		if l.qty > l.stock {
			errorJSON(w, 409, "not enough stock for one or more items")
			return
		}
		subtotal += l.qty * l.price
		lines = append(lines, l)
	}
	rows.Close()
	if len(lines) == 0 {
		errorJSON(w, 400, "cart is empty")
		return
	}
	shipping := 0
	if subtotal < 199900 {
		shipping = 9900
	}
	total := subtotal + shipping
	var orderID string
	err = tx.QueryRow(r.Context(), `INSERT INTO orders(buyer_id,status,subtotal_cents,shipping_cents,total_cents,shipping_name,shipping_phone,shipping_address)
		VALUES($1,'PAID',$2,$3,$4,$5,$6,$7) RETURNING id`, auth.UserID, subtotal, shipping, total, req.ShippingName, req.ShippingPhone, req.ShippingAddress).Scan(&orderID)
	if err != nil {
		errorJSON(w, 500, "could not create order")
		return
	}
	for _, l := range lines {
		fee := l.qty * l.price * l.commission / 10000
		sellerAmount := l.qty*l.price - fee
		_, err = tx.Exec(r.Context(), `INSERT INTO order_items(order_id,seller_id,product_id,variant_id,quantity,unit_price_cents,seller_amount_cents,platform_fee_cents)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, orderID, l.sellerID, l.productID, l.variantID, l.qty, l.price, sellerAmount, fee)
		if err != nil {
			errorJSON(w, 500, "could not create order item")
			return
		}
		_, err = tx.Exec(r.Context(), "UPDATE product_variants SET stock=stock-$1 WHERE id=$2", l.qty, l.variantID)
		if err != nil {
			errorJSON(w, 500, "could not update inventory")
			return
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO seller_payouts(seller_id,order_id,amount_cents) VALUES($1,$2,$3)", l.sellerID, orderID, sellerAmount)
		if err != nil {
			errorJSON(w, 500, "could not create seller payout")
			return
		}
	}
	ref := "mock_" + randomHex(8)
	_, err = tx.Exec(r.Context(), "INSERT INTO payments(order_id,provider,provider_reference,status,amount_cents) VALUES($1,$2,$3,'SUCCEEDED',$4)", orderID, a.paymentProvider, ref, total)
	if err != nil {
		errorJSON(w, 500, "could not record payment")
		return
	}
	_, err = tx.Exec(r.Context(), "DELETE FROM cart_items WHERE user_id=$1", auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not clear cart")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "could not finish order")
		return
	}
	writeJSON(w, 201, map[string]any{"id": orderID, "paymentReference": ref, "totalCents": total, "status": "PAID"})
}

func (a *app) orders(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var rows pgx.Rows
	var err error
	if auth.Role == "SELLER" {
		rows, err = a.db.Query(r.Context(), `SELECT DISTINCT o.id,o.status,o.subtotal_cents,o.shipping_cents,o.total_cents,o.shipping_name,o.shipping_phone,o.shipping_address,coalesce(pay.status::text,'PENDING'),o.created_at
			FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN sellers s ON s.id=oi.seller_id LEFT JOIN payments pay ON pay.order_id=o.id WHERE s.user_id=$1 ORDER BY o.created_at DESC`, auth.UserID)
	} else {
		rows, err = a.db.Query(r.Context(), `SELECT o.id,o.status,o.subtotal_cents,o.shipping_cents,o.total_cents,o.shipping_name,o.shipping_phone,o.shipping_address,coalesce(pay.status::text,'PENDING'),o.created_at
			FROM orders o LEFT JOIN payments pay ON pay.order_id=o.id WHERE o.buyer_id=$1 ORDER BY o.created_at DESC`, auth.UserID)
	}
	if err != nil {
		errorJSON(w, 500, "could not load orders")
		return
	}
	defer rows.Close()
	out, err := a.scanOrders(r.Context(), rows)
	if err != nil {
		errorJSON(w, 500, "could not read orders")
		return
	}
	writeJSON(w, 200, out)
}

func (a *app) sellerMe(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var out map[string]any
	var id, store, status, legalName string
	var logoURL, bannerURL, documentURL, adminComment, gstin *string
	var canList, canPayout bool
	err := a.db.QueryRow(r.Context(), `
		SELECT id, store_name, legal_name, coalesce(gstin, ''), status, can_list_products, can_receive_payouts, logo_url, banner_url, document_url, admin_comment
		FROM sellers WHERE user_id=$1`, auth.UserID).Scan(
			&id, &store, &legalName, &gstin, &status, &canList, &canPayout, &logoURL, &bannerURL, &documentURL, &adminComment)
	if err != nil {
		errorJSON(w, 404, "seller profile not found")
		return
	}
	out = map[string]any{
		"id": id,
		"storeName": store,
		"legalName": legalName,
		"gstin": gstin,
		"status": status,
		"canListProducts": canList,
		"canReceivePayouts": canPayout,
		"logoUrl": logoURL,
		"bannerUrl": bannerURL,
		"documentUrl": documentURL,
		"adminComment": adminComment,
	}
	writeJSON(w, 200, out)
}

func (a *app) sellerProducts(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	rows, err := a.db.Query(r.Context(), `SELECT p.id,p.seller_id,s.store_name,p.title,p.slug,p.description,p.brand,coalesce(c.name,''),p.gender,p.image_url,p.mrp_cents,p.sale_price_cents,p.active,p.approved
		FROM products p JOIN sellers s ON s.id=p.seller_id LEFT JOIN categories c ON c.id=p.category_id WHERE s.user_id=$1 ORDER BY p.created_at DESC`, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not load seller products")
		return
	}
	defer rows.Close()
	items, err := scanProducts(r.Context(), a.db, rows)
	if err != nil {
		errorJSON(w, 500, "could not read products")
		return
	}
	writeJSON(w, 200, items)
}

func (a *app) createProduct(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		Title          string    `json:"title"`
		Description    string    `json:"description"`
		Brand          string    `json:"brand"`
		Category       string    `json:"category"`
		Gender         string    `json:"gender"`
		ImageURL       string    `json:"imageUrl"`
		MRPCents       int       `json:"mrpCents"`
		SalePriceCents int       `json:"salePriceCents"`
		Variants       []variant `json:"variants"`
	}
	if !decode(w, r, &req) {
		return
	}
	var sellerID, status string
	var canList bool
	err := a.db.QueryRow(r.Context(), "SELECT id,status,can_list_products FROM sellers WHERE user_id=$1", auth.UserID).Scan(&sellerID, &status, &canList)
	if err != nil {
		errorJSON(w, 404, "seller profile not found")
		return
	}
	if status != "APPROVED" || !canList {
		errorJSON(w, 403, "seller is not approved to list products")
		return
	}
	if req.Title == "" || req.Brand == "" || req.SalePriceCents <= 0 || len(req.Variants) == 0 {
		errorJSON(w, 400, "title, brand, price and variants are required")
		return
	}
	if req.Gender == "" {
		req.Gender = "Unisex"
	}
	if req.ImageURL == "" {
		req.ImageURL = "/assets/everyday-tee.svg"
	}
	slug := uniqueSlug(req.Title)
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not create product")
		return
	}
	defer tx.Rollback(r.Context())
	var catID *string
	if req.Category != "" {
		var id string
		err = tx.QueryRow(r.Context(), "INSERT INTO categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id", req.Category, uniqueSlug(req.Category)).Scan(&id)
		if err != nil {
			errorJSON(w, 500, "could not save category")
			return
		}
		catID = &id
	}
	var productID string
	err = tx.QueryRow(r.Context(), `INSERT INTO products(seller_id,category_id,title,slug,description,brand,gender,image_url,mrp_cents,sale_price_cents,active,approved)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,false) RETURNING id`, sellerID, catID, req.Title, slug, req.Description, req.Brand, req.Gender, req.ImageURL, req.MRPCents, req.SalePriceCents).Scan(&productID)
	if err != nil {
		errorJSON(w, 500, "could not save product")
		return
	}
	for _, v := range req.Variants {
		if v.SKU == "" {
			v.SKU = strings.ToUpper(uniqueSlug(req.Brand + "-" + req.Title + "-" + v.Size + "-" + v.Color))
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO product_variants(product_id,sku,size,color,stock) VALUES($1,$2,$3,$4,$5)", productID, v.SKU, v.Size, v.Color, v.Stock)
		if err != nil {
			errorJSON(w, 400, "could not save product variant")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "could not finish product")
		return
	}
	writeJSON(w, 201, map[string]any{"id": productID, "approved": false})
}

func (a *app) sellerPayouts(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	rows, err := a.db.Query(r.Context(), `SELECT sp.id,sp.order_id,sp.amount_cents,sp.status,sp.created_at FROM seller_payouts sp JOIN sellers s ON s.id=sp.seller_id WHERE s.user_id=$1 ORDER BY sp.created_at DESC`, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "could not load payouts")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, orderID, status string
		var amount int
		var created time.Time
		_ = rows.Scan(&id, &orderID, &amount, &status, &created)
		out = append(out, map[string]any{"id": id, "orderId": orderID, "amountCents": amount, "status": status, "createdAt": created})
	}
	writeJSON(w, 200, out)
}

func (a *app) adminSellers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
		SELECT s.id, u.name, u.email, s.store_name, s.legal_name, coalesce(s.gstin,''), coalesce(s.payout_account,''), s.status, s.can_list_products, s.can_receive_payouts, s.commission_bps, s.logo_url, s.banner_url, s.document_url, s.admin_comment
		FROM sellers s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC`)
	if err != nil {
		errorJSON(w, 500, "could not load sellers")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, email, store, legal, gstin, payout, status string
		var canList, canPayout bool
		var commission int
		var logo, banner, document, comment *string
		_ = rows.Scan(&id, &name, &email, &store, &legal, &gstin, &payout, &status, &canList, &canPayout, &commission, &logo, &banner, &document, &comment)
		out = append(out, map[string]any{
			"id": id,
			"name": name,
			"email": email,
			"storeName": store,
			"legalName": legal,
			"gstin": gstin,
			"payoutAccount": payout,
			"status": status,
			"canListProducts": canList,
			"canReceivePayouts": canPayout,
			"commissionBps": commission,
			"logoUrl": logo,
			"bannerUrl": banner,
			"documentUrl": document,
			"adminComment": comment,
		})
	}
	writeJSON(w, 200, out)
}

func (a *app) adminUpdateSeller(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Status            string  `json:"status"`
		CanListProducts   *bool   `json:"canListProducts"`
		CanReceivePayouts *bool   `json:"canReceivePayouts"`
		CommissionBps     *int    `json:"commissionBps"`
		AdminComment      *string `json:"adminComment"`
	}
	if !decode(w, r, &req) {
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var currentStatus string
	var canList, canPayout bool
	var commission int
	var adminComment *string
	err = tx.QueryRow(r.Context(), "SELECT status, can_list_products, can_receive_payouts, commission_bps, admin_comment FROM sellers WHERE id=$1", r.PathValue("id")).Scan(&currentStatus, &canList, &canPayout, &commission, &adminComment)
	if err != nil {
		errorJSON(w, 404, "seller not found")
		return
	}

	status := req.Status
	if status == "" {
		status = currentStatus
	}
	
	listVal := canList
	if req.CanListProducts != nil {
		listVal = *req.CanListProducts
	} else if status == "APPROVED" {
		listVal = true
	} else if status == "SUSPENDED" || status == "REJECTED" || status == "PENDING" {
		listVal = false
	}

	payoutVal := canPayout
	if req.CanReceivePayouts != nil {
		payoutVal = *req.CanReceivePayouts
	} else if status == "APPROVED" {
		payoutVal = true
	} else if status == "SUSPENDED" || status == "REJECTED" || status == "PENDING" {
		payoutVal = false
	}

	commVal := commission
	if req.CommissionBps != nil {
		commVal = *req.CommissionBps
	}

	commComment := adminComment
	if req.AdminComment != nil {
		commComment = req.AdminComment
	}

	_, err = tx.Exec(r.Context(), `
		UPDATE sellers
		SET status=$1, can_list_products=$2, can_receive_payouts=$3, commission_bps=$4, admin_comment=$5, updated_at=now()
		WHERE id=$6`,
		status, listVal, payoutVal, commVal, commComment, r.PathValue("id"),
	)
	if err != nil {
		errorJSON(w, 500, "could not update seller record")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "failed to save updates")
		return
	}

	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *app) adminOrders(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT o.id,o.status,o.subtotal_cents,o.shipping_cents,o.total_cents,o.shipping_name,o.shipping_phone,o.shipping_address,coalesce(pay.status::text,'PENDING'),o.created_at
		FROM orders o LEFT JOIN payments pay ON pay.order_id=o.id ORDER BY o.created_at DESC`)
	if err != nil {
		errorJSON(w, 500, "could not load orders")
		return
	}
	defer rows.Close()
	out, err := a.scanOrders(r.Context(), rows)
	if err != nil {
		errorJSON(w, 500, "could not read orders")
		return
	}
	writeJSON(w, 200, out)
}

func (a *app) adminUpdateProduct(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Approved *bool `json:"approved"`
		Active   *bool `json:"active"`
	}
	if !decode(w, r, &req) {
		return
	}
	if req.Approved != nil {
		_, _ = a.db.Exec(r.Context(), "UPDATE products SET approved=$1,updated_at=now() WHERE id=$2", *req.Approved, r.PathValue("id"))
	}
	if req.Active != nil {
		_, _ = a.db.Exec(r.Context(), "UPDATE products SET active=$1,updated_at=now() WHERE id=$2", *req.Active, r.PathValue("id"))
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *app) scanOrders(ctx context.Context, rows pgx.Rows) ([]order, error) {
	out := []order{}
	for rows.Next() {
		var o order
		o.Items = []orderItem{}
		if err := rows.Scan(&o.ID, &o.Status, &o.SubtotalCents, &o.ShippingCents, &o.TotalCents, &o.ShippingName, &o.ShippingPhone, &o.ShippingAddress, &o.PaymentStatus, &o.CreatedAt); err != nil {
			return nil, err
		}
		itemRows, err := a.db.Query(ctx, `SELECT oi.id,p.title,s.store_name,pv.size,pv.color,oi.quantity,oi.unit_price_cents,oi.seller_amount_cents
			FROM order_items oi JOIN products p ON p.id=oi.product_id JOIN sellers s ON s.id=oi.seller_id JOIN product_variants pv ON pv.id=oi.variant_id WHERE oi.order_id=$1`, o.ID)
		if err != nil {
			return nil, err
		}
		for itemRows.Next() {
			var item orderItem
			_ = itemRows.Scan(&item.ID, &item.ProductTitle, &item.SellerStore, &item.Size, &item.Color, &item.Quantity, &item.UnitPriceCents, &item.SellerAmountCents)
			o.Items = append(o.Items, item)
		}
		itemRows.Close()
		out = append(out, o)
	}
	return out, rows.Err()
}

func scanProducts(ctx context.Context, db *pgxpool.Pool, rows pgx.Rows) ([]product, error) {
	items := []product{}
	for rows.Next() {
		var p product
		p.Variants = []variant{}
		err := rows.Scan(&p.ID, &p.SellerID, &p.StoreName, &p.Title, &p.Slug, &p.Description, &p.Brand, &p.Category, &p.Gender, &p.ImageURL, &p.MRPCents, &p.SalePriceCents, &p.Active, &p.Approved)
		if err != nil {
			return nil, err
		}
		variants, err := db.Query(ctx, "SELECT id,product_id,sku,size,color,stock FROM product_variants WHERE product_id=$1 ORDER BY color,size", p.ID)
		if err != nil {
			return nil, err
		}
		for variants.Next() {
			var v variant
			_ = variants.Scan(&v.ID, &v.ProductID, &v.SKU, &v.Size, &v.Color, &v.Stock)
			p.Variants = append(p.Variants, v)
		}
		variants.Close()
		items = append(items, p)
	}
	return items, rows.Err()
}

func (a *app) withAuth(role string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		tokenValue := strings.TrimPrefix(header, "Bearer ")
		if tokenValue == "" || tokenValue == header {
			errorJSON(w, 401, "missing authorization token")
			return
		}
		claims := jwt.MapClaims{}
		token, err := jwt.ParseWithClaims(tokenValue, claims, func(token *jwt.Token) (any, error) { return a.jwtSecret, nil })
		if err != nil || !token.Valid {
			errorJSON(w, 401, "invalid token")
			return
		}
		auth := authContext{UserID: fmt.Sprint(claims["sub"]), Role: fmt.Sprint(claims["role"])}
		if role != "" && auth.Role != role {
			errorJSON(w, 403, "insufficient permissions")
			return
		}
		ctx := context.WithValue(r.Context(), authKey{}, auth)
		next(w, r.WithContext(ctx))
	}
}

func (a *app) token(userID, role string) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"exp":  time.Now().Add(24 * 7 * time.Hour).Unix(),
	}).SignedString(a.jwtSecret)
}

type authKey struct{}

func mustAuth(r *http.Request) authContext { return r.Context().Value(authKey{}).(authContext) }

func (a *app) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := a.allowedOrigin(r.Header.Get("Origin")); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) allowedOrigin(origin string) string {
	if origin == "" && len(a.corsOrigins) > 0 {
		return a.corsOrigins[0]
	}
	for _, allowed := range a.corsOrigins {
		if allowed == "*" || allowed == origin {
			return origin
		}
	}
	return ""
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		errorJSON(w, 400, "invalid JSON")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func errorJSON(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parseOrigins(value string) []string {
	var origins []string
	for _, origin := range strings.Split(value, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

func uniqueSlug(value string) string {
	s := strings.ToLower(value)
	s = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "item"
	}
	return s + "-" + randomHex(3)
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil && !errors.Is(err, nil) {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buf)
}

func (a *app) upload(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(10 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		errorJSON(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	ext := filepath.Ext(header.Filename)
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".pdf": true, ".svg": true}
	if !allowed[strings.ToLower(ext)] {
		errorJSON(w, http.StatusBadRequest, "invalid file type: only images and PDF are allowed")
		return
	}

	filename := randomHex(16) + ext
	filePath := filepath.Join("uploads", filename)

	out, err := os.Create(filePath)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "could not save file")
		return
	}
	defer out.Close()

	_, err = io.Copy(out, file)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	url := "/uploads/" + filename
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

func (a *app) updateSellerMe(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		StoreName   *string `json:"storeName"`
		LegalName   *string `json:"legalName"`
		GSTIN       *string `json:"gstin"`
		LogoURL     *string `json:"logoUrl"`
		BannerURL   *string `json:"bannerUrl"`
		DocumentURL *string `json:"documentUrl"`
	}
	if !decode(w, r, &req) {
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start update")
		return
	}
	defer tx.Rollback(r.Context())

	query := "UPDATE sellers SET updated_at = now()"
	args := []any{auth.UserID}
	argIdx := 2

	if req.StoreName != nil {
		query += fmt.Sprintf(", store_name = $%d", argIdx)
		args = append(args, *req.StoreName)
		argIdx++
	}
	if req.LegalName != nil {
		query += fmt.Sprintf(", legal_name = $%d", argIdx)
		args = append(args, *req.LegalName)
		argIdx++
	}
	if req.GSTIN != nil {
		query += fmt.Sprintf(", gstin = $%d", argIdx)
		args = append(args, *req.GSTIN)
		argIdx++
	}
	if req.LogoURL != nil {
		query += fmt.Sprintf(", logo_url = $%d", argIdx)
		args = append(args, *req.LogoURL)
		argIdx++
	}
	if req.BannerURL != nil {
		query += fmt.Sprintf(", banner_url = $%d", argIdx)
		args = append(args, *req.BannerURL)
		argIdx++
	}
	if req.DocumentURL != nil {
		query += fmt.Sprintf(", document_url = $%d", argIdx)
		args = append(args, *req.DocumentURL)
		argIdx++
		query += fmt.Sprintf(", status = 'PENDING'")
	}

	query += " WHERE user_id = $1"

	_, err = tx.Exec(r.Context(), query, args...)
	if err != nil {
		errorJSON(w, 500, "could not update seller profile")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "could not save changes")
		return
	}

	writeJSON(w, 200, map[string]any{"ok": true})
}

type address struct {
	ID            string   `json:"id"`
	UserID        string   `json:"userId"`
	AddressName   string   `json:"addressName"`
	RecipientName string   `json:"recipientName"`
	Phone         string   `json:"phone"`
	AddressLine1  string   `json:"addressLine1"`
	AddressLine2  *string  `json:"addressLine2"`
	City          string   `json:"city"`
	State         string   `json:"state"`
	PostalCode    string   `json:"postalCode"`
	Country       string   `json:"country"`
	Latitude      *float64 `json:"latitude"`
	Longitude     *float64 `json:"longitude"`
	IsDefault     bool     `json:"isDefault"`
}

func (a *app) getAddresses(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	rows, err := a.db.Query(r.Context(), `
		SELECT id, user_id, address_name, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default
		FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "failed to get addresses")
		return
	}
	defer rows.Close()

	out := []address{}
	for rows.Next() {
		var addr address
		err := rows.Scan(
			&addr.ID, &addr.UserID, &addr.AddressName, &addr.RecipientName, &addr.Phone,
			&addr.AddressLine1, &addr.AddressLine2, &addr.City, &addr.State, &addr.PostalCode,
			&addr.Country, &addr.Latitude, &addr.Longitude, &addr.IsDefault,
		)
		if err != nil {
			errorJSON(w, 500, "failed to read address")
			return
		}
		out = append(out, addr)
	}
	writeJSON(w, 200, out)
}

func (a *app) createAddress(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		AddressName   string   `json:"addressName"`
		RecipientName string   `json:"recipientName"`
		Phone         string   `json:"phone"`
		AddressLine1  string   `json:"addressLine1"`
		AddressLine2  *string  `json:"addressLine2"`
		City          string   `json:"city"`
		State         string   `json:"state"`
		PostalCode    string   `json:"postalCode"`
		Country       string   `json:"country"`
		Latitude      *float64 `json:"latitude"`
		Longitude     *float64 `json:"longitude"`
		IsDefault     bool     `json:"isDefault"`
	}
	if !decode(w, r, &req) {
		return
	}

	if req.AddressName == "" || req.RecipientName == "" || req.Phone == "" || req.AddressLine1 == "" || req.City == "" || req.State == "" || req.PostalCode == "" {
		errorJSON(w, http.StatusBadRequest, "addressName, recipientName, phone, addressLine1, city, state and postalCode are required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	if req.IsDefault {
		_, err = tx.Exec(r.Context(), "UPDATE addresses SET is_default = false WHERE user_id = $1", auth.UserID)
		if err != nil {
			errorJSON(w, 500, "could not update other addresses")
			return
		}
	} else {
		var count int
		_ = tx.QueryRow(r.Context(), "SELECT count(*) FROM addresses WHERE user_id = $1", auth.UserID).Scan(&count)
		if count == 0 {
			req.IsDefault = true
		}
	}

	var addr address
	err = tx.QueryRow(r.Context(), `
		INSERT INTO addresses(user_id, address_name, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default)
		VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, user_id, address_name, recipient_name, phone, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default`,
		auth.UserID, req.AddressName, req.RecipientName, req.Phone, req.AddressLine1, req.AddressLine2, req.City, req.State, req.PostalCode, req.Country, req.Latitude, req.Longitude, req.IsDefault,
	).Scan(
		&addr.ID, &addr.UserID, &addr.AddressName, &addr.RecipientName, &addr.Phone,
		&addr.AddressLine1, &addr.AddressLine2, &addr.City, &addr.State, &addr.PostalCode,
		&addr.Country, &addr.Latitude, &addr.Longitude, &addr.IsDefault,
	)
	if err != nil {
		errorJSON(w, 500, "could not create address record")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "failed to save address")
		return
	}

	writeJSON(w, http.StatusCreated, addr)
}

func (a *app) deleteAddress(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	addrID := r.PathValue("id")

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var isDefault bool
	err = tx.QueryRow(r.Context(), "SELECT is_default FROM addresses WHERE id = $1 AND user_id = $2", addrID, auth.UserID).Scan(&isDefault)
	if err != nil {
		errorJSON(w, 404, "address not found")
		return
	}

	_, err = tx.Exec(r.Context(), "DELETE FROM addresses WHERE id = $1 AND user_id = $2", addrID, auth.UserID)
	if err != nil {
		errorJSON(w, 500, "failed to delete address")
		return
	}

	if isDefault {
		var newDefaultID string
		err = tx.QueryRow(r.Context(), "SELECT id FROM addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", auth.UserID).Scan(&newDefaultID)
		if err == nil && newDefaultID != "" {
			_, _ = tx.Exec(r.Context(), "UPDATE addresses SET is_default = true WHERE id = $1", newDefaultID)
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "failed to delete address")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (a *app) updateProfile(w http.ResponseWriter, r *http.Request) {
	auth := mustAuth(r)
	var req struct {
		Name      *string `json:"name"`
		Phone     *string `json:"phone"`
		AvatarURL *string `json:"avatarUrl"`
	}
	if !decode(w, r, &req) {
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		errorJSON(w, 500, "could not start update")
		return
	}
	defer tx.Rollback(r.Context())

	query := "UPDATE users SET updated_at = now()"
	args := []any{auth.UserID}
	argIdx := 2

	if req.Name != nil {
		query += fmt.Sprintf(", name = $%d", argIdx)
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Phone != nil {
		query += fmt.Sprintf(", phone = $%d", argIdx)
		args = append(args, *req.Phone)
		argIdx++
	}
	if req.AvatarURL != nil {
		query += fmt.Sprintf(", avatar_url = $%d", argIdx)
		args = append(args, *req.AvatarURL)
		argIdx++
	}

	query += " WHERE id = $1"

	_, err = tx.Exec(r.Context(), query, args...)
	if err != nil {
		errorJSON(w, 500, "could not update profile")
		return
	}

	var u user
	err = tx.QueryRow(r.Context(), "SELECT id, name, email, role, phone, avatar_url FROM users WHERE id = $1", auth.UserID).Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Phone, &u.AvatarURL)
	if err != nil {
		errorJSON(w, 500, "could not reload user info")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		errorJSON(w, 500, "could not save profile details")
		return
	}

	writeJSON(w, 200, u)
}
