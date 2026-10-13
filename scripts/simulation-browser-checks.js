async (page) => {
  // Real provider geometry first; temporal storm below is an explicitly injected UI fixture.
  const check = (value, message) => { if (!value) throw new Error(message); };
  const base = page.url().startsWith('http://127.0.0.1:8000') ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:5173';
  const errors = [];
  await page.unroute('**/api/plan');
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1365, height: 679 });
  await page.goto(base);
  const response = page.waitForResponse(res => res.url().endsWith('/api/plan') && res.status() === 200, { timeout: 95000 });
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  const baseline = await (await response).json();
  await page.locator('.route-option').first().waitFor();
  const route = baseline.routes.find(route => route.id === baseline.recommended_id) || baseline.routes[0];
  check(route.geometry_elapsed_s.length === route.geometry.coordinates.length, 'Live geometry needs matching segment timing');
  check(route.geometry_elapsed_s.at(-1) === route.duration_s, 'Timing must reach exact route duration');
  for (const selector of ['.route-option.selected', '.sidebar-views button[aria-pressed="true"]']) {
    check(await page.locator(selector).evaluate(el => getComputedStyle(el).boxShadow === 'none'), 'Selected controls must have no inset stripe/underline');
  }
  let requests = 0;
  const count = request => { if (request.url().includes('/api/')) requests++; };
  page.on('request', count);
  await page.getByRole('button', { name: 'Simulate drive', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Simulated driving time"]').value) > 300);
  const movingPosition = await page.locator('.driver-marker').getAttribute('data-coordinate');
  check(movingPosition !== route.geometry.coordinates[0].join(','), 'Driver marker must move');
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Simulated driving time' });
  const paused = await slider.inputValue();
  await page.screenshot({ path: 'output/playwright/simulation-desktop.png' });
  check(await slider.inputValue() === paused, 'Pause must hold elapsed time');
  const track = await slider.boundingBox();
  await slider.click({ position: { x: track.width * 0.5, y: track.height / 2 } });
  check(Number(await slider.inputValue()) > route.duration_s * 0.35, 'Seek must move into the route');
  check(await page.getByRole('button', { name: 'Play simulation', exact: true }).count() === 1, 'Seek pauses playback');
  await slider.focus(); await slider.press('End');
  await page.waitForFunction(() => {
    const marker = document.querySelector('.driver-marker').getBoundingClientRect();
    const destination = [...document.querySelectorAll('.endpoint')].at(-1).getBoundingClientRect();
    return Math.hypot(marker.x + marker.width / 2 - destination.x - destination.width / 2, marker.y + marker.height / 2 - destination.y - destination.height / 2) < 3;
  });
  check(await page.locator('.driver-marker').getAttribute('data-coordinate') === route.geometry.coordinates.at(-1).join(','), 'End must place the marker at the actual destination');
  check(await page.getByRole('button', { name: 'Replay simulation', exact: true }).count() === 1, 'Destination must offer replay');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  check(await slider.inputValue() === '0', 'Reset must restore departure');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.getByRole('button', { name: /^2 Route 2/ }).click();
  check(await slider.inputValue() === '0', 'Changing route resets its position');
  check(await page.getByRole('button', { name: 'Play simulation', exact: true }).count() === 1, 'Route changes pause playback');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await page.getByRole('link', { name: 'Back to planner', exact: true }).first().click();
  check(await page.getByRole('button', { name: 'Play simulation', exact: true }).count() === 1, 'Leaving the planner pauses playback');
  await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
  await page.goBack();
  await page.getByRole('heading', { name: 'Rules', exact: true }).waitFor();
  await page.goForward();
  check(await page.getByRole('button', { name: 'Play simulation', exact: true }).count() === 1, 'Browser history must not resume playback');
  check(requests === 0, `Playback/seek/navigation must not fetch: ${requests}`);
  page.off('request', count);
  await page.getByRole('button', { name: 'Close simulation', exact: true }).click();

  // Moving the drawer must not trigger map/forecast resizing on every pointer event.
  await page.getByRole('button', { name: /^Checkpoints \(/ }).click();
  const desktopGrip = page.getByRole('separator', { name: 'Resize checkpoints', exact: true });
  await desktopGrip.focus(); await desktopGrip.press('ArrowUp');
  const frozenMap = await page.locator('.map').boundingBox();
  const oldDrawer = await page.locator('#checkpoint-details').boundingBox();
  const dragHandle = await desktopGrip.boundingBox();
  await page.mouse.move(dragHandle.x + dragHandle.width / 2, dragHandle.y + dragHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragHandle.x + dragHandle.width / 2, dragHandle.y + dragHandle.height / 2 - 60, { steps: 12 });
  await page.waitForFunction(height => document.querySelector('#checkpoint-details').getBoundingClientRect().height > height + 45, oldDrawer.height);
  const duringDrag = await page.locator('.map').boundingBox();
  check(Math.abs(duringDrag.height - frozenMap.height) < 1, 'Map must stay fixed while the drawer follows the pointer');
  await page.mouse.up();
  await page.waitForFunction(height => document.querySelector('.map').getBoundingClientRect().height < height - 45, frozenMap.height);
  await page.getByRole('button', { name: 'Hide checkpoints', exact: true }).click();

  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 667 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), `Viewport overflow at ${JSON.stringify(size)}`);
    if (size.width < 761) {
      await page.getByRole('button', { name: 'Show weather', exact: true }).click();
      check(await page.getByRole('slider', { name: 'Forecast hour after departure' }).isVisible(), 'Weather must be reachable on mobile');
      await page.getByRole('button', { name: 'Show weather', exact: true }).click();
    }
    await page.getByRole('button', { name: /^Checkpoints \(/ }).click();
    const grip = page.getByRole('separator', { name: 'Resize checkpoints', exact: true });
    await grip.focus(); await grip.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('#checkpoint-details').getBoundingClientRect().height >= 180);
    check(await page.evaluate(() => document.querySelector('#checkpoint-details').getBoundingClientRect().bottom <= innerHeight + 1), 'Drawer must stay in the viewport');
    await page.addScriptTag({ url: 'http://127.0.0.1:5173/node_modules/axe-core/axe.min.js' });
    const axe = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    check(axe.violations.length === 0, JSON.stringify(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
    if (size.width === 390) await page.screenshot({ path: 'output/playwright/checkpoints-mobile.png' });
    const grab = await grip.boundingBox();
    const x = grab.x + grab.width / 2, y = grab.y + grab.height / 2, target = Math.min(size.height - 4, y + 450);
    if (size.width === 390) {
      const touch = await page.context().newCDPSession(page);
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 10; step++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (target - y) * step / 10 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await touch.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, target, { steps: 10 }); await page.mouse.up();
    }
    await page.waitForFunction(() => document.querySelector('#checkpoint-details').getAttribute('aria-hidden') === 'true');
    await page.getByRole('button', { name: 'Simulate drive', exact: true }).click();
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
    const previewMap = await page.locator('.map').boundingBox();
    check(previewMap.height >= 100, 'Simulation must leave a usable map');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), 'Simulation cannot overflow the viewport');
    const previewAxe = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    check(previewAxe.violations.length === 0, JSON.stringify(previewAxe.violations.map(v => v.id)));
    if (size.width === 390) await page.screenshot({ path: 'output/playwright/simulation-mobile.png' });
    await page.getByRole('button', { name: 'Close simulation', exact: true }).click();
  }
  await page.setViewportSize({ width: 1365, height: 679 });
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  const data = structuredClone(baseline);
  const level = wind => wind >= 45 ? 4 : wind >= 35 ? 2 : wind >= 25 ? 1 : 0;
  data.recommended_id = null;
  data.recommendation_reason = 'Injected temporal storm fixture; not live severe weather.';
  for (const cell of data.corridor) for (const [hour, weather] of cell.hours.entries()) Object.assign(weather, { wind_mph: 10 + hour * 10, rain_in: 0, snow_in: 0, level: level(10 + hour * 10) });
  for (const route of data.routes) {
    route.summary.eligible = false;
    for (const checkpoint of route.checkpoints) {
      checkpoint.weather.wind_mph = 10 + checkpoint.elapsed_s / 3600 * 10;
      checkpoint.weather.rain_in = checkpoint.weather.snow_in = 0;
      checkpoint.risk = { level: level(checkpoint.weather.wind_mph), label: ['Low','Moderate','High','Severe','No Travel'][level(checkpoint.weather.wind_mph)], reasons: ['Injected temporal storm.'] };
    }
    const labels = ['Low','Moderate','High','Severe','No Travel'];
    route.summary.risk_miles = Object.fromEntries(labels.map(label => [label, 0]));
    for (let index = 0; index < route.checkpoints.length - 1; index++) {
      const left = route.checkpoints[index], right = route.checkpoints[index + 1];
      const risk = Math.max(left.risk.level, right.risk.level);
      route.summary.risk_miles[labels[risk]] += right.mile - left.mile;
      route.segments[index].level = risk;
    }
    route.summary.max_risk = Math.max(...route.checkpoints.map(point => point.risk.level));
    route.summary.average_risk = labels.reduce((sum, label, index) => sum + index * route.summary.risk_miles[label], 0) / route.distance_miles;
  }
  await page.route('**/api/plan', request => request.fulfill({ status: 200, json: data }));
  await page.getByRole('button', { name: 'Compare routes', exact: true }).click();
  await page.getByText('Injected temporal storm fixture; not live severe weather.', { exact: true }).waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Simulate drive', exact: true }).click();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  const canvasChecksum = () => page.locator('.weather-field').evaluate(canvas => {
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return bytes.reduce((sum, value) => (sum + value) % 1000000007, 0);
  });
  const departureColors = await canvasChecksum();
  await page.getByRole('slider', { name: 'Simulated driving time' }).focus();
  await page.keyboard.press('End');
  check(await canvasChecksum() !== departureColors, 'Weather canvas must respond to simulated time');
  check(await page.locator('.simulation-conditions .risk-badge').innerText() === 'No Travel', 'Driver condition estimate must respond to time');
  check(await page.locator('.simulation-excluded').count() === 1, 'Preview must preserve the excluded-route warning');
  await page.waitForFunction(() => {
    const marker = document.querySelector('.driver-marker').getBoundingClientRect();
    const destination = [...document.querySelectorAll('.endpoint')].at(-1).getBoundingClientRect();
    return Math.hypot(marker.x + marker.width / 2 - destination.x - destination.width / 2, marker.y + marker.height / 2 - destination.y - destination.height / 2) < 3;
  });
  await page.screenshot({ path: 'output/playwright/simulation-storm-injected.png' });
  await page.unroute('**/api/plan');
  await page.getByRole('button', { name: 'Close simulation', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('#checkpoint-details').evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(value => parseFloat(value) === 0)), 'Reduced motion must remove drawer transitions');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check(errors.length === 0, `Page errors: ${errors.join('; ')}`);
  await page.reload();
  return { passed: true, base, liveTimingVertices: route.geometry_elapsed_s.length, simulationAPICalls: requests, drawerMapFixedDuringDrag: true, mobileSizes: ['390×844','320×667','844×390'], injectedTemporalStorm: true, javascriptErrors: errors };
}
