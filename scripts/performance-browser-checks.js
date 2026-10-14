async (page) => {
  // An ignored generated copy may substitute the labelled synthetic/captured plan.
  const capturedPlan = null;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const base = page.url().startsWith('http://127.0.0.1:8000') ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:5173';
  const errors = [], report = { fixture: !!capturedPlan, loading: [], animation: [] };
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/api/plan');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const size of [{width:390,height:844},{width:320,height:667},{width:1365,height:679}]) {
    await page.setViewportSize(size);
    await page.goto(base);
    await page.route('**/api/plan', async request => {
      await new Promise(resolve => setTimeout(resolve, 4500));
      if (capturedPlan) await request.fulfill({json:capturedPlan}); else await request.continue();
    });
    await page.getByRole('button',{name:'Compare routes',exact:true}).click();
    await page.getByRole('progressbar').waitFor();
    const rotation = await page.locator('.spinner').evaluate(el=>getComputedStyle(el).transform);
    await page.waitForFunction(previous=>getComputedStyle(document.querySelector('.spinner')).transform!==previous,rotation);
    await page.getByText(/2s elapsed/).waitFor();
    const visible = await page.locator('.planning-actions').evaluate(el=>{
      const rect=el.getBoundingClientRect(), panel=document.querySelector('.sidebar-body').getBoundingClientRect();
      const cancel=el.querySelector('.cancel-button').getBoundingClientRect();
      const track=el.querySelector('.planning-progress-track').getBoundingClientRect();
      return {top:rect.top,bottom:rect.bottom,panelTop:panel.top,panelBottom:panel.bottom,cancelBottom:cancel.bottom,trackTop:track.top,viewport:innerHeight};
    });
    check(visible.trackTop>=visible.panelTop && visible.cancelBottom<=visible.panelBottom+1,'Loading and Cancel must be visible inside the panel');
    check(visible.cancelBottom<=size.height,'Cancel must stay within the viewport');
    report.loading.push({size,...visible});
    await page.screenshot({path:`output/playwright/loading-${size.width}.png`});
    await page.locator('.route-option').first().waitFor({state:'attached',timeout:95000});
    await page.unroute('**/api/plan');
    await page.waitForFunction(()=>document.querySelector('.weather-field')?.dataset.hour==='0');
    await page.evaluate(()=>window.__weatherCanvas=document.querySelector('.weather-field'));
    if(size.width<760) await page.getByRole('button',{name:'Show weather',exact:true}).click();
    else await page.getByRole('button',{name:'Weather',exact:true}).click();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    try {
      await page.evaluate(()=>{
        window.__longTasks=[];
        window.__observer=new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration)));
        window.__observer.observe({type:'longtask',buffered:false});
      });
      const slider=page.getByRole('slider',{name:'Forecast hour after departure'});
      await slider.focus();
      const updates=[];
      for(let i=1;i<=8;i++) {
        const started=Date.now(); await slider.press('ArrowRight');
        await page.waitForFunction(hour=>Number(document.querySelector('.weather-field')?.dataset.hour)===hour,i/10);
        updates.push(Date.now()-started);
      }
      check(await page.evaluate(()=>document.querySelector('.weather-field')===window.__weatherCanvas),'Time updates must reuse the weather canvas');
      const metrics=await page.evaluate(()=>({longTasks:window.__longTasks,workerMs:Number(document.querySelector('.weather-field').dataset.renderMs),error:document.querySelector('.weather-field').dataset.error}));
      check(!metrics.error,'The weather worker must render without errors');
      report.animation.push({size,cpuThrottle:4,sliderRoundTripMs:updates,...metrics});
      await page.evaluate(()=>window.__observer.disconnect());
    } finally {await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();}
  }
  // Exercise arrival-time simulation with an explicit synthetic 12-hour drive when supplied.
  if(capturedPlan?.routes[0].stops?.length) {
    const route=capturedPlan.routes.find(r=>r.id===capturedPlan.recommended_id) ?? capturedPlan.routes[0];
    await page.getByRole('button',{name:'Simulate drive',exact:true}).click();
    await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
    const slider=page.getByRole('slider',{name:'Simulated driving time'});
    const stop=route.stops[0], during=Math.round((stop.start_elapsed_s+stop.end_elapsed_s)/2);
    await slider.evaluate((el,value)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    },during);
    await page.locator('.simulation-stop').waitFor();
    const coordinate=await page.locator('.driver-marker').getAttribute('data-coordinate');
    await slider.press('ArrowRight');
    check(await page.locator('.driver-marker').getAttribute('data-coordinate')===coordinate,'Driver must stay still during a break');
    await slider.press('End');
    check(await page.locator('.driver-marker').getAttribute('data-coordinate')===route.geometry.coordinates.at(-1).join(','),'Arrival after stops must reach the destination');
    check(await page.getByRole('button',{name:'Replay simulation',exact:true}).count()===1,'Arrival should stop playback');
    report.stops={total:route.total_duration_s,driving:route.duration_s,stops:route.stops.length,holdsDuringBreak:true};
    report.playbackFrames=[];
    const cdp=await page.context().newCDPSession(page);
    try {
      for(const size of [{width:390,height:844},{width:1365,height:679}]) for(const rate of [1,4]) {
        await page.setViewportSize(size);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate});
        await page.getByRole('button',{name:'Reset simulation',exact:true}).click();
        await page.getByRole('button',{name:'Play simulation',exact:true}).click();
        const frames=await page.evaluate(()=>new Promise(resolve=>{
          const intervals=[];let previous=performance.now();const start=previous;
          function tick(now){intervals.push(now-previous);previous=now;if(now-start<2000)requestAnimationFrame(tick);else{const sorted=[...intervals].sort((a,b)=>a-b);resolve({samples:intervals.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...intervals)});}}
          requestAnimationFrame(tick);
        }));
        report.playbackFrames.push({size,cpuThrottle:rate,...frames});
        await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
      }
    } finally {await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();}
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Edit trip',exact:true}).click();
  // Leave this request pending until the user cancels; do not handle it twice after abort.
  await page.route('**/api/plan',()=>{});
  await page.getByRole('button',{name:'Compare routes',exact:true}).click();
  await page.getByRole('progressbar').waitFor();
  check(await page.locator('.spinner').evaluate(el=>getComputedStyle(el).animationName==='none'),'Respect reduced motion');
  await page.getByText(/1s elapsed/).waitFor();
  await page.getByRole('button',{name:'Cancel planning',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Planning cancelled'}).waitFor();
  await page.unroute('**/api/plan');
  await page.emulateMedia({reducedMotion:'no-preference'});
  check(errors.length===0,JSON.stringify(errors));
  return report;
}
