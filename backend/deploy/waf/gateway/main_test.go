// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bufio"
	"bytes"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type brokenBody struct{}

func (brokenBody) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }

func TestGateway(t *testing.T) {
	rules, err := os.ReadFile("../coraza.conf")
	if err != nil {
		t.Fatal(err)
	}
	var apiCalls, uiCalls atomic.Int64
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiCalls.Add(1)
		w.Header().Set("X-Upstream", "api")
		w.Header().Set("X-Received-Forwarded", r.Header.Get("Forwarded"))
		w.Header().Set("X-Received-For", r.Header.Get("X-Forwarded-For"))
		w.Header().Set("X-Received-Authorization", r.Header.Get("Authorization"))
		http.SetCookie(w, &http.Cookie{Name: "synthetic", Value: "session-fixture", HttpOnly: true})
		body, _ := io.ReadAll(r.Body)
		w.Write(body)
	}))
	defer api.Close()
	ui := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uiCalls.Add(1)
		w.Header().Set("X-Upstream", "frontend")
		w.Write([]byte("frontend"))
	}))
	defer ui.Close()
	apiURL, _ := url.Parse(api.URL)
	uiURL, _ := url.Parse(ui.URL)
	handler, err := newGateway(string(rules), apiURL, uiURL)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handler)
	defer server.Close()
	cases := []struct {
		name, path, method, body, upstream string
		status                             int
	}{
		{"frontend", "/workflows", "GET", "", "frontend", 200},
		{"api", "/api/v1/health", "GET", "", "api", 200},
		{"api-lookalike-not-api", "/api-lookalike", "GET", "", "frontend", 200},
		{"normal-json", "/api/v1/auth/login", "POST", `{"email":"synthetic@example.test","password":"synthetic-password"}`, "api", 200},
		{"sqli", "/?id=1%20OR%201%3D1%20--", "GET", "", "", 403},
		{"xss", "/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E", "GET", "", "", 403},
		{"traversal", "/api/v1/health?file=../../../../etc/passwd", "GET", "", "", 403},
		{"oidc-issuer-exclusion", "/api/v1/auth/sso/complete", "POST", `{"code":"fixture","iss":"http://localhost:8180/realms/dxos"}`, "api", 200},
		{"oidc-code-not-exempt", "/api/v1/auth/sso/complete", "POST", `{"code":"http://127.0.0.1/private","iss":"http://localhost:8180/realms/dxos"}`, "", 403},
		{"issuer-not-exempt-on-other-route", "/api/v1/auth/login", "POST", `{"iss":"http://127.0.0.1/private"}`, "", 403},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			before := apiCalls.Load() + uiCalls.Load()
			request, _ := http.NewRequest(tc.method, server.URL+tc.path, strings.NewReader(tc.body))
			if tc.body != "" {
				request.Header.Set("Content-Type", "application/json")
			}
			response, err := http.DefaultClient.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			io.Copy(io.Discard, response.Body)
			if response.StatusCode != tc.status {
				t.Fatalf("status=%d want=%d", response.StatusCode, tc.status)
			}
			if response.Header.Get("Referrer-Policy") != "no-referrer" {
				t.Fatal("missing referrer policy")
			}
			if response.Header.Get("X-Upstream") != tc.upstream {
				t.Fatal("incorrect upstream")
			}
			if tc.status == 403 && apiCalls.Load()+uiCalls.Load() != before {
				t.Fatal("blocked request reached an upstream")
			}
		})
	}
	t.Run("authorization-cookies-and-forwarding-boundary", func(t *testing.T) {
		request, _ := http.NewRequest("GET", server.URL+"/api/v1/auth/me", nil)
		request.Header.Set("Authorization", "Bearer synthetic-fixture")
		request.Header.Set("X-Forwarded-For", "203.0.113.99")
		request.Header.Set("Forwarded", "for=203.0.113.99")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != 200 || response.Header.Get("X-Received-Authorization") != "Bearer synthetic-fixture" {
			t.Fatal("authorization not preserved")
		}
		if response.Header.Get("X-Received-Forwarded") != "" || strings.Contains(response.Header.Get("X-Received-For"), "203.0.113.99") {
			t.Fatal("untrusted forwarding header accepted")
		}
		if len(response.Cookies()) != 1 || !response.Cookies()[0].HttpOnly {
			t.Fatal("cookie altered")
		}
	})
	t.Run("multipart-upload", func(t *testing.T) {
		body := "--fixture-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"sample.txt\"\r\nContent-Type: text/plain\r\n\r\nsynthetic upload\r\n--fixture-boundary--\r\n"
		request, _ := http.NewRequest("POST", server.URL+"/api/v1/files", strings.NewReader(body))
		request.Header.Set("Content-Type", "multipart/form-data; boundary=fixture-boundary")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		actual, _ := io.ReadAll(response.Body)
		if response.StatusCode != 200 || string(actual) != body {
			t.Fatal("multipart body changed or denied")
		}
	})
	t.Run("body-limit", func(t *testing.T) {
		before := apiCalls.Load()
		response, err := http.Post(server.URL+"/api/v1/files", "text/plain", bytes.NewReader(make([]byte, maxRequestBody+1)))
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != 413 || apiCalls.Load() != before {
			t.Fatal("oversized request forwarded")
		}
	})
	t.Run("invalid-rules-fail-startup", func(t *testing.T) {
		if _, err := newGateway("UnknownDirective invalid", apiURL, uiURL); err == nil {
			t.Fatal("invalid WAF rules accepted")
		}
	})
	t.Run("inspection-errors-fail-closed", func(t *testing.T) {
		before := apiCalls.Load()
		request := httptest.NewRequest("POST", "http://example.test/api/v1/files", brokenBody{})
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != 503 || apiCalls.Load() != before {
			t.Fatal("inspection error became a success or reached upstream")
		}
	})
	t.Run("chunked-body-limit", func(t *testing.T) {
		before := apiCalls.Load()
		request, _ := http.NewRequest("POST", server.URL+"/api/v1/files", io.NopCloser(bytes.NewReader(make([]byte, maxRequestBody+1))))
		request.Header.Set("Content-Type", "text/plain")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode < 400 || apiCalls.Load() != before {
			t.Fatal("chunked oversized body forwarded")
		}
	})
	t.Run("upstream-errors-are-generic", func(t *testing.T) {
		dead := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
		deadURL, _ := url.Parse(dead.URL)
		dead.Close()
		gateway, err := newGateway(string(rules), deadURL, uiURL)
		if err != nil {
			t.Fatal(err)
		}
		recorder := httptest.NewRecorder()
		gateway.ServeHTTP(recorder, httptest.NewRequest("GET", "http://example.test/api/v1/health", nil))
		if recorder.Code != 502 || strings.Contains(recorder.Body.String(), deadURL.Host) {
			t.Fatal("upstream details leaked or failed open")
		}
	})
}

func TestWebSocketUpgrade(t *testing.T) {
	rules, _ := os.ReadFile("../coraza.conf")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		connection, rw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer connection.Close()
		rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
		rw.Flush()
		line, _ := rw.ReadString('\n')
		rw.WriteString(line)
		rw.Flush()
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	handler, err := newGateway(string(rules), target, target)
	if err != nil {
		t.Fatal(err)
	}
	gateway := httptest.NewServer(handler)
	defer gateway.Close()
	connection, err := net.Dial("tcp", strings.TrimPrefix(gateway.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	connection.SetDeadline(time.Now().Add(5 * time.Second))
	connection.Write([]byte("GET /api/v1/socket HTTP/1.1\r\nHost: example.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"))
	reader := bufio.NewReader(connection)
	response, err := http.ReadResponse(reader, &http.Request{Method: "GET"})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 101 {
		t.Fatalf("upgrade failed: %d", response.StatusCode)
	}
	connection.Write([]byte("synthetic ping\n"))
	echo, err := reader.ReadString('\n')
	if err != nil || echo != "synthetic ping\n" {
		t.Fatal("upgrade stream failed", err)
	}
}
