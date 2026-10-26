const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  const seen = {gemini:[], groq:[], ollama:[]};
  const NAI = JSON.stringify({base_prompt:'2boys, ruined cathedral', characters:[{name:'라파엘', prompt:'1boy, silver hair', negative:'', position:'C3'}], negative:'lowres', size:'832x1216', notes:'메모'});
  await p.route('https://generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); seen.gemini.push({url:r.request().url(), key:r.request().headers()['x-goog-api-key'], body});
    const t = body.generationConfig.responseSchema ? '```json\n'+NAI+'\n```' : '제미나이 답';
    const half = Math.floor(t.length/2);
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body:
      `data: ${JSON.stringify({candidates:[{content:{parts:[{text:t.slice(0,half)}],role:'model'}}]})}\r\n\r\ndata: ${JSON.stringify({candidates:[{content:{parts:[{text:t.slice(half)}],role:'model'},finishReason:'STOP'}],usageMetadata:{promptTokenCount:11,candidatesTokenCount:7}})}\r\n\r\n`});
  });
  const oai = (who) => async r => {
    const body = JSON.parse(r.request().postData()); seen[who].push({auth:r.request().headers()['authorization'], body});
    const t = body.response_format ? NAI : (who==='ollama' ? '<think>생각</think>올라마 답' : '그록 답');
    const chunks = [t.slice(0,5), t.slice(5)];
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body:
      chunks.map(c => `data: ${JSON.stringify({choices:[{delta:{content:c}}]})}\n\n`).join('') + `data: ${JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})}\n\n` + (who==='groq' ? `data: ${JSON.stringify({choices:[],usage:{prompt_tokens:9,completion_tokens:4}})}\n\n` : '') + 'data: [DONE]\n\n'});
  };
  await p.route('https://api.groq.com/**', oai('groq'));
  await p.route('http://localhost:11434/v1/**', oai('ollama'));
  await p.route('http://localhost:11434/api/tags', r => r.fulfill({status:200, headers:{'content-type':'application/json','access-control-allow-origin':'*'}, body: JSON.stringify({models:[{name:'qwen3:14b'},{name:'gemma3:12b'}]})}));
  await p.goto(APP); await p.waitForTimeout(1200);
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await p.waitForTimeout(800);
  console.log('placeholder hue:', await p.$$eval('.card .ph', e => e.slice(0,3).map(x => x.style.getPropertyValue('--h'))));
  await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(800);
  console.log('coach shown:', !(await p.$eval('#coach', c => c.hidden))); await p.click('#coachOk');
  console.log('mini:', await p.textContent('#mini'), '| app classes:', await p.$eval('#app', a => a.className));
  // 책갈피
  await p.$eval('#reader', r => r.scrollTop = 1500); await p.waitForTimeout(300);
  await p.keyboard.press('b'); await p.waitForTimeout(200); console.log('bm on:', await p.$eval('#btnBm', b => b.classList.contains('on')));
  // 쪽 넘김 번호
  await p.click('#btnQuick'); await p.selectOption('#mode', 'paged'); await p.waitForTimeout(700);
  await p.keyboard.press('Escape');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); console.log('paged ind:', await p.textContent('#pageInd'));
  // 설정 슬라이더·기본값
  await p.click('#btnQuick'); await p.$eval('#weight', el => { el.value = 550; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  console.log('weight out/var:', await p.textContent('#weightOut'), await p.$eval('html', h => h.style.getPropertyValue('--fw')));
  await p.click('#qReset'); await p.waitForTimeout(500); console.log('after reset weight:', await p.$eval('#weight', e => e.value), 'mode stays:', await p.$eval('#mode', e => e.value));
  await p.click('#qClose');
  // AI 키
  await p.click('#tgTool'); await p.click('.tabs button[data-tab=set]');
  await p.fill('#gemKey', 'AIza-test'); await p.click('[data-ksave=gemKey]');
  await p.fill('#grKey', 'gsk_test'); await p.click('[data-ksave=grKey]');
  await p.click('#olTest'); await p.waitForTimeout(400);
  console.log('status:', await p.textContent('#st-claude'), '/', await p.textContent('#st-gemini'), '/', await p.textContent('#st-groq'), '/', await p.textContent('#st-ollama'), '| olModel:', await p.$eval('#olModel', e => e.value));
  await p.selectOption('#provider', 'gemini');
  // 분석 탭: 기본(Gemini)
  await p.click('.tabs button[data-tab=ai]'); await p.waitForTimeout(100);
  console.log('ai hint:', await p.textContent('#pane-ai .keyHint'));
  await p.selectOption('#mode', 'auto').catch(()=>{});
  await p.click('button[data-ai=cut]'); await p.waitForTimeout(1200);
  console.log('gemini chat:', await p.$$eval('#chat .msg.ai', e => e.map(x => x.textContent)));
  const g = seen.gemini[0]; console.log('gemini req:', g?.url.split('models/')[1], g?.key, g?.body.contents.map(c => c.role+':'+c.parts.length).join(','), 'sys', !!g?.body.systemInstruction, 'safety', g?.body.safetySettings?.length);
  await p.fill('#aiQ', '이어서'); await p.click('#aiAsk'); await p.waitForTimeout(1000);
  console.log('gemini follow-up roles:', seen.gemini[1]?.body.contents.map(c => c.role).join(','));
  // Groq로 바꿔 묻기
  await p.selectOption('#aiProv', 'groq'); await p.fill('#aiQ', '그록에게'); await p.click('#aiAsk'); await p.waitForTimeout(1000);
  console.log('groq:', await p.$$eval('#chat .msg.ai', e => e.at(-1).textContent), seen.groq[0]?.auth, seen.groq[0]?.body.model, seen.groq[0]?.body.messages.map(m => m.role).join(','));
  console.log('usage:', await p.textContent('.aiUsage'));
  // 글쓰기: Ollama
  await p.click('.tabs button[data-tab=write]'); await p.selectOption('#wProv', 'ollama'); await p.fill('#wIn', '주인공이 성당에서 칼을 뽑는다'); await p.click('#wGo'); await p.waitForTimeout(1000);
  console.log('ollama write:', await p.$$eval('#wChat .msg.ai', e => e.at(-1)?.textContent), seen.ollama[0]?.body.model);
  // 노벨AI: Gemini 구조화 출력
  await p.click('.tabs button[data-tab=nai]'); await p.fill('#naiIn', '무너진 성당, 은발 기사'); await p.click('#naiGo'); await p.waitForTimeout(1200);
  const gn = seen.gemini.at(-1); console.log('nai gemini schema has additionalProperties:', JSON.stringify(gn.body.generationConfig.responseSchema).includes('additionalProperties'), '| out fields:', await p.$$eval('#naiOut .field', e => e.length));
  await p.selectOption('#naiProv', 'groq'); await p.click('#naiGo'); await p.waitForTimeout(1000);
  console.log('nai groq fields:', await p.$$eval('#naiOut .field', e => e.length), 'rf:', JSON.stringify(seen.groq.at(-1).body.response_format));
  await p.click('#naiSketch'); await p.waitForTimeout(300); console.log('nai sketch:', await p.isVisible('#sketch'), await p.$eval('#skCanvas', c => c.width+'x'+c.height));
  await p.click('#skX'); console.log('skX closed:', !(await p.isVisible('#sketch')));
  // 메모 탭 책갈피
  await p.click('.tabs button[data-tab=notes]'); await p.waitForTimeout(300); console.log('bm list:', await p.$$eval('#bmList .item', e => e.length));
  // 키가 백업·동기화에서 빠지는지
  console.log('backup has keys:', await p.evaluate(() => { const d = {}; for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if (k.startsWith('nv.') && !/^nv\.(apiKey|gemKey|grKey)$/.test(k)) d[k]=1; } return Object.keys(d).filter(k => /Key/.test(k)); }));
  // 휴대폰 크기
  await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(400); await p.screenshot({path: path.join(OUT, 'v5_phone_set.png')});
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
