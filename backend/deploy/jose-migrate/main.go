// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
// Build-time migration of pinned upstream consumers to the patched JOSE v4 API.
// This does not implement cryptography or change a consumer's verification policy.
package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const old = "github.com/go-jose/go-jose/v3"
const current = "github.com/go-jose/go-jose/v4"

// These are the algorithms understood by v3's parsers. Verification still uses
// each upstream caller's existing key/algorithm policy; unknown/none are absent.
var signatures = []string{"HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512", "EdDSA"}
var keys = []string{"RSA1_5", "RSA-OAEP", "RSA-OAEP-256", "A128KW", "A192KW", "A256KW", "dir", "ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A192KW", "ECDH-ES+A256KW", "A128GCMKW", "A192GCMKW", "A256GCMKW", "PBES2-HS256+A128KW", "PBES2-HS384+A192KW", "PBES2-HS512+A256KW"}
var encryption = []string{"A128CBC-HS256", "A192CBC-HS384", "A256CBC-HS512", "A128GCM", "A192GCM", "A256GCM"}

func algorithms(alias, kind string, values []string) ast.Expr {
	elements := []ast.Expr{}
	for _, value := range values {
		elements = append(elements, &ast.BasicLit{Kind: token.STRING, Value: strconv.Quote(value)})
	}
	return &ast.CompositeLit{Type: &ast.ArrayType{Elt: &ast.SelectorExpr{X: ast.NewIdent(alias), Sel: ast.NewIdent(kind)}}, Elts: elements}
}

func migrate(path string) error {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
	if err != nil {
		return err
	}
	imports := map[string]string{}
	rootAlias := ""
	changed := false
	// The old Okta cache unit test embeds an RSA-512 key, rejected by patched Go.
	// Keep its complete token-cache assertions, using a generated RSA-2048 fixture.
	if filepath.Base(path) == "cache_test.go" {
		for _, declaration := range file.Decls {
			fn, ok := declaration.(*ast.FuncDecl)
			if !ok || fn.Name.Name != "TestOAuthTokensAlwaysCached" {
				continue
			}
			ast.Inspect(fn.Body, func(node ast.Node) bool {
				call, ok := node.(*ast.CallExpr)
				if !ok || len(call.Args) != 1 {
					return true
				}
				selector, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || selector.Sel.Name != "WithPrivateKey" {
					return true
				}
				call.Args[0] = &ast.CallExpr{Fun: ast.NewIdent("dxosTestPrivateKey"), Args: []ast.Expr{ast.NewIdent("t")}}
				changed = true
				return true
			})
			fixture := `// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
package ` + file.Name.Name + `
import("crypto/rand";"crypto/rsa";"crypto/x509";"encoding/pem";"testing")
func dxosTestPrivateKey(t *testing.T)string{t.Helper();key,err:=rsa.GenerateKey(rand.Reader,2048);if err!=nil{t.Fatal(err)};return string(pem.EncodeToMemory(&pem.Block{Type:"RSA PRIVATE KEY",Bytes:x509.MarshalPKCS1PrivateKey(key)}))}
`
			if err := os.WriteFile(filepath.Join(filepath.Dir(path), "dxos_rsa_fixture_test.go"), []byte(fixture), 0644); err != nil {
				return err
			}
		}
	}

	for _, spec := range file.Imports {
		value, _ := strconv.Unquote(spec.Path.Value)
		if value == old || strings.HasPrefix(value, old+"/") {
			alias := filepath.Base(value)
			if value == old {
				alias = "jose"
			}
			if spec.Name != nil {
				alias = spec.Name.Name
			}
			imports[alias] = value
			if value == old {
				rootAlias = alias
			}
			spec.Path.Value = strconv.Quote(strings.Replace(value, old, current, 1))
			changed = true
		}
	}
	// v4 renamed JWT Builder.CompactSerialize to Serialize. Follow only JWT
	// builders; leave JWS/JWE serialization alone.
	builderImports := map[string]bool{}
	for _, spec := range file.Imports {
		value, _ := strconv.Unquote(spec.Path.Value)
		alias := filepath.Base(value)
		if spec.Name != nil {
			alias = spec.Name.Name
		}
		if value == current+"/jwt" {
			builderImports[alias] = true
		}
	}
	builders := map[string]bool{}
	var isBuilder func(ast.Expr) bool
	isBuilder = func(expr ast.Expr) bool {
		if id, ok := expr.(*ast.Ident); ok {
			return builders[id.Name]
		}
		call, ok := expr.(*ast.CallExpr)
		if !ok {
			return false
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return false
		}
		if sel.Sel.Name == "Claims" {
			return isBuilder(sel.X)
		}
		id, ok := sel.X.(*ast.Ident)
		return ok && builderImports[id.Name] && (sel.Sel.Name == "Signed" || sel.Sel.Name == "Encrypted" || sel.Sel.Name == "SignedAndEncrypted")
	}
	ast.Inspect(file, func(node ast.Node) bool {
		if assignment, ok := node.(*ast.AssignStmt); ok {
			for i, expr := range assignment.Rhs {
				if i < len(assignment.Lhs) && isBuilder(expr) {
					if id, ok := assignment.Lhs[i].(*ast.Ident); ok {
						builders[id.Name] = true
					}
				}
			}
		}
		if call, ok := node.(*ast.CallExpr); ok {
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == "CompactSerialize" && isBuilder(sel.X) {
				sel.Sel.Name = "Serialize"
				changed = true
			}
		}
		return true
	})
	if !changed {
		return nil
	}
	needRoot := false
	if rootAlias == "" {
		rootAlias = "dxosjose"
	}
	ast.Inspect(file, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		name, ok := selector.X.(*ast.Ident)
		if !ok {
			return true
		}
		imported := imports[name.Name]
		if imported != old && imported != old+"/jwt" {
			return true
		}
		sig := func() ast.Expr { needRoot = true; return algorithms(rootAlias, "SignatureAlgorithm", signatures) }
		key := func() ast.Expr { needRoot = true; return algorithms(rootAlias, "KeyAlgorithm", keys) }
		enc := func() ast.Expr { needRoot = true; return algorithms(rootAlias, "ContentEncryption", encryption) }
		switch selector.Sel.Name {
		case "ParseSigned":
			if len(call.Args) == 1 {
				call.Args = append(call.Args, sig())
			}
		case "ParseDetached":
			if len(call.Args) == 2 {
				call.Args = append(call.Args, sig())
			}
		case "ParseEncrypted":
			if len(call.Args) == 1 {
				call.Args = append(call.Args, key(), enc())
			}
		case "ParseSignedAndEncrypted":
			if len(call.Args) == 1 {
				call.Args = append(call.Args, key(), enc(), sig())
			}
		}
		return true
	})
	if needRoot && rootAlias == "dxosjose" {
		spec := &ast.ImportSpec{Name: ast.NewIdent(rootAlias), Path: &ast.BasicLit{Kind: token.STRING, Value: strconv.Quote(current)}}
		file.Decls = append([]ast.Decl{&ast.GenDecl{Tok: token.IMPORT, Specs: []ast.Spec{spec}}}, file.Decls...)
	}
	var output bytes.Buffer
	if err := format.Node(&output, fset, file); err != nil {
		return err
	}
	if err := os.WriteFile(path, output.Bytes(), 0644); err != nil {
		return err
	}
	fmt.Println("JOSE v4 consumer migrated:", path)
	return nil
}

func main() {
	if len(os.Args) < 2 {
		panic("source module path required")
	}
	for _, root := range os.Args[1:] {
		manifest, err := os.ReadFile(filepath.Join(root, "go.mod"))
		if err != nil {
			panic(err)
		}
		fields := strings.Fields(string(manifest))
		if len(fields) < 2 || fields[0] != "module" || (fields[1] != "github.com/hashicorp/cap" && fields[1] != "github.com/okta/okta-sdk-golang/v2") {
			panic("only pinned CAP and Okta consumer migrations are supported")
		}
		err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() && (entry.Name() == ".git" || entry.Name() == "vendor") {
				return filepath.SkipDir
			}
			if !entry.IsDir() && strings.HasSuffix(path, ".go") {
				return migrate(path)
			}
			return nil
		})
		if err != nil {
			panic(err)
		}
	}
}
