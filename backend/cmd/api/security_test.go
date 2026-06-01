package main

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEncryptionDecryption(t *testing.T) {
	a := &app{
		encryptionKey: []byte("dev-encryption-key-32-characters"),
	}

	testCases := []string{
		"Hello World!",
		"9999999999",
		"Recipient Name",
		"Flat 101, Residency, Landmark, City, State - 560001",
	}

	for _, tc := range testCases {
		ciphertext, err := a.encrypt(tc)
		if err != nil {
			t.Fatalf("failed to encrypt %q: %v", tc, err)
		}

		if tc != "" && ciphertext == tc {
			t.Errorf("ciphertext is same as plaintext for %q", tc)
		}

		decrypted, err := a.decrypt(ciphertext)
		if err != nil {
			t.Fatalf("failed to decrypt %q: %v", ciphertext, err)
		}

		if decrypted != tc {
			t.Errorf("expected decrypted text %q, got %q", tc, decrypted)
		}
	}
}

func TestDecryptionPlaintextFallback(t *testing.T) {
	a := &app{
		encryptionKey: []byte("dev-encryption-key-32-characters"),
	}

	plaintext := "non-hex-plaintext-phone-number"
	decrypted, err := a.decrypt(plaintext)
	if err != nil {
		t.Fatalf("decrypt error: %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("expected decryption to return input as-is for non-hex, got %q", decrypted)
	}

	shortHex := "1234abcd"
	decrypted2, err := a.decrypt(shortHex)
	if err != nil {
		t.Fatalf("decrypt error: %v", err)
	}
	if decrypted2 != shortHex {
		t.Errorf("expected decryption to return input as-is for short hex, got %q", decrypted2)
	}
}

func TestImageCompressionBound(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 800, 800))
	for y := 0; y < 800; y++ {
		for x := 0; x < 800; x++ {
			img.Set(x, y, color.RGBA{255, 0, 0, 255})
		}
	}

	buf := new(bytes.Buffer)
	err := jpeg.Encode(buf, img, nil)
	if err != nil {
		t.Fatalf("failed to encode mock image: %v", err)
	}

	compressedBytes, err := compressImage(buf)
	if err != nil {
		t.Fatalf("failed to compress image: %v", err)
	}

	size := len(compressedBytes)
	t.Logf("compressed mock image size: %d bytes", size)
	if size == 0 {
		t.Errorf("expected compressed bytes, got 0")
	}
}

func TestPDFCompression(t *testing.T) {
	pdfContent := `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]>> endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
trailer <</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`

	reader := bytes.NewReader([]byte(pdfContent))
	compressed, err := compressPDF(reader)
	if err != nil {
		t.Fatalf("failed to optimize/compress PDF: %v", err)
	}

	if len(compressed) == 0 {
		t.Errorf("expected compressed PDF output, got empty bytes")
	}
}

func TestPresignUploadFallback(t *testing.T) {
	a := &app{
		r2PresignClient: nil,
	}

	req := httptest.NewRequest("POST", "/api/upload/presign", nil)
	rr := httptest.NewRecorder()

	a.presignUpload(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status OK, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["fallback"] != true {
		t.Errorf("expected fallback to be true, got %v", resp["fallback"])
	}
}
