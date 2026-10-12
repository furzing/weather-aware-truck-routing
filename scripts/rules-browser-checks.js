async (page) => {
  // Playwright CLI regression check. Duration cases are explicitly injected UI fixtures.
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const base = page.url().startsWith('http://127.0.0.1:8000') ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:5173';
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1365, height: 679 });
  await page.goto(`${base}/rules`);
  check(await page.title() === 'Rules | Spotter route planner', 'Rules needs its own title');
  check(await page.getByRole('heading', { name: 'Rules', exact: true }).count() === 1, 'Deep link must render Rules');
  await page.getByRole('link', { name: 'ELD & hours of service', exact: true }).click();
  check(await page.locator('#hos').evaluate(el => Math.abs(el.getBoundingClientRect().top - 24) < 2), 'Contents link must scroll to ELD guidance');
  await page.getByText('No ELD is connected. Driver clocks are not checked.', { exact: true }).waitFor();
  await page.getByText('ELD records and driver review', { exact: true }).click();
  await page.getByText('Exceptions and adverse weather', { exact: true }).click();
  await page.addScriptTag({ url: 'http://127.0.0.1:5173/node_modules/axe-core/axe.min.js' });
  const scan = () => page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  const desktopAxe = await scan();
  check(desktopAxe.violations.length === 0, JSON.stringify(desktopAxe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
  await page.screenshot({ path: 'output/playwright/rules-eld-desktop.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (!await page.getByRole('link', { name: 'Weather & load thresholds', exact: true }).isVisible()) await page.getByText('On this page', { exact: true }).click();
    await page.getByRole('link', { name: 'Weather & load thresholds', exact: true }).click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Rules page overflows at ${width}px`);
    check(await page.locator('.rules-table-scroll').evaluate(el => el.scrollWidth >= el.clientWidth), 'Threshold table must remain available');
    const mobileAxe = await scan();
    check(mobileAxe.violations.length === 0, JSON.stringify(mobileAxe.violations.map(v => v.id)));
    if (width === 390) await page.screenshot({ path: 'output/playwright/rules-thresholds-mobile.png' });
  }
  await page.setViewportSize({ width: 1365, height: 679 });
  await page.getByRole('link', { name: 'Back to planner', exact: true }).first().click();
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.locator('.route-option').first().waitFor({ timeout: 95000 });
  await page.getByRole('button', { name: /^2 Route 2/ }).click();
  await page.getByRole('button', { name: 'Weather', exact: true }).click();
  await page.getByRole('slider', { name: 'Forecast hour after departure' }).focus();
  await page.keyboard.press('End');
  const retrieval = await page.locator('.forecast-freshness').innerText();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  check(new URL(page.url()).pathname === '/rules', 'Rules must be a real URL');
  check(await page.getByRole('heading', { name: 'Rules', exact: true }).evaluate(el => el === document.activeElement), 'Navigation should focus the page heading');
  await page.goBack();
  check(await page.getByRole('button', { name: 'Weather', exact: true }).getAttribute('aria-pressed') === 'true', 'Back must preserve the Weather view');
  check(await page.getByRole('slider').inputValue() === '48', 'Back must preserve the forecast hour');
  check(await page.locator('.route-option').nth(1).getAttribute('aria-pressed') === 'true', 'Back must preserve route selection');
  check(await page.locator('.forecast-freshness').innerText() === retrieval, 'Navigation must preserve original forecast provenance');
  await page.goForward();
  await page.getByRole('link', { name: 'Back to planner', exact: true }).first().click();
  await page.getByRole('button', { name: 'Routes', exact: true }).click();
  await page.getByRole('link', { name: 'ELD & hours of service', exact: true }).click();
  check(new URL(page.url()).hash === '#hos', 'Contextual link must target HOS guidance');
  check(await page.locator('#hos').evaluate(el => Math.abs(el.getBoundingClientRect().top - 24) < 2), 'Contextual link must scroll to its section');
  await page.getByRole('link', { name: 'Back to planner', exact: true }).first().click();
  const map = await page.locator('.map').boundingBox();
  check(map.y === 0 && map.height >= 620, 'Rules navigation must preserve the full map layout');
  await page.screenshot({ path: 'output/playwright/rules-planner-return.png' });

  let baseline;
  for (const seconds of [8 * 3600, 8 * 3600 + 1, 11 * 3600, 11 * 3600 + 1]) {
    await page.route('**/api/plan', async request => {
      if (!baseline) {
        const upstream = await request.fetch({ timeout: 95000 });
        check(upstream.status() === 200, 'Duration fixture needs a valid plan');
        baseline = await upstream.json();
      }
      const data = structuredClone(baseline);
      data.recommended_id = data.routes[0].id;
      data.recommendation_reason = 'Injected duration fixture; not a live schedule.';
      for (const route of data.routes) {
        const factor = seconds / route.duration_s;
        route.duration_s = route.summary.duration_s = seconds;
        route.arrival = new Date(Date.parse(data.departure) + seconds * 1000).toISOString();
        for (const checkpoint of route.checkpoints) {
          checkpoint.elapsed_s *= factor;
          checkpoint.eta = new Date(Date.parse(data.departure) + checkpoint.elapsed_s * 1000).toISOString();
        }
      }
      await request.fulfill({ status: 200, json: data });
    });
    await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
    await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
    await page.getByRole('button', { name: 'Edit trip', exact: true }).waitFor({ timeout: 95000 });
    await page.getByText('Injected duration fixture; not a live schedule.', { exact: true }).waitFor();
    const note = await page.locator('.driving-note').allTextContents();
    check(note.length === (seconds > 8 * 3600 ? 2 : 1), `Unexpected break cue at ${seconds}s`);
    if (seconds > 11 * 3600) check(note[1].includes('11-hour'), 'Long route must prompt rest/driver planning');
    else if (seconds > 8 * 3600) check(note[1].includes('break timing'), 'Intermediate route must prompt break review');
    await page.unroute('**/api/plan');
  }
  await page.reload();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await page.reload();
  check(await page.getByRole('heading', { name: 'Rules', exact: true }).count() === 1, 'Refreshing a deep link must work');
  await page.screenshot({ path: 'output/playwright/rules-desktop.png' });
  check(errors.length === 0, `JavaScript errors: ${errors.join('; ')}`);
  return { passed: true, base, deepLinks: true, historyAndTripPreservation: true, contextualHOSLink: true, mobileWidths: [390, 320], durationBoundaryFixtures: 4, desktopAxeViolations: desktopAxe.violations.length, javascriptErrors: errors, mapHeight: map.height };
}
