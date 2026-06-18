const state = { source:null, sourceData:null, generated:null, active:null, timer:null, documentKey:null, lastPrintJob:null };
const $ = (id)=>document.getElementById(id);
const qs = (sel)=>document.querySelector(sel);
const qsa = (sel)=>document.querySelectorAll(sel);

function setView(id){
  qsa('.view').forEach(v=>v.classList.remove('active'));
  $(id).classList.add('active');
  qsa('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===id));
}
qsa('[data-view]').forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
qsa('[data-jump]').forEach(btn=>btn.onclick=()=>setView(btn.dataset.jump));

function readAsDataURL(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}
function download(filename, text){
  const blob = new Blob([text], {type:'application/tad+json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}
function fileId(pkg){ return btoa(unescape(encodeURIComponent(pkg.meta.originalName + pkg.meta.createdAt))).replace(/=/g,''); }
function getUsage(id){ return JSON.parse(localStorage.getItem('tad_usage_'+id)||'{"views":0,"prints":0}'); }
function setUsage(id,u){ localStorage.setItem('tad_usage_'+id, JSON.stringify(u)); }
function formatTime(seconds){
  seconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(seconds/60), s=seconds%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

$('sourceFile').addEventListener('change', async e=>{
  const file = e.target.files[0]; if(!file) return;
  state.source = file;
  state.sourceData = await readAsDataURL(file);
  $('fileName').textContent = `${file.name} • ${(file.size/1024/1024).toFixed(2)} MB`;
});

$('generateTad').addEventListener('click', ()=>{
  if(!state.source || !state.sourceData){ alert('Please upload a source document first.'); return; }
  const pkg = {
    tadVersion:'0.1-prototype',
    meta:{
      originalName: state.source.name,
      mime: state.source.type || 'application/octet-stream',
      size: state.source.size,
      createdAt: Date.now(),
      author:'Kamal Varma Chittari @TAD',
      note:'For a safer digital document world for tomorrow.'
    },
    policy:{
      expirySeconds: Number($('expirySeconds').value),
      viewLimit: Number($('viewLimit').value),
      printLimit: Number($('printLimit').value),
      purpose: $('purpose').value.trim() || 'Purpose-bound access',
      watermark: $('watermark').value.trim() || 'TAD Controlled Access'
    },
    payload: state.sourceData
  };
  state.generated = pkg;
  $('openGenerated').disabled = false;
  const outName = state.source.name.replace(/\.[^.]+$/,'') + '.tad';
  $('makerResult').className = 'result-summary';
  $('makerResult').innerHTML = `
    <div class="bigfile"><div class="secure-file">.tad</div><div><h3>${outName}</h3><p>Controlled access package created.</p></div></div>
    <dl>
      <div><dt>Expiry</dt><dd>${pkg.policy.expirySeconds}s</dd></div>
      <div><dt>Views</dt><dd>${pkg.policy.viewLimit}</dd></div>
      <div><dt>Prints</dt><dd>${pkg.policy.printLimit}</dd></div>
      <div><dt>Purpose</dt><dd>${pkg.policy.purpose}</dd></div>
    </dl>
    <button class="primary wide" id="downloadNow">Download .tad</button>
    <button class="secondary wide" id="openNow">Open in TAD Viewer</button>`;
  $('downloadNow').onclick=()=>download(outName, JSON.stringify(pkg));
  $('openNow').onclick=()=>{ setView('viewer'); openPackage(pkg, true); };
});

$('tadFile').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  $('tadFileName').textContent = `${f.name} • ${(f.size/1024).toFixed(1)} KB`;
  try{
    const text = await f.text();
    const pkg = JSON.parse(text);
    if(!pkg.tadVersion || !pkg.policy || !pkg.payload) throw new Error('Invalid TAD');
    openPackage(pkg, true);
  }catch(err){ alert('This is not a valid prototype .tad file.'); }
});
$('openGenerated').onclick=()=>{ if(state.generated) openPackage(state.generated, true); };

function openPackage(pkg, countView){
  if(state.timer) clearInterval(state.timer);
  state.active = pkg;
  state.documentKey = null;
  const id = fileId(pkg);
  let usage = getUsage(id);
  const now = Date.now();
  const expiresAt = pkg.meta.createdAt + pkg.policy.expirySeconds*1000;
  if(countView && now < expiresAt && usage.views < pkg.policy.viewLimit){
    usage.views += 1;
    setUsage(id, usage);
  }
  renderViewer();
  state.timer = setInterval(renderViewer, 1000);
}

function isExpired(pkg, usage){
  const timeExpired = Date.now() >= pkg.meta.createdAt + pkg.policy.expirySeconds*1000;
  const viewExpired = usage.views > pkg.policy.viewLimit;
  return timeExpired || viewExpired;
}

function renderViewer(){
  const pkg = state.active; if(!pkg) return;
  const id=fileId(pkg); const usage=getUsage(id);
  const remaining = (pkg.meta.createdAt + pkg.policy.expirySeconds*1000 - Date.now())/1000;
  const expired = isExpired(pkg, usage);

  // Update only the small metrics every second. The document preview is not rebuilt
  // unless the opened package or expired state changes. This removes PDF/image flicker.
  $('metricStatus').textContent = expired ? 'Expired / Blocked' : 'Active / Verified';
  $('metricStatus').style.color = expired ? 'var(--red)' : 'var(--green)';
  $('viewerStatus').textContent = expired ? 'Access Expired' : 'Policy Verified';
  $('viewerStatus').className = 'status-pill ' + (expired ? '' : 'neutral');
  $('metricTime').textContent = expired ? '00:00' : formatTime(remaining);
  $('metricViews').textContent = `${usage.views} / ${pkg.policy.viewLimit}`;
  $('metricPrints').textContent = `${usage.prints} / ${pkg.policy.printLimit}`;
  $('metricPurpose').textContent = pkg.policy.purpose;

  const printDisabled = expired || usage.prints >= pkg.policy.printLimit;
  $('printBtn').disabled = printDisabled;
  $('printBtn').textContent = usage.prints >= pkg.policy.printLimit ? 'Print Limit Reached' : 'Print Document';
  $('printBtn').onclick = ()=>controlledPrint(pkg);

  renderDocument(pkg, expired);
}

function renderDocument(pkg, expired){
  const key = `${fileId(pkg)}:${expired ? 'expired' : 'active'}`;
  if(state.documentKey === key) return;
  state.documentKey = key;

  if(expired){
    $('documentStage').className = 'expired';
    $('documentStage').innerHTML = `<div><div class="shield">🔒</div><h3>Access Expired</h3><p>This document is no longer available under the sender-defined policy.</p><p><b>The file may remain on the device, but usable access has expired.</b></p></div>`;
    return;
  }

  const mime = pkg.meta.mime;
  let content = '';
  if(mime.includes('pdf')) content = `<iframe id="activeDocFrame" src="${pkg.payload}#toolbar=0"></iframe>`;
  else if(mime.startsWith('image/')) content = `<img id="activeDocImage" src="${pkg.payload}" alt="TAD protected preview" />`;
  else content = `<div class="empty-state large"><div class="shield">📄</div><h3>${pkg.meta.originalName}</h3><p>Packaged document preview is not available in this browser prototype, but access rules are active.</p></div>`;
  $('documentStage').className = 'document-frame';
  $('documentStage').innerHTML = `${content}<div class="watermark">${pkg.policy.watermark}<br/>${pkg.policy.purpose}</div>`;
}

function controlledPrint(pkg){
  const id = fileId(pkg);
  const usage = getUsage(id);
  if(isExpired(pkg, usage)) return;
  if(usage.prints >= pkg.policy.printLimit) return;

  setPrintMessage('Preparing controlled print job…');

  // Count the print attempt as a controlled print event in the prototype.
  usage.prints += 1;
  setUsage(id, usage);
  renderViewer();

  setTimeout(()=>{
    try{
      const frame = $('activeDocFrame');
      if(frame && frame.contentWindow){
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } else {
        openPrintWindow(pkg);
      }
      setPrintMessage(usage.prints >= pkg.policy.printLimit ? 'Print completed. Print limit reached.' : 'Print completed and recorded.');
    }catch(err){
      openPrintWindow(pkg);
      setPrintMessage(usage.prints >= pkg.policy.printLimit ? 'Print completed. Print limit reached.' : 'Print completed and recorded.');
    }
  }, 350);
}

function setPrintMessage(message){
  const panel = $('printMessage');
  if(!panel) return;
  panel.textContent = message;
  panel.classList.add('show');
  clearTimeout(state.lastPrintJob);
  state.lastPrintJob = setTimeout(()=>panel.classList.remove('show'), 3200);
}

function openPrintWindow(pkg){
  const w = window.open('', '_blank', 'width=980,height=720');
  if(!w){ alert('Please allow pop-ups to print this controlled document.'); return; }
  const isImage = (pkg.meta.mime||'').startsWith('image/');
  const body = isImage
    ? `<img src="${pkg.payload}" style="max-width:100%;height:auto;display:block;margin:auto;" />`
    : `<iframe src="${pkg.payload}" style="width:100%;height:92vh;border:0;"></iframe>`;
  w.document.write(`<!doctype html><html><head><title>TAD Controlled Print</title><style>
    body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#06183a;}
    .mark{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;font-size:54px;font-weight:900;color:rgba(18,100,216,.13);transform:rotate(-24deg);text-align:center;text-transform:uppercase;letter-spacing:.08em;}
    .top{padding:10px 16px;border-bottom:1px solid #dbe6f7;font-size:12px;color:#50627b;}
    @media print{.top{display:none}.mark{color:rgba(18,100,216,.16)}}
  </style></head><body><div class="top">TAD Controlled Print • ${pkg.policy.purpose}</div>${body}<div class="mark">${pkg.policy.watermark}<br>${pkg.policy.purpose}</div><script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  w.document.close();
}
