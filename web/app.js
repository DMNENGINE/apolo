// APOLO landing: idioma, copiar, revelado, demos animadas (manos, ojo). Sin dependencias.
(() => {
  const d = document, $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  d.documentElement.classList.add('js');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- i18n ----------------
  const EN = {
    _title: 'APOLO · Your AI agent, on your PC, with any model you want',
    _desc: 'APOLO is an open-source (MIT) AI agent for Windows with a 3D robot on your desktop: skills with an antivirus, a model council, a night shift, approvals from your phone and a $25 physical eye. Works with Claude, ChatGPT, Gemini or Ollama locally.',
    skip: 'Skip to content', nav1: 'Features', nav2: 'Security', nav3: 'Comparison', nav4: 'Models', nav5: 'FAQ',
    eyebrow: 'Open source · MIT · v0.2.0 beta',
    h1: 'Your agent. <span class="nw">On your PC.</span> <em>With any model you want.</em>',
    lead: 'APOLO is a 3D robot that lives on your desktop and runs your AI agents: Claude Code, ChatGPT, Gemini or Ollama locally. It installs skills through an antivirus, works while you sleep and asks before anything risky.',
    dl: 'Download for Windows', gh: 'View on GitHub', ps: 'or with PowerShell', copy: 'Copy', copyl: 'Copy command', copied: 'Copied',
    fine: 'Windows 10/11 · per-user install, no admin · the installer isn’t code-signed yet: in SmartScreen click “More info → Run anyway”.',
    botl: 'The APOLO robot: a 3D helmet with a green visor that follows you with its eyes',
    allow: 'Allow', always: 'Always', deny: 'Deny', permnote: 'Try it: this is how it asks you.', works: 'Works with',
    k0: 'The island', t0: 'Everything your agents do, at the top of your screen.',
    p0: 'Live sessions, subagents, files being written, plan usage and context per session. When something is risky the helmet turns amber and asks. Allow, Always or Deny: from the island, Stream Deck, Discord, Telegram, WhatsApp, your phone or the eye.',
    l0a: 'Use the plan you already pay for: Claude Code and Codex through their own CLIs, no API key.', l0b: 'Usage is shown as % of your plan, never dollars.', l0c: 'Dangerous actions always need a second confirmation.',
    a0: 'The APOLO floating island: the helmet with an amber alert and a Bash card with Allow, Always and Deny', c0: 'Real screenshot of the island.',
    k1: 'Universal skills + antivirus', t1: 'Any skill, with any model. Scanned before it touches anything.',
    p1: 'Install <code>SKILL.md</code> skills from Claude Code, Codex, Cursor or <code>AGENTS.md</code> from a folder, a .zip or GitHub. Every new skill starts <b>disabled and quarantined</b>: a static scanner and a model-based one look for prompt injection, credential theft, <code>curl | sh</code>, obfuscation and persistence, and explain it in plain words.',
    v1: 'Clean', v2: 'Review', v3: 'Quarantine', p1b: 'ed25519 signatures for skills and plugins, a marketplace in the panel and a workshop that turns a conversation into a skill.',
    a1: 'Scanner report: a quarantined skill with curl-pipe-shell, SSH key reading and exfiltration findings', c1: 'Real screenshot: a booby-trapped skill, caught.',
    k2: 'Model council', t2: 'Not sure? Let them argue.',
    p2: 'Ask several models the same question, say a local one, Claude and ChatGPT. They answer in parallel, read each other, correct themselves, and a moderator gives you a verdict with the level of agreement. Live, in Mission Control.',
    l2a: 'A member that fails is never silently swapped for another.', l2b: 'Configurable debate rounds (0, 1 or 2).',
    a2: 'Council with gemma4 and qwen3.6 debating PLA vs PETG and a verdict with 100% agreement', c2: 'Real screenshot: gemma4 + qwen3.6, 100% agreement in 1 min 37 s.',
    k3: 'Night shift', t3: 'Queue jobs before bed. Get the report at breakfast.',
    p3: 'Each job runs in its own <b>git worktree and branch</b>, and it never pushes. Risky stuff doesn’t wake you up: it’s denied and logged. In the morning you get what was done, what’s pending, what needs your call, and a ~60 s vertical video of the night.',
    a3: 'Night shift queue with one job done, another waiting for permission, and the morning report', c3: 'Real screenshot (local paths blurred).',
    k4: 'APOLO Wrapped', t4: 'Your week with your agent, in cards worth sharing.',
    p4: 'Agent hours, streaks, favourite model, what you did most and the time it saved you. Weekly or monthly, export as PNG or video. Private by default: it never includes your message text.',
    a4a: 'APOLO Wrapped cover', a4b: 'Card: hours worked and hours saved', a4c: 'Card: 7-day streak', a4d: 'Card: night owl, your peak hour',
    k5: 'Hands + panic', t5: 'It uses your mouse and keyboard. Touch them and it stops.',
    p5: 'With per-task consent, APOLO sees the screen and drives the mouse and keyboard, with a red border while it’s in control. It verifies every action, keeps a timeline of what it did and learns macros by watching you. Move the mouse and it lets go instantly.',
    p5k: 'one panic button: stops everything, everywhere.', p5b: 'Banking, wallet and password-manager windows are off-limits to screen and browser control.',
    hw: 'groceries.txt · Notepad', hm1: 'File', hm2: 'Edit', hm3: 'View', hb: 'APOLO is in control', hp1: 'Control returned', hp2: 'You moved the mouse: APOLO stopped.', recre: 'Animated recreation',
    k6: 'Phone + remote desktop', t6: 'Approve things from the couch. Or drive your PC from there.',
    p6: 'A web app (PWA) you pair with a QR code. Each device gets its own scoped token; dangerous actions need a PIN or passkey. Remote desktop is off by default and approved from the PC.',
    a6a: 'Phone: dangerous action warning for rm -rf with a Confirm with my PIN button', a6b: 'Phone: PIN keypad', a6c: 'Phone: remote desktop of the PC with special keys',
    c6a: 'Dangerous action', c6b: 'PIN to confirm', c6c: 'Remote desktop',
    k7: 'The $25 eye', t7: 'It has a body: a desk eye you print yourself.',
    p7: 'An ESP32-S3 and a round GC9A01 display. It shows the robot’s mood, approves with a tap and denies with a long press. Firmware, wiring guide and simulator included; the printable case is on its way.',
    s7a: 'parts list', s7b: 'states and gestures', s7c: 'to approve', eyel: 'Round display of the eye showing its gestures', c7: 'Real frames from the simulator (= firmware)',
    k8: 'Streaming co-host', t8: 'It can even co-host your streams.',
    p8: 'Reads your Twitch and YouTube chat, filters it, reacts in an OBS overlay with the 3D robot, runs polls, celebrates raids and talks back. With its panic button, of course.',
    a8: 'OBS overlay: a poll, a raid alert and the robot answering a chat message', c8: 'Real screenshot of the overlay (test background).',
    k9: 'Gamer Mode', t9: 'No placebo. Measured with PresentMon.',
    p9: 'Only real, reversible optimizations: power plan, Game Mode, pausing background hogs and priority for the game. Everything is undone when you exit, even if APOLO crashes halfway. No “RAM cleaners”, no turning off Defender.',
    l9a: 'FPS, 1% low, 0.1% low and frametimes with PresentMon, Intel’s open-source tool.', l9b: 'Before/after benchmark in the same game, with a card to share.',
    l9c: 'Checks what actually matters: a 144 Hz monitor running at 60, HAGS, startup apps. And warns about thermal throttling.',
    p9h: 'We don’t promise FPS: we show you the before and after, with data.',
    a9: 'Gamer Mode panel: monitor review, HAGS, Game Mode, startup apps and PresentMon 2.6.0 measurement', c9: 'Real screenshot of the panel (review of a real PC).',
    k10: 'Meetings', t10: 'It listens to the meeting. You get the tasks.',
    p10: 'Reads Google Meet, Teams or Zoom captions in the browser, or records local audio (mic + system). When it ends: transcript, summary, decisions, open questions and dated tasks, saved to its memory.',
    a10: 'Meeting detail with summary, decisions, tasks and a per-speaker transcript', c10: 'Real screenshot of the panel.',
    k11: 'Security', t11: 'An agent with the keys to your PC should be boringly safe.',
    g1: 'Secrets vault', g1p: 'API keys are encrypted with Windows DPAPI and never shown back. Memory refuses to store keys or passwords.',
    g2: 'Tiered sandbox', g2p: 'Third-party skills and plugins run in isolated processes with declared permissions and none of your keys in their environment. Only signed, clean code moves up a level.',
    g3: 'Chained audit log', g3p: 'Every approval and action goes into a SHA-256 hash-chained log: who approved, what, and the result. If anyone edits it, it shows.',
    g4: 'One panic button', g4p: 'Shortcut, island, Stream Deck, phone or eye: denies everything, cancels jobs and releases control until you resume.',
    g5: 'Only on your PC', g5p: 'The API listens on 127.0.0.1 with a token, checks Host and Origin, and LAN access for the phone is opt-in and scoped.',
    g6: 'Asks first', g6p: 'Reading is free; writing, running or controlling asks. “Always allow” never applies to chained or wrapped commands.',
    chain: 'chain verified ✓', recre2: 'Recreation of the format',
    k12: 'Honest comparison', t12: 'APOLO and OpenClaw',
    p12: 'OpenClaw is a great project and reaches more platforms and channels. This is what we could verify; for OpenClaw we only list what its documentation says.',
    tbll: 'Comparison table', sd: 'per its documentation',
    r1: 'License', r2: 'Platforms', r2a: 'Windows 10/11 (macOS and Linux on the roadmap)', r2b: 'macOS, Linux and Windows (WSL2 and native); iOS and Android apps',
    r3: 'Channels', r3a: 'Discord, Telegram, WhatsApp, Slack, Matrix, Signal, email and a mobile app', r3b: 'Discord, iMessage, Slack, Teams, Telegram, WhatsApp and “20+ more”',
    r4: 'Models', r4a: 'Hosted and local (Ollama, LM Studio…)', r4b: 'Hosted and local',
    r5: 'Third-party skills', r5a: 'Universal SKILL.md; quarantine + antivirus + ed25519 signatures', r5b: 'ClawHub marketplace + plugin SDK',
    r6: 'Sandbox', r6a: 'Tiered, for third-party skills and plugins', r6b: '“Tools run on the host for the main session unless you configure sandboxing” (Docker)',
    r7: '3D desktop avatar', yes: 'Yes', yes2: 'Yes', nm: 'Not mentioned', nm2: 'Not mentioned',
    r8: 'Physical eye (ESP32)', r9: 'Import from OpenClaw', r9a: 'Yes: SOUL.md, USER.md, MEMORY.md, automations, agents and skills',
    cmpnote: 'OpenClaw source: README at github.com/openclaw/openclaw, checked on October 3, 2026. Something changed? Open an issue and we’ll fix it.',
    k13: 'Models', t13: 'You pick the model. Even per channel.',
    p13: 'Write <code>provider/model</code> (e.g. <code>ollama/qwen3.6</code>). An automatic router sends coding work to Claude Code and everything else to your default model.',
    m1: 'hooks + CLI · your plan', m2: 'codex CLI · your plan', m3: 'Qwen, Gemma, Llama… · free, local', m4: 'API or Gemini CLI', m5: 'API key · per token', m6: 'any OpenAI-compatible server',
    t14: 'Frequently asked questions',
    q1: 'Is it free?', a1x: 'Yes. APOLO is open source under the MIT license. You only pay for the model you choose: your Claude or ChatGPT plan, a per-token API, or nothing if you run Ollama locally.',
    q2: 'Do I need an API key?', a2x: 'No. It can use Claude Code and Codex with the plan you already pay for, through their own CLIs, or Ollama on your PC. API keys are optional.',
    q3: 'Does it work offline?', a3x: 'With Ollama, the agent, memory embeddings and routing run on your PC. External channels (Discord, Telegram…) need a connection, of course.',
    q4: 'Mac or Linux?', a4x: 'Windows 10/11 only for now. The core already runs on macOS and Linux; desktop control is what’s missing. It’s on the roadmap.',
    q5: 'Windows says “Windows protected your PC”. Is that normal?', a5x: 'Yes: the installer isn’t code-signed yet. Click “More info → Run anyway”, or install from source if you prefer.',
    q6: 'What data does it send?', a6x: 'None to us: there’s no telemetry. Your data lives in <code>%APPDATA%\\robot-companion</code> and you can export or erase everything from the panel. Whatever you send to a cloud model is processed by that provider.',
    q7: 'Can I bring my stuff from OpenClaw?', a7x: 'Yes: it imports memory files (SOUL.md, USER.md, MEMORY.md…), automations, agents and skills in one step, and the skills go through the antivirus.',
    q8: 'How do I contribute?', a8x: 'Issues and PRs welcome. Read CONTRIBUTING.md; the core tests need no dependencies (<code>cd core &amp;&amp; npm test</code>).',
    t15: 'APOLO. Open source. With any model you want.', dl2: 'Download for Windows', star: 'Star it on GitHub',
    lic: 'MIT License · © DMNENGINE', sec: 'Security',
    ffine: 'Provider logos: LobeHub Icons (MIT). Trademarks belong to their owners. APOLO is not affiliated with Anthropic, OpenAI, Google or OpenClaw.',
  };
  const ES = { _title: d.title, _desc: $('meta[name=description]').content, copied: 'Copiado' };
  $$('[data-i]').forEach(e => { ES[e.dataset.i] = e.innerHTML; });
  $$('[data-ialt]').forEach(e => { ES[e.dataset.ialt] = e.alt; });
  $$('[data-ilabel]').forEach(e => { ES[e.dataset.ilabel] = e.getAttribute('aria-label'); });
  let L = 'es';
  const t = k => (L === 'en' ? EN : ES)[k] ?? ES[k];
  function setLang(l, save) {
    L = l === 'en' ? 'en' : 'es';
    d.documentElement.lang = L;
    $$('[data-i]').forEach(e => { const v = t(e.dataset.i); if (v != null) e.innerHTML = v; });
    $$('[data-ialt]').forEach(e => { e.alt = t(e.dataset.ialt); });
    $$('[data-ilabel]').forEach(e => { e.setAttribute('aria-label', t(e.dataset.ilabel)); });
    d.title = t('_title'); $('meta[name=description]').content = t('_desc');
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === L)));
    if (save) try { localStorage.setItem('apolo-lang', L); } catch {}
    d.dispatchEvent(new CustomEvent('apolo:lang', { detail: L }));
  }
  let pref = new URLSearchParams(location.search).get('lang');
  if (!pref) try { pref = localStorage.getItem('apolo-lang'); } catch {}
  if (!pref) pref = (navigator.languages || [navigator.language || 'es']).some(x => /^es\b/i.test(x)) ? 'es' : 'en';
  setLang(pref);
  $$('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang, true)));
  window.APOLO_T = t;

  // ---------------- copiar ----------------
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const txt = d.getElementById(b.dataset.copy).textContent.trim();
    try { await navigator.clipboard.writeText(txt); } catch {
      const r = d.createRange(); r.selectNodeContents(d.getElementById(b.dataset.copy));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); try { d.execCommand('copy'); } catch {}
    }
    const sp = b.querySelector('span'); sp.textContent = t('copied'); b.classList.add('done');
    setTimeout(() => { sp.textContent = t('copy'); b.classList.remove('done'); }, 1800);
  }));

  // ---------------- revelado ----------------
  const rv = $$('.sec .txt, .sec .media, .phones, .grid3, .audit, .tbl-wrap, .models, .faq');
  rv.forEach(e => e.classList.add('rv'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(e => io.observe(e));
  } else rv.forEach(e => e.classList.add('in'));

  // ---------------- manos: recreación ----------------
  const H = { win: $('#hwin'), txt: $('#htxt'), cur: $('#hcur'), pan: $('#hpanic') };
  const LISTA = { es: 'Lista de la compra\n- leche\n- huevos\n- café\n- pilas AA', en: 'Groceries\n- milk\n- eggs\n- coffee\n- AA batteries' };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let handsOn = false;
  async function hands() {
    if (handsOn) return; handsOn = true;
    for (;;) {
      const s = LISTA[L];
      H.win.classList.remove('free'); H.pan.classList.remove('on'); H.txt.textContent = '';
      H.cur.style.left = '18%'; H.cur.style.top = '30%';
      await wait(700);
      for (let i = 0; i < s.length; i++) { H.txt.textContent = s.slice(0, i + 1); await wait(s[i] === '\n' ? 260 : 55 + Math.random() * 50); }
      await wait(500);
      // el usuario mueve el ratón → pánico
      for (const [x, y] of [[62, 64], [70, 52], [58, 70], [74, 60]]) { H.cur.style.left = x + '%'; H.cur.style.top = y + '%'; await wait(160); }
      H.win.classList.add('free'); H.pan.classList.add('on');
      await wait(3600);
    }
  }
  if (H.win) {
    if (RM) { H.txt.textContent = LISTA[L]; H.win.classList.add('free'); H.pan.classList.add('on'); d.addEventListener('apolo:lang', () => { H.txt.textContent = LISTA[L]; }); }
    else new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); hands(); } }).observe(H.win);
  }

  // ---------------- ojo: hoja de gestos animada ----------------
  const EYE = [['reposo', 'idle', 0], ['trabajando', 'working', 0], ['permiso', 'permission', 0], ['listo', 'done', 0], ['error', 'error', 0], ['dormido', 'asleep', 0],
    ['feliz', 'happy', 1], ['triste', 'sad', 1], ['duda', 'puzzled', 1], ['sorpresa', 'surprised', 1], ['guiño', 'wink', 1], ['corazón', 'heart', 1],
    ['remolino', 'dizzy', 1], ['bostezo', 'yawn', 1], ['reloj', 'clock', 1], ['emparejar', 'pairing', 2], ['escuchando', 'listening', 2], ['cámara', 'camera', 2]];
  const KIND = { es: ['estado', 'gesto', 'función'], en: ['state', 'gesture', 'feature'] };
  const eye = $('#eye');
  if (eye) {
    const dots = $('#eyedots'); EYE.forEach(() => dots.appendChild(d.createElement('i')));
    let k = 0;
    const show = () => {
      eye.style.backgroundPosition = (k * 100 / 17) + '% 0';
      $('#eyename').textContent = EYE[k][L === 'en' ? 1 : 0];
      $('#eyekind').textContent = KIND[L][EYE[k][2]];
      [...dots.children].forEach((x, i) => x.classList.toggle('on', i === k));
    };
    show(); d.addEventListener('apolo:lang', show);
    if (!RM) {
      let timer = 0;
      new IntersectionObserver(es => {
        clearInterval(timer);
        if (es[0].isIntersecting) timer = setInterval(() => { k = (k + 1) % EYE.length; show(); }, 1700);
      }).observe(eye);
    }
    eye.addEventListener('click', () => { k = (k + 1) % EYE.length; show(); });
  }
})();
