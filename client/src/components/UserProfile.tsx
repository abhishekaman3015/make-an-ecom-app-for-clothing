import React, { useState, useEffect, useRef, FormEvent } from "react";
import { User as UserIcon, Phone, Mail, MapPin, Trash2, Shield, Camera, Compass, Plus, Sparkles, Navigation } from "lucide-react";
import { api } from "../api";
import type { User, Address } from "../types";

interface UserProfileProps {
  token: string;
  user: User;
  onUpdateSession: (updatedUser: User) => void;
}

export function UserProfile({ token, user, onUpdateSession }: UserProfileProps) {
  // Profile edit states
  const [phone, setPhone] = useState(user.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  // Address book states
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Add Address Form states
  const [addressName, setAddressName] = useState(""); // e.g. Home, Office
  const [recipientName, setRecipientName] = useState(user.name || "");
  const [addressPhone, setAddressPhone] = useState(user.phone || "");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [isDefault, setIsDefault] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [addressSuccess, setAddressSuccess] = useState("");
  const [addressError, setAddressError] = useState("");

  // Leaflet map refs
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Fetch addresses on mount
  const fetchAddresses = async () => {
    setLoadingAddresses(true);
    try {
      const data = await api.getAddresses(token);
      setAddresses(data);
    } catch (err) {
      console.error("Failed to load addresses", err);
    } finally {
      setLoadingAddresses(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [token]);

  // Handle Map Initialization
  useEffect(() => {
    const L = (window as any).L;
    if (!L) return;

    const mapElement = document.getElementById("map-picker");
    if (!mapElement) return;

    const startLat = latitude || 28.6139;
    const startLng = longitude || 77.2090;

    // Initialize Leaflet map
    const map = L.map("map-picker").setView([startLat, startLng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Create marker
    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    mapRef.current = map;
    markerRef.current = marker;

    // Event handlers
    const onMarkerMove = async (lat: number, lng: number) => {
      setLatitude(lat);
      setLongitude(lng);
      await reverseGeocode(lat, lng);
    };

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onMarkerMove(pos.lat, pos.lng);
    });

    map.on("click", (e: any) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      onMarkerMove(lat, lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update map visual representation when coordinates change externally (like location detection)
  const updateMapMarker = (lat: number, lng: number) => {
    if (mapRef.current && markerRef.current) {
      mapRef.current.setView([lat, lng], 15);
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  // Reverse Geocoding via Nominatim API
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const line1 = addr.road || addr.suburb || addr.neighbourhood || addr.amenity || addr.industrial || "";
        const line2 = addr.suburb || addr.city_district || "";
        const cityVal = addr.city || addr.town || addr.village || addr.county || "";
        const stateVal = addr.state || "";
        const postcodeVal = addr.postcode || "";
        const countryVal = addr.country || "India";

        setAddressLine1(line1 || data.display_name?.split(",")[0] || "");
        setAddressLine2(line2 || "");
        setCity(cityVal);
        setState(stateVal);
        setPostalCode(postcodeVal);
        setCountry(countryVal);
      }
    } catch (err) {
      console.error("Nominatim reverse geocoding failed", err);
    }
  };

  // GPS Location Detection
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setAddressError("Geolocation is not supported by your browser.");
      return;
    }

    setAddressError("");
    setAddressSuccess("Detecting coordinates...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        updateMapMarker(lat, lng);
        await reverseGeocode(lat, lng);
        setAddressSuccess("Location coordinates successfully locked!");
      },
      (error) => {
        console.error("GPS error", error);
        setAddressError("Failed to lock GPS. Please click manually on the map.");
        setAddressSuccess("");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Update profile handler (Phone / Avatar)
  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileMessage("");
    setProfileError("");

    if (phone && !/^\d{10}$/.test(phone)) {
      setProfileError("Phone number must be exactly 10 digits.");
      setUpdatingProfile(false);
      return;
    }

    try {
      const updatedUser = await api.updateProfile(token, {
        phone: phone || undefined,
        avatarUrl: avatarUrl || undefined,
      });
      onUpdateSession(updatedUser);
      setProfileMessage("Profile details updated successfully!");
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile details.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUpdatingProfile(true);
      setProfileError("");
      const result = await api.upload(file, token);
      setAvatarUrl(result.url);
      
      // Auto save after upload
      const updatedUser = await api.updateProfile(token, {
        phone: phone || undefined,
        avatarUrl: result.url,
      });
      onUpdateSession(updatedUser);
      setProfileMessage("Avatar uploaded and updated!");
    } catch (err: any) {
      setProfileError(err.message || "Avatar upload failed.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Add Address submit
  const handleAddAddress = async (e: FormEvent) => {
    e.preventDefault();
    setAddingAddress(true);
    setAddressSuccess("");
    setAddressError("");

    if (!recipientName.trim()) {
      setAddressError("Recipient Name cannot be empty.");
      setAddingAddress(false);
      return;
    }
    if (!addressPhone.trim() || !/^\d{10}$/.test(addressPhone)) {
      setAddressError("Recipient Phone number must be exactly 10 digits.");
      setAddingAddress(false);
      return;
    }
    if (!postalCode.trim() || !/^\d{5,6}$/.test(postalCode)) {
      setAddressError("Postal Code must be 5 or 6 digits.");
      setAddingAddress(false);
      return;
    }

    try {
      await api.createAddress(token, {
        addressName,
        recipientName,
        phone: addressPhone,
        addressLine1,
        addressLine2: addressLine2 || undefined,
        city,
        state,
        postalCode,
        country,
        latitude,
        longitude,
        isDefault,
      });

      setAddressSuccess("Address saved successfully!");
      // Reset form
      setAddressName("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setState("");
      setPostalCode("");
      setIsDefault(false);
      
      await fetchAddresses();
    } catch (err: any) {
      setAddressError(err.message || "Failed to add address.");
    } finally {
      setAddingAddress(false);
    }
  };

  // Delete Address handler
  const handleDeleteAddress = async (id: string) => {
    if (!confirm("Are you sure you want to delete this address?")) return;
    try {
      await api.removeAddress(token, id);
      await fetchAddresses();
    } catch (err: any) {
      alert(err.message || "Failed to delete address.");
    }
  };

  return (
    <section className="dashboard-container" style={{ padding: "40px 4% 80px" }}>
      {/* Header */}
      <div className="dashboard-header" style={{ marginBottom: "30px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "10px" }}>
            <UserIcon size={28} style={{ color: "var(--primary)" }} /> My Account
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Manage your personal profile, details, and delivery address book.
          </p>
        </div>
      </div>

      <div className="dashboard-row-split">
        {/* Left Column: Personal details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px", flex: "1 1 350px" }}>
          <section className="dashboard-section" style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-dark)" }}>
              <Shield size={18} style={{ color: "var(--primary)" }} /> Profile Details
            </h2>

            <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {profileMessage && (
                <div className="warning" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#dcfce7", margin: 0 }}>
                  {profileMessage}
                </div>
              )}
              {profileError && (
                <div className="warning" style={{ background: "#fef2f2", color: "#b91c1c", borderColor: "#fee2e2", margin: 0 }}>
                  {profileError}
                </div>
              )}

              {/* Avatar Upload */}
              <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "10px" }}>
                <div style={{ position: "relative", width: "80px", height: "80px", borderRadius: "50%", border: "2px solid var(--primary)", overflow: "hidden", backgroundColor: "var(--bg-light)" }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: 800, color: "var(--text-muted)" }}>
                      {user.name ? user.name[0].toUpperCase() : "U"}
                    </div>
                  )}
                  <label style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "26px", background: "rgba(0, 0, 0, 0.6)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Camera size={14} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
                <div>
                  <h4 style={{ fontWeight: 700, color: "var(--text-dark)" }}>Profile Picture</h4>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>Upload JPG, PNG or GIF. Max 5MB.</p>
                </div>
              </div>

              {/* Read Only Name */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>Full Name (Read Only)</label>
                <div className="auth-input" style={{ background: "var(--bg-light)", border: "1px solid var(--border-color)", cursor: "not-allowed", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                  <UserIcon size={16} />
                  <span>{user.name}</span>
                </div>
              </div>

              {/* Read Only Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>Email Address (Read Only)</label>
                <div className="auth-input" style={{ background: "var(--bg-light)", border: "1px solid var(--border-color)", cursor: "not-allowed", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                  <Mail size={16} />
                  <span>{user.email}</span>
                </div>
              </div>

              {/* Editable Phone */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-dark)", textTransform: "uppercase" }}>Mobile Number</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 9876543210"
                    className="auth-input"
                    style={{ paddingLeft: "36px" }}
                  />
                  <Phone size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                </div>
              </div>

              <button className="btn-place-order" type="submit" disabled={updatingProfile} style={{ marginTop: "10px" }}>
                {updatingProfile ? "Saving Profile..." : "Update Profile"}
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: Address Book */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px", flex: "2 1 500px" }}>
          {/* Saved Addresses list */}
          <section className="dashboard-section" style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-dark)" }}>
              <MapPin size={18} style={{ color: "var(--primary)" }} /> Saved Addresses
            </h2>

            {loadingAddresses ? (
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading saved addresses...</p>
            ) : addresses.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 20px", backgroundColor: "var(--bg-light)", borderRadius: "8px" }}>
                <MapPin size={32} style={{ color: "var(--text-muted)", marginBottom: "8px" }} />
                <p style={{ fontWeight: 600, fontSize: "14px" }}>No delivery address saved yet.</p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Fill the form below to register your first address.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {addresses.map((addr) => (
                  <article key={addr.id} style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "16px", borderRadius: "8px", border: "1px solid var(--border-color)", backgroundColor: addr.isDefault ? "var(--primary-light)" : "#fafafa", position: "relative" }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <span style={{ fontSize: "20px", marginTop: "2px" }}>🏠</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "14px", color: "var(--text-dark)" }}>{addr.addressName || "Home"}</strong>
                          {addr.isDefault && (
                            <span style={{ background: "var(--primary)", color: "white", fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "10px", textTransform: "uppercase" }}>Default</span>
                          )}
                        </div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)", marginTop: "6px" }}>{addr.recipientName}</p>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Phone: {addr.phone}</p>
                        <p style={{ fontSize: "13px", color: "var(--text-normal)", marginTop: "4px", lineHeight: "1.4" }}>
                          {addr.addressLine1}, {addr.addressLine2 ? `${addr.addressLine2}, ` : ""}{addr.city}, {addr.state} - {addr.postalCode}, {addr.country}
                        </p>
                        {addr.latitude && addr.longitude && (
                          <span style={{ display: "inline-flex", gap: "4px", alignItems: "center", fontSize: "10px", color: "var(--primary)", marginTop: "6px", background: "white", padding: "2px 6px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                            <Navigation size={8} /> Lat: {addr.latitude.toFixed(4)}, Lon: {addr.longitude.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAddress(addr.id)}
                      style={{ color: "var(--text-muted)", padding: "6px", alignSelf: "flex-start" }}
                      title="Delete Address"
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Add Address Form and map */}
          <section className="dashboard-section" style={{ background: "white", padding: "24px", borderRadius: "12px", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-dark)" }}>
              <Plus size={18} style={{ color: "var(--primary)" }} /> Add New Delivery Address
            </h2>

            <form onSubmit={handleAddAddress} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {addressSuccess && (
                <div className="warning" style={{ background: "#f0fdf4", color: "#15803d", borderColor: "#dcfce7", margin: 0 }}>
                  {addressSuccess}
                </div>
              )}
              {addressError && (
                <div className="warning" style={{ background: "#fef2f2", color: "#b91c1c", borderColor: "#fee2e2", margin: 0 }}>
                  {addressError}
                </div>
              )}

              {/* Automatic Location Detection */}
              <div style={{ background: "var(--primary-light)", padding: "16px", borderRadius: "8px", border: "1px dashed var(--primary)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-dark)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Sparkles size={14} style={{ color: "var(--primary)" }} /> Auto Detect Location
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Click to use your browser's GPS to find and autofill address details.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="btn-action-small primary-style"
                  style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0, padding: "8px 16px" }}
                >
                  <Compass size={14} /> Detect GPS Location
                </button>
              </div>

              {/* Map Container */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Interactive Map Picker (Click or drag marker to set exact location)</label>
                <div id="map-picker" style={{ height: "260px", width: "100%", borderRadius: "8px", border: "1px solid var(--border-color)", zIndex: 10 }}></div>
                {latitude && longitude && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Selected coordinates: Lat: <strong>{latitude.toFixed(6)}</strong>, Lon: <strong>{longitude.toFixed(6)}</strong>
                  </span>
                )}
              </div>

              <div className="grid-2col">
                {/* Address Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Address Type / Tag</label>
                  <input
                    value={addressName}
                    onChange={(e) => setAddressName(e.target.value)}
                    placeholder="e.g. Home, Office, Parents House"
                    className="auth-input"
                    required
                  />
                </div>

                {/* Default address checkbox */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "24px" }}>
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }}
                  />
                  <label htmlFor="isDefault" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)", cursor: "pointer" }}>Set as Default Delivery Address</label>
                </div>
              </div>

              <div className="grid-2col">
                {/* Recipient Name */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Recipient Full Name</label>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Recipient's Name"
                    className="auth-input"
                    required
                  />
                </div>

                {/* Recipient Phone */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Recipient Mobile Number</label>
                  <input
                    value={addressPhone}
                    onChange={(e) => setAddressPhone(e.target.value)}
                    placeholder="Mobile Number for delivery calls"
                    className="auth-input"
                    required
                  />
                </div>
              </div>

              <div className="grid-2col">
                {/* Address Line 1 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Address Line 1 (Flat, House No., Building)</label>
                  <input
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Flat/House No, Colony, Road"
                    className="auth-input"
                    required
                  />
                </div>

                {/* Address Line 2 */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Address Line 2 (Area, Landmark)</label>
                  <input
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="e.g. Near Big Temple"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="grid-3col">
                {/* City */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="auth-input"
                    required
                  />
                </div>

                {/* State */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>State</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    className="auth-input"
                    required
                  />
                </div>

                {/* Postal Code */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700 }}>Postal Code (Pincode)</label>
                  <input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Pincode"
                    className="auth-input"
                    required
                  />
                </div>
              </div>

              {/* Country */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  className="auth-input"
                  required
                />
              </div>

              <button className="btn-place-order" type="submit" disabled={addingAddress} style={{ marginTop: "14px" }}>
                {addingAddress ? "Saving Delivery Address..." : "Save Delivery Address"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </section>
  );
}
