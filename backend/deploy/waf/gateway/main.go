// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	crs "github.com/corazawaf/coraza-coreruleset/v4"
	coraza "github.com/corazawaf/coraza/v3"
	corazahttp "github.com/corazawaf/coraza/v3/http"
)

const maxRequestBody = 6291456

func proxy(target *url.URL) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			originalHost := r.In.Host
			r.SetURL(target)
			r.Out.Host = originalHost
			// Rewrite removes untrusted Forwarded/X-Forwarded-* headers before this.
			r.SetXForwarded()
		},
		Transport: &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			ForceAttemptHTTP2: true, MaxIdleConns: 100, MaxIdleConnsPerHost: 32, IdleConnTimeout: 90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 150 * time.Second, ExpectContinueTimeout: time.Second},
		ErrorLog: log.New(io.Discard, "", 0),
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			http.Error(w, "Gateway unavailable", http.StatusBadGateway)
		},
	}
}

type guardedWriter struct {
	http.ResponseWriter
	wrote bool
}

func (w *guardedWriter) WriteHeader(status int) { w.wrote = true; w.ResponseWriter.WriteHeader(status) }
func (w *guardedWriter) Write(body []byte) (int, error) {
	w.wrote = true
	return w.ResponseWriter.Write(body)
}
func (w *guardedWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *guardedWriter) Flush() {
	w.wrote = true
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}
func (w *guardedWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	w.wrote = true
	return http.NewResponseController(w.ResponseWriter).Hijack()
}

func newGateway(directives string, api, frontend *url.URL) (http.Handler, error) {
	if api == nil || frontend == nil || api.Scheme != "http" || frontend.Scheme != "http" || api.Host == "" || frontend.Host == "" {
		return nil, errors.New("fixed HTTP upstreams required")
	}
	waf, err := coraza.NewWAF(coraza.NewWAFConfig().WithRootFS(crs.FS).WithDirectives(directives))
	if err != nil {
		return nil, errors.New("invalid WAF configuration")
	}
	apiProxy, uiProxy := proxy(api), proxy(frontend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.ContentLength > maxRequestBody {
			http.Error(w, "Request body too large", http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
		accepted := false
		guarded := &guardedWriter{ResponseWriter: w}
		inspected := corazahttp.WrapHandler(waf, http.HandlerFunc(func(out http.ResponseWriter, in *http.Request) {
			accepted = true
			if strings.HasPrefix(in.URL.Path, "/api/") {
				apiProxy.ServeHTTP(out, in)
			} else {
				uiProxy.ServeHTTP(out, in)
			}
		}))
		inspected.ServeHTTP(guarded, r)
		// The official connector returns without writing on an inspection error.
		// Never turn that failure into an empty success or forward an unchecked request.
		if !accepted && !guarded.wrote {
			http.Error(w, "Request inspection unavailable", http.StatusServiceUnavailable)
		}
	}), nil
}

func main() {
	directives, err := os.ReadFile("/config/coraza.conf")
	if err != nil {
		log.Fatal("WAF configuration unavailable")
	}
	api, _ := url.Parse("http://apisix:9080")
	frontend, _ := url.Parse("http://frontend:8080")
	handler, err := newGateway(string(directives), api, frontend)
	if err != nil {
		log.Fatal("WAF initialization failed")
	}
	server := &http.Server{Addr: ":8080", Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 180 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 65536, ErrorLog: log.New(io.Discard, "", 0)}
	stopped := make(chan os.Signal, 1)
	signal.Notify(stopped, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-stopped
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Print("Coraza WAF gateway listening on :8080")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("WAF listener stopped")
	}
}
