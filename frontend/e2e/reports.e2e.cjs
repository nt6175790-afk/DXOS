// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
/* Real browser + real Nest API + disposable MySQL. No HTTP mocks or production data writes.
   Run after backend build. Set PLAYWRIGHT_MODULE to an installed playwright package when
   it is supplied by the local tooling runtime; otherwise standard require('playwright'). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const frontend = path.resolve(__dirname, '..'), root = path.dirname(frontend);
const fromRoot = createRequire(path.join(root, 'package.json'));
const fromFrontend = createRequire(path.join(frontend, 'package.json'));
const { PrismaClient } = fromRoot('@prisma/client');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.REPORT_E2E_OUTPUT || path.join(frontend, 'test-results/reports');
fs.mkdirSync(output, { recursive: true });
process.loadEnvFile(path.join(root, 'backend/.env'));
const localUrl = process.env.DATABASE_URL;
if (!localUrl) throw new Error('Local database configuration missing.');
const name = `dx_os_reports_e2e_${randomBytes(8).toString('hex')}`;
if (!/^dx_os_reports_e2e_[a-f0-9]{16}$/.test(name)) throw new Error('Invalid disposable database name.');
const tempUrl = new URL(localUrl); tempUrl.pathname = '/' + name;
Object.assign(process.env, { DATABASE_URL: tempUrl.toString(), NODE_ENV: 'test', LOG_LEVEL: 'error', AI_PROVIDER: 'disabled', JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), SWAGGER_ENABLED: 'true' });
const admin = new PrismaClient({ datasources: { db: { url: localUrl } } });
let db, app, vite, browser, created = false;
const results = [], consoleErrors = [];
const privateValues = [];
let stage = 'setup';
async function check(name, run) { stage = name; await run(); results.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`); }
async function main() {
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    const deployment = spawnSync(process.execPath, [fromRoot.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(root, 'database/schema.prisma')], { cwd: root, env: process.env, encoding: 'utf8' });
    if (deployment.status !== 0) throw new Error('Disposable migration replay failed.');
    db = new PrismaClient();
    fromRoot('tsx/cjs');
    const { seedReports } = fromRoot(path.join(root, 'tests/backend/reports.fixture.ts'));
    const { PasswordService } = fromRoot(path.join(root, 'backend/dist/modules/auth/password.service.js'));
    const password = randomBytes(24).toString('base64url'), hash = await new PasswordService().hash(password); privateValues.push(password, hash, process.env.JWT_ACCESS_SECRET);
    const seed = await seedReports(db, hash);
    const limited = await db.user.create({ data: { email: `limited-${randomUUID()}@example.test`, passwordHash: hash, displayName: 'Người xem giới hạn' } });
    const membership = await db.organizationMembership.create({ data: { organizationId: seed.org.id, userId: limited.id } });
    const role = await db.role.create({ data: { organizationId: seed.org.id, name: 'Limited reports', key: 'limited-reports' } });
    await db.membershipRole.create({ data: { organizationId: seed.org.id, membershipId: membership.id, roleId: role.id } });
    for (const key of ['report:read', 'employee:read', 'department:read', 'organization:read']) {
      const permission = await db.permission.findUniqueOrThrow({ where: { key } }); await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    const { NestFactory } = fromRoot('@nestjs/core');
    const { AppModule } = fromRoot(path.join(root, 'backend/dist/app.module.js'));
    const { configureApplication } = fromRoot(path.join(root, 'backend/dist/app.setup.js'));
    const { getAppConfiguration } = fromRoot(path.join(root, 'backend/dist/config/environment.js'));
    const { StructuredLogger } = fromRoot(path.join(root, 'backend/dist/common/logging/structured-logger.js'));
    app = await NestFactory.create(AppModule, { logger: false });
    configureApplication(app, getAppConfiguration(), new StructuredLogger('error', () => {})); await app.listen(0, '127.0.0.1');
    const apiUrl = await app.getUrl();
    const ts = fromFrontend('typescript'), cache = path.join(frontend, 'node_modules/.cache/hr-reports-e2e'); fs.mkdirSync(cache, { recursive: true });
    const configPath = path.join(cache, 'vite.config.mjs');
    const configCode = ts.transpileModule(fs.readFileSync(path.join(frontend, 'vite.config.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    fs.writeFileSync(configPath, `const __dirname = ${JSON.stringify(frontend)};\n` + configCode);
    const { default: config } = await import(pathToFileURL(configPath).href);
    const viteModule = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')).href);
    process.chdir(frontend);
    vite = await viteModule.createServer({ ...config, root: frontend, configFile: false, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: apiUrl, changeOrigin: true } } } }); await vite.listen();
    const address = vite.httpServer.address(), base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: process.env.REPORT_BROWSER_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const observe = (p) => { p.on('pageerror', (e) => consoleErrors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); }); };
    observe(page);
    const login = async (p, email) => {
      await p.goto(base + '/reports'); await p.getByLabel('Địa chỉ email').fill(email); await p.getByLabel('Mật khẩu', { exact: true }).fill(password);
      const response = p.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
      await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); assert.equal((await response).status(), 200);
      await p.getByTestId('report-results').waitFor();
    };
    const applyDates = async (from, to) => { await page.getByLabel('Từ ngày').fill(from); await page.getByLabel('Đến ngày').fill(to); const response = page.waitForResponse((r) => r.url().includes('/reports/overview?')); await page.getByRole('button', { name: 'Áp dụng', exact: true }).click(); assert.equal((await response).status(), 200); await page.getByTestId('report-results').waitFor(); };
    await check('Real login and report page', async () => { await login(page, seed.actor.email); await applyDates('2026-09-01', '2026-09-30'); assert.ok(await page.getByText('18.000.000,03 VND', { exact: true }).count() >= 2); });
    await check('KPI, chart and department data', async () => { await page.getByRole('img', { name: 'Xu hướng chấm công', exact: true }).waitFor(); assert.equal(await page.getByText('100%', { exact: true }).count() > 0, true); await page.getByRole('table', { name: 'Bảng thống kê phòng ban' }).waitFor(); });
    await check('Department filter and grouping', async () => { await page.getByLabel('Phòng ban', { exact: true }).selectOption(seed.department.id); await page.getByLabel('Nhóm thời gian').selectOption('month'); const response = page.waitForResponse((r) => r.url().includes('/reports/overview?')); await page.getByRole('button', { name: 'Áp dụng', exact: true }).click(); const data = await (await response).json(); assert.equal(data.workforce.metrics.total, 1); assert.equal(data.payroll.currencies[0].net, '9000000.01'); });
    await check('Permission checked CSV download and audit', async () => { const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Xuất CSV Nhân sự' }).click(); const download = await downloaded; const file = await download.path(); const text = fs.readFileSync(file, 'utf8'); assert.ok(text.startsWith('\uFEFF')); assert.ok(text.includes('newEmployeeRecords')); assert.equal(await db.auditEvent.count({ where: { organizationId: seed.org.id, event: 'report.exported' } }), 1); });
    await check('Empty range uses empty states', async () => { await applyDates('2020-01-01', '2020-01-31'); await page.getByText('Chưa có dữ liệu lương trong khoảng đã chọn.').waitFor(); await page.getByText(/Chưa có dữ liệu cho xu hướng chấm công/).waitFor(); });
    await check('Responsive mobile layout', async () => { await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); await page.screenshot({ path: path.join(output, 'reports-mobile.png'), fullPage: true }); });
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByLabel('Phòng ban', { exact: true }).selectOption(''); await applyDates('2026-09-01', '2026-09-30'); await page.screenshot({ path: path.join(output, 'reports-desktop.png'), fullPage: true });
    await check('Restricted real user sees neither payroll nor export', async () => { const restricted = await browser.newContext(); const p = await restricted.newPage(); observe(p); await login(p, limited.email); assert.equal(await p.getByText('Tổng hợp tiền lương').count(), 0); assert.equal(await p.getByText('Tổng lương thực nhận').count(), 0); assert.equal(await p.getByRole('button', { name: /Xuất CSV/ }).count(), 0); await restricted.close(); });
    await check('Zero browser console errors', async () => assert.deepEqual(consoleErrors, []));
  } catch (error) {
    let diagnostic = error instanceof Error ? error.message.replace(/mysql:\/\/[^\s"']+/g, '[DATABASE_URL]') : 'Unknown failure';
    for (const value of privateValues) if (value) diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
    if (error?.constructor?.name?.startsWith('Prisma')) diagnostic = 'Database fixture failed: ' + (error.code || error.constructor.name);
    results.push({ name: stage, status: 'FAIL', error: diagnostic }); process.exitCode = 1;
    console.error(`FAIL: ${stage}`);
  } finally {
    await browser?.close(); await vite?.close(); await app?.close(); await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${name}\``); await admin.$disconnect();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, consoleErrors, disposableDatabaseRemoved: created }, null, 2));
  }
}
void main();
