async (page) => {
  // Run with playwright-cli run-code --filename scripts/browser-checks.js.
  // Provider-failure and all-blocked cases below are explicitly injected UI tests.
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  const route1 = page.getByRole('button', { name: /^1 Route 1/ });
  await route1.waitFor({ timeout: 95000 });
  const recommended = page.locator('.route-option').filter({ has: page.locator('.recommended') });
  if (await recommended.count()) check(await recommended.getAttribute('aria-pressed') === 'true', 'Recommended route must be selected');
  check(await page.locator('.route-option').count() === 3, 'Three routes must be shown');
  check(!await page.locator('#checkpoint-details').isVisible(), 'Checkpoints must be collapsed by default');
  await page.setViewportSize({ width: 1365, height: 679 });
  const layout = await page.evaluate(() => {
    const map = document.querySelector('.map').getBoundingClientRect();
    const header = document.querySelector('.app-header').getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    return { mapHeight: map.height, mapTop: map.top, headerWidth: header.width, sidebarWidth: sidebar.width };
  });
  check(layout.mapTop === 0 && layout.mapHeight >= 620, `Map must occupy full workspace height: ${JSON.stringify(layout)}`);
  check(layout.headerWidth <= layout.sidebarWidth, 'Header must stop at the sidebar boundary');
  await page.screenshot({ path: 'output/playwright/map-first-1365.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Checkpoints \(/ }).click();
  const rows25 = await page.locator('.checkpoint-table tbody tr').count();
  const route2 = page.getByRole('button', { name: /^2 Route 2/ });
  await route2.click();
  check(await route2.getAttribute('aria-pressed') === 'true', 'Route selection must update');
  await page.getByRole('button', { name: /Show checkpoint 2 / }).click();
  check(await page.locator('.focused-row').count() === 1, 'Checkpoint focus must update');

  let apiCalls = 0;
  const countAPI = request => { if (request.url().includes('/api/')) apiCalls++; };
  page.on('request', countAPI);
  const etaBefore = await page.locator('.checkpoint-table tbody tr').first().innerText();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await page.getByText('Forecast retrieved', { exact: true }).waitFor();
  check(await page.locator('.weather-field').count() === 1, 'Interpolated forecast canvas must render');
  const slider = page.getByRole('slider', { name: 'Forecast hour after departure' });
  await slider.focus();
  await slider.press('End');
  check(await slider.inputValue() === '48', 'Slider End key must reach +48 hours');
  check(await page.locator('.checkpoint-table tbody tr').first().innerText() === etaBefore, 'Slider must not change trip ETAs');
  await page.getByRole('checkbox', { name: 'Weather layer' }).uncheck();
  await page.getByRole('checkbox', { name: 'Weather layer' }).check();
  check(apiCalls === 0, 'Slider and layer toggle must make no API requests');
  page.off('request', countAPI);

  await page.getByRole('button', { name: 'Routes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Load weight (lb)' }).fill('41000');
  await page.getByText('Trip inputs changed. Compare again to update the results.').waitFor();
  await page.route('**/api/plan', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'provider_unavailable', message: 'Forecast unavailable — injected browser test.' } }) }));
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Forecast unavailable' }).waitFor();
  check(await page.getByRole('spinbutton', { name: 'Load weight (lb)' }).inputValue() === '41000', 'Failure must preserve load input');
  check(await page.locator('.route-option').count() === 3, 'Failure must preserve prior results');
  await page.unroute('**/api/plan');

  await page.getByRole('combobox', { name: 'Origin', exact: true }).fill('Chicago');
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Search for and select both cities' }).waitFor();
  const origin = page.getByRole('combobox', { name: 'Origin', exact: true });
  await origin.press('Enter');
  await page.getByRole('listbox', { name: 'Origin cities' }).waitFor();
  await origin.press('ArrowDown');
  await origin.press('Enter');
  check((await origin.inputValue()).startsWith('Chicago,'), 'Keyboard selection must choose a real city');
  await page.getByRole('combobox', { name: 'Checkpoints', exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByText('Trip inputs changed. Compare again to update the results.').waitFor({ state: 'hidden', timeout: 95000 });
  check(await page.locator('.checkpoint-table tbody tr').count() > rows25, '10-mile sampling must produce more checkpoints');

  await page.addScriptTag({ url: 'http://127.0.0.1:5173/node_modules/axe-core/axe.min.js' });
  const axe = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  check(axe.violations.length === 0, JSON.stringify(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const sizes = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
    check(sizes.content <= sizes.width, `Horizontal page overflow at ${width}px: ${sizes.content}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/mobile-full.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A spatially varying synthetic field tests rendering; it is not live severe weather.
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.route('**/api/plan', async route => {
    const upstream = await route.fetch({ timeout: 95000 });
    check(upstream.status() === 200, 'Need a valid plan for the field rendering fixture');
    const data = await upstream.json();
    const longitudes = data.corridor.map(c => c.coordinate[0]);
    const left = Math.min(...longitudes), width = Math.max(...longitudes) - left;
    for (const c of data.corridor) for (const hour of c.hours) {
      hour.wind_mph = 10 + 50 * (c.coordinate[0] - left) / width;
      hour.rain_in = 0; hour.snow_in = 0;
      hour.level = hour.wind_mph >= 55 || (hour.wind_mph >= 45 && data.load_lb > 30000) ? 4
        : hour.wind_mph >= 45 || (hour.wind_mph >= 35 && data.load_lb > 40000) ? 3
        : hour.wind_mph >= 35 ? 2 : hour.wind_mph >= 25 ? 1 : 0;
    }
    await route.fulfill({ response: upstream, json: data });
  });
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).waitFor({ timeout: 95000 });
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await page.getByRole('button', { name: /^Checkpoints \(/ }).click();
  const fieldColors = await page.locator('.weather-field').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const palette = [[32,114,88], [166,106,9], [210,91,35], [177,47,66], [98,42,112]];
    const seen = new Set();
    for (let i=0; i<data.length; i+=4) if (data[i+3] > 10) {
      const index = palette.findIndex(rgb => rgb.every((v,j) => Math.abs(v-data[i+j]) < 8));
      if (index >= 0) seen.add(index);
    }
    return [...seen];
  });
  check(fieldColors.length >= 3, `Expected multiple weather bands in synthetic field: ${fieldColors}`);
  await page.screenshot({ path: 'output/playwright/weather-field-injected.png' });
  await page.unroute('**/api/plan');
  await page.getByRole('button', { name: 'Routes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.route('**/api/plan', async route => {
    const upstream = await route.fetch({ timeout: 95000 });
    check(upstream.status() === 200, 'Need a valid upstream response to inject blocked UI scenario');
    const data = await upstream.json();
    data.recommended_id = null;
    data.recommendation_reason = 'All blocked — injected browser test.';
    for (const r of data.routes) {
      r.summary.eligible = false; r.summary.max_risk = 4; r.summary.average_risk = 4;
      r.summary.risk_miles = { Low: 0, Moderate: 0, High: 0, Severe: 0, 'No Travel': r.distance_miles };
      for (const p of r.checkpoints) { p.weather.wind_mph = 60; p.risk = { level: 4, label: 'No Travel', reasons: ['Synthetic browser test: 60 mph wind.'] }; }
      for (const s of r.segments) s.level = 4;
    }
    for (const c of data.corridor) for (const hour of c.hours) { hour.level = 4; hour.wind_mph = 60; }
    await route.fulfill({ response: upstream, json: data });
  });
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByText('No route recommended', { exact: true }).waitFor({ timeout: 95000 });
  check(await page.locator('.recommended').count() === 0, 'Blocked routes must not have a recommendation badge');
  await page.screenshot({ path: 'output/playwright/blocked-injected.png' });
  await page.unroute('**/api/plan');
  check(errors.length === 0, `Unexpected JavaScript errors: ${errors.join('; ')}`);
  await page.reload();
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.locator('.route-option').first().waitFor({ timeout: 95000 });
  await page.screenshot({ path: 'output/playwright/desktop.png' });
  return { passed: true, mapLayoutAt1365x679: layout, desktop: '1440×1000', mobileWidths: [390, 320], sliderAPICalls: apiCalls, axeViolations: axe.violations.length, javascriptErrors: errors, injectedScenarios: ['provider failure', 'all routes No Travel', 'spatial forecast field'], fieldColors };
}
