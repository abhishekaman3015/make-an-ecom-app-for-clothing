package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGoogleLoginEmptyRequest(t *testing.T) {
	a := &app{
		jwtSecret: []byte("test-secret"),
	}

	req := httptest.NewRequest("POST", "/api/auth/google", strings.NewReader(`{}`))
	w := httptest.NewRecorder()

	a.googleLogin(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", w.Code)
	}

	var res map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res["message"] != "idToken is required" {
		t.Errorf("expected 'idToken is required' message, got %s", res["message"])
	}
}
