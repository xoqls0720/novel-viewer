/* ================= AI 공통 (Claude · Gemini · Ollama · Groq) ================= */
let AnthropicSDK = null, sdkLoading = null;
function loadSDK(){ return sdkLoading ??= import(SDK_URL).then(m => (AnthropicSDK = m.default)).catch(e => { sdkLoading = null; throw e; }); }
const PROV = {
  claude: {name:'Claude', key:'apiKey', model: () => $('#model').value || DEFAULT_MODEL},
  gemini: {name:'Gemini', key:'gemKey', model: () => gemModelName()},
  ollama: {name:'Ollama', key:null, model: () => $('#olModel').value.trim() || 'gemma3:12b'},
  groq:   {name:'Groq', key:'grKey', model: () => $('#grModel').value.trim() || 'llama-3.3-70b-versatile'},
};
// 모델 이름 칸에 공백·'models/'·한글 등이 섞여도 구글이 받는 모양으로 고친다(안 되면 기본 모델)
const GEM_DEFAULT = 'gemini-3.8-flash';
function gemModelName(){
  let m = ($('#gemModel').value || '').trim().replace(/^models\//i, '').replace(/\s+/g, '-').toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(m)){ if (m && !gemModelName.warned){ gemModelName.warned = true; toast(`Gemini 모델 이름이 올바르지 않아 ${GEM_DEFAULT}로 보냈어요. 설정 탭에서 확인해 주세요`); } return GEM_DEFAULT; }
  return m;
}
const KEY_IDS = ['apiKey','gemKey','grKey','naiKey'];
function provOf(sel){ let v = sel ? $(sel)?.value : 'default'; if (!v || v === 'default') v = $('#provider').value; return PROV[v] ? v : 'claude'; }
function olBase(){ return ($('#olUrl').value.trim() || 'http://localhost:11434').replace(/\/+$/, ''); }
async function client(sel){
  const prov = provOf(sel), P = PROV[prov];
  if (P.key && !store.get(P.key, '')){ openTool('set'); toast(`설정 탭에서 ${P.name} API 키를 먼저 저장해 주세요`); return null; }
  if (prov !== 'claude') return {prov};
  if (!AnthropicSDK){
    if (!sdkLoading) toast('Claude 준비 중…');
    try{ await loadSDK(); }
    catch{ toast('Claude 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return null; }
  }
  return {prov, sdk: new AnthropicSDK({apiKey: store.get('apiKey',''), dangerouslyAllowBrowser: true})};
}
function noteUsage(model, inTok, outTok, cr = 0, cw = 0){
  $$('.aiUsage').forEach(el => el.textContent = `${model} · 입력 ${inTok.toLocaleString()}${cr?` + 캐시 읽기 ${cr.toLocaleString()}`:''}${cw?` + 캐시 저장 ${cw.toLocaleString()}`:''} / 출력 ${outTok.toLocaleString()} 토큰`);
  const sp = store.get('spent', {in:0, out:0, cache:0, n:0}); sp.in += inTok + cw; sp.cache += cr; sp.out += outTok; sp.n++; store.set('spent', sp); showSpent();
}
// 결과: {ok, note, text}. note는 화면에만 붙이고 다음 요청에는 넣지 않는다
async function stream(c, opts){
  try{
    if (c.prov === 'claude') return await streamClaude(c.sdk, opts);
    if (c.prov === 'gemini') return await streamGemini(opts);
    return await streamOpenAICompat(c.prov, opts);
  }catch(e){
    const text = e.partial || '';
    if (opts.signal?.aborted || e.name === 'AbortError' || /abort/i.test(e.message)) return {ok:false, text, note:'\n\n[멈췄어요]'};
    if (e.status === 400 && /api key|api_key|key not valid/i.test(e.detail || '')) e.status = 401;
    if (e.status === 401 || e.status === 403) return {ok:false, text, note:`\n\n[API 키가 맞지 않거나 권한이 없어요. 설정 탭에서 다시 넣어 주세요]${e.detail ? ' ' + e.detail : ''}`};
    if (e.status === 429) return {ok:false, text, note:'\n\n[요청이 많아 잠시 막혔어요. 무료 등급이면 하루·분당 한도에 걸린 거예요. 조금 뒤에 다시 하거나 다른 AI로 바꿔 보세요]'};
    if (e.status === 529 || e.status === 503 || e.status === 500) return {ok:false, text, note:'\n\n[서버가 바빠요. 조금 뒤에 다시 해 주세요]'};
    if (c.prov === 'ollama' && (e instanceof TypeError)) return {ok:false, text, note:`\n\n[Ollama에 연결하지 못했어요. 컴퓨터에서 Ollama_켜기.bat을 실행했는지, 주소(${olBase()})가 맞는지 확인해 주세요]`};
    if (c.prov === 'ollama' && e.status === 404) return {ok:false, text, note:`\n\n[Ollama에 '${PROV.ollama.model()}' 모델이 없어요. 명령 창에서 ollama pull ${PROV.ollama.model()} 을 먼저 해 주세요]`};
    return {ok:false, text, note:`\n\n[오류] ${e.status ? e.status+' ' : ''}${e.detail || e.message}`};
  }
}
async function streamClaude(sdk, {messages, system, signal, onText, format}){
  const params = {
    model: PROV.claude.model(), max_tokens: 64000, system,
    output_config: {effort: $('#effort').value || 'medium', ...(format ? {format} : {})},
    messages,
  };
  const fallback = params.model !== 'claude-haiku-5-5';
  if (fallback) params.fallbacks = 'default';   // 안전 분류기가 거절하면 서버가 다른 모델로 다시 시도
  let text = '';
  try{
    const s = sdk.messages.stream(params, {signal, headers: fallback ? {'anthropic-beta':'server-side-fallback-2026-07-01'} : {}});
    s.on('text', t => { text += t; onText?.(t); });
    const msg = await s.finalMessage();
    const u = msg.usage;
    noteUsage(msg.model, u.input_tokens, u.output_tokens, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0);
    if (msg.stop_reason === 'refusal') return {ok:false, text, note:'\n\n[모델이 이 요청을 거절했어요. 표현을 바꾸거나 수위를 낮춰 보세요]'};
    if (msg.stop_reason === 'max_tokens') return {ok:true, text, note:'\n\n[길이 제한에 걸려 잘렸어요]'};
    return {ok:true, text};
  }catch(e){ e.partial = text; throw e; }
}
// 내용 블록(Claude 형식) → 글/그림 조각
function partsOf(content){ return typeof content === 'string' ? [{type:'text', text:content}] : content.filter(b => b.type === 'text' || b.type === 'image'); }
async function httpErr(r){
  const e = new Error(r.statusText || 'HTTP ' + r.status); e.status = r.status;
  try{ const j = await r.json(); e.detail = j.error?.message || j.error || j.message || ''; if (typeof e.detail !== 'string') e.detail = JSON.stringify(e.detail); }catch{}
  return e;
}
// SSE 줄 읽기: data: {...} 마다 cb
async function readSSE(r, cb){
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;){
    const {value, done} = await rd.read(); if (done) break;
    buf += dec.decode(value, {stream:true});
    let i; while ((i = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
      try{ cb(JSON.parse(d)); }catch(err){ if (err.status) throw err; }
    }
  }
}
function schemaHint(format){ return format ? `\n\n결과는 설명이나 코드 블록 없이 아래 JSON 스키마를 따르는 JSON 객체 하나만 출력한다.\n${JSON.stringify(format.schema)}` : ''; }
function geminiSchema(s){   // Gemini responseSchema는 additionalProperties를 받지 않는다
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o = {}; for (const [k, v] of Object.entries(s)) if (k !== 'additionalProperties') o[k] = geminiSchema(v);
  return o;
}
async function streamGemini({messages, system, signal, onText, format}){
  const model = PROV.gemini.model();
  const contents = messages.map(m => ({role: m.role === 'assistant' ? 'model' : 'user', parts: partsOf(m.content).map(b => b.type === 'image' ? {inline_data:{mime_type: b.source.media_type, data: b.source.data}} : {text: b.text})}));
  const body = {
    contents,
    systemInstruction: {parts: [{text: system + (format ? '' : '')}]},
    generationConfig: {maxOutputTokens: 32768, ...(format ? {responseMimeType:'application/json', responseSchema: geminiSchema(format.schema)} : {})},
    safetySettings: ['HARM_CATEGORY_HARASSMENT','HARM_CATEGORY_HATE_SPEECH','HARM_CATEGORY_SEXUALLY_EXPLICIT','HARM_CATEGORY_DANGEROUS_CONTENT'].map(category => ({category, threshold:'BLOCK_NONE'})),
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {method:'POST', signal, headers:{'Content-Type':'application/json', 'x-goog-api-key': store.get('gemKey','')}, body: JSON.stringify(body)});
  if (!r.ok) throw await httpErr(r);
  let text = '', finish = '', block = '', usage = null;
  try{
    await readSSE(r, j => {
      if (j.promptFeedback?.blockReason) block = j.promptFeedback.blockReason;
      const cand = j.candidates?.[0];
      for (const p of cand?.content?.parts || []) if (p.text && !p.thought){ text += p.text; onText?.(p.text); }
      if (cand?.finishReason) finish = cand.finishReason;
      if (j.usageMetadata) usage = j.usageMetadata;
    });
  }catch(e){ e.partial = text; throw e; }
  if (usage) noteUsage(model, usage.promptTokenCount || 0, (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), usage.cachedContentTokenCount || 0);
  if (block || /SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(finish)) return {ok:false, text, note:`\n\n[Gemini가 이 요청을 막았어요(${block || finish}). 표현을 바꾸거나 다른 AI로 바꿔 보세요]`};
  if (finish === 'MAX_TOKENS') return {ok: !!text, text, note:'\n\n[길이 제한에 걸려 잘렸어요]'};
  return {ok:true, text};
}
// Ollama와 Groq는 OpenAI 방식 주소를 쓴다
async function streamOpenAICompat(prov, {messages, system, signal, onText, format}){
  const model = PROV[prov].model();
  const url = prov === 'ollama' ? olBase() + '/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
  const headers = {'Content-Type':'application/json'};
  if (prov === 'groq') headers.Authorization = 'Bearer ' + store.get('grKey','');
  const msgs = [{role:'system', content: system + schemaHint(format)}];
  for (const m of messages){
    const ps = partsOf(m.content);
    if (m.role === 'assistant' || ps.every(b => b.type === 'text')) msgs.push({role: m.role, content: ps.map(b => b.text).join('\n\n')});
    else msgs.push({role: m.role, content: ps.map(b => b.type === 'image' ? {type:'image_url', image_url:{url:`data:${b.source.media_type};base64,${b.source.data}`}} : {type:'text', text:b.text})});
  }
  const body = {model, messages: msgs, stream: true, ...(format ? {response_format:{type:'json_object'}} : {})};
  if (prov === 'groq') body.stream_options = {include_usage: true};
  const r = await fetch(url, {method:'POST', signal, headers, body: JSON.stringify(body)});
  if (!r.ok) throw await httpErr(r);
  let text = '', raw = '', finish = '', usage = null;
  try{
    await readSSE(r, j => {
      if (j.error) { const e = new Error(j.error.message || 'error'); e.status = 500; e.detail = j.error.message; throw e; }
      const ch = j.choices?.[0];
      const t = ch?.delta?.content || '';
      // qwen3·deepseek 같은 모델의 <think> 부분은 화면에 내지 않는다(조각이 중간에 끊겨도 맞게)
      if (t){
        raw += t;
        let vis = raw.replace(/<think>[\s\S]*?(<\/think>\s*|$)/g, '');
        const lt = vis.lastIndexOf('<'); if (lt >= 0 && '<think>'.startsWith(vis.slice(lt))) vis = vis.slice(0, lt);
        if (vis.length > text.length && vis.startsWith(text)){ const add = vis.slice(text.length); text = vis; onText?.(add); }
      }
      if (ch?.finish_reason) finish = ch.finish_reason;
      if (j.usage) usage = j.usage; else if (j.x_groq?.usage) usage = j.x_groq.usage;
    });
  }catch(e){ e.partial = text; throw e; }
  if (usage) noteUsage(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
  else { const sp = store.get('spent', {in:0,out:0,cache:0,n:0}); sp.n++; store.set('spent', sp); showSpent(); $$('.aiUsage').forEach(el => el.textContent = `${model} (${PROV[prov].name})`); }
  if (finish === 'content_filter') return {ok:false, text, note:'\n\n[모델이 이 요청을 막았어요. 표현을 바꾸거나 다른 AI로 바꿔 보세요]'};
  if (finish === 'length') return {ok: !!text, text, note:'\n\n[길이 제한에 걸려 잘렸어요]'};
  return {ok:true, text};
}
// 코드 블록으로 감싼 JSON도 읽는다
function parseJSON(t){ const s = t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); try{ return JSON.parse(s); }catch{ const a = s.indexOf('{'), b = s.lastIndexOf('}'); return JSON.parse(s.slice(a, b + 1)); } }
function showSpent(){ const s = store.get('spent', {in:0,out:0,cache:0,n:0}); $('#spent').textContent = `${s.n}번 · 입력 ${s.in.toLocaleString()} · 캐시 읽기 ${s.cache.toLocaleString()} · 출력 ${s.out.toLocaleString()} 토큰`; }

// 대화 상자: 성공한 질문·답만 다음 요청에 넣는다(실패·중단한 턴은 화면에만 남김)
function makeChat(boxSel, sendBtnSel, systemFn, provSel){
  const ch = {
    turns: [], ctxKey: null, abort: null,
    reset(){ this.abort?.abort(); this.turns = []; this.ctxKey = null; this.render(); },
    render(){
      const box = $(boxSel); box.innerHTML = '';
      for (const t of this.turns){
        const q = document.createElement('div'); q.className = 'msg user' + (t.status==='failed'?' failed':''); q.textContent = t.display;
        const a = document.createElement('div'); a.className = 'msg ai' + (t.status==='failed'?' failed':''); a.textContent = t.a + (t.note || '');
        t.el = a; box.append(q, a);
      }
      $$(sendBtnSel).forEach(b => b.disabled = !!this.abort);
    },
    last(){ return [...this.turns].reverse().find(t => t.status === 'ok')?.a || ''; },
    async ask({question, display, ctx = null, extraSystem = ''}){
      if (this.abort) return toast('답을 받는 중이에요. 멈추기를 누르거나 끝날 때까지 기다려 주세요.');
      const c = await client(provSel); if (!c) return;
      if (ctx && this.ctxKey && (this.ctxKey !== ctx.key || ctx.fresh) && !ctx.followup) this.reset();
      if (ctx?.followup && this.turns.some(t => t.status === 'ok')) ctx = null;   // 이어 묻기: 앞 대화를 그대로 이어 간다
      const okTurns = this.turns.filter(t => t.status === 'ok');
      const first = okTurns.length === 0;
      const q = [];
      if (first && ctx) q.push(...ctx.blocks);
      q.push({type:'text', text: question});
      const turn = {q, display: display || question, a: '', status: 'pending', ctxKey: first && ctx ? ctx.key : null};
      this.turns.push(turn);
      const messages = [];
      for (const t of okTurns) messages.push({role:'user', content:t.q}, {role:'assistant', content:t.a});
      messages.push({role:'user', content:q});
      this.abort = new AbortController(); this.render(); const pane = $(boxSel).closest('.pane'); pane?.classList.add('busy');
      const res = await stream(c, {messages, system: systemFn() + (extraSystem ? '\n\n' + extraSystem : ''), signal: this.abort.signal, onText: x => { turn.a += x; turn.el.textContent = turn.a; }});
      this.abort = null; pane?.classList.remove('busy');
      if (res.ok && turn.a.trim()){ turn.status = 'ok'; if (turn.ctxKey) this.ctxKey = turn.ctxKey; if (res.note) turn.note = res.note; }
      else { turn.status = 'failed'; turn.note = res.note || '\n\n[답을 받지 못했어요]'; }
      this.render(); $(boxSel).lastElementChild?.scrollIntoView({block:'nearest'});
    }
  };
  return ch;
}

