'use strict';
const $=s=>document.querySelector(s), app=$('#app'), modal=$('#modal'), form=$('#form');
const pounds = new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'GBP'});
const money = n => pounds.format(n / 100);
const figure = n => `<span class="figure">${money(n)}</span>`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const shift=(m,n)=>{let [y,k]=m.split('-').map(Number);return key(new Date(y,k-1+n,1))};
const monthName=(m,short=false)=>new Date(m+'-01T12:00:00').toLocaleDateString('en-GB',{month:short?'short':'long',year:'numeric'});
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
const fresh=()=>({version:1,months:{},series:[],lastBackup:null});
let reorder=false, registration=null, updating=false, saveRevision=0;
let data=fresh(), month=key(new Date()), tab='overview', billTab='recurring', db, ready=false, saved=true, queue=Promise.resolve(), toastTimer, submitAction;
const storageKey='budgetbuddy-v1';
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('BudgetBuddy',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function readDB(){return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('budget');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function writeDB(value){return new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(value,'budget');t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}
function save(){const revision=++saveRevision;const snapshot=JSON.parse(JSON.stringify(data));saved=false;updateStatus();queue=queue.catch(()=>{}).then(async()=>{try{if(db)await writeDB(snapshot);else localStorage.setItem(storageKey,JSON.stringify(snapshot));if(revision===saveRevision){saved=true;updateStatus()}}catch(e){saved=false;updateStatus();toast('Saving failed. Export a backup now.')}});return queue}
function updateStatus(){const s=$('#saveStatus');if(s){s.textContent=saved?'✓ Saved on device':'Not yet saved';s.classList.toggle('error',!saved)}}
function toast(s){let el=$('#toast');el.textContent=s;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',3500)}
function current(){return data.months[month]||{salary:0,rollover:0,extra:0,oneoffs:[],overrides:{}}}
function ensure(){return data.months[month]||(data.months[month]={salary:0,rollover:0,extra:0,oneoffs:[],overrides:{}})}
function allRecurring(m=month){let overrides=data.months[m]?.overrides||{};return data.series.flatMap(s=>{let v=s.versions.filter(v=>v.from<=m).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);if(!v||v.deleted)return [];let o=overrides[s.id];if(o?.deleted)return [];return [{...v,...o,id:s.id,recurring:true}]})}
function recurring(m=month){return orderList(allRecurring(m).filter(b=>!b.kind),'recurring')}
function allocations(kind){return orderList([...allRecurring(),...current().oneoffs.map(b=>({...b,recurring:false}))].filter(b=>b.kind===kind),kind)}
function ordinaryOneoffs(){return orderList(current().oneoffs.filter(b=>!b.kind),'oneoff')}
function totals(){let c=current(),r=recurring().reduce((a,b)=>a+b.amount,0),o=ordinaryOneoffs().reduce((a,b)=>a+b.amount,0),i=c.salary+c.rollover+c.extra,s=allocations("savings").reduce((a,b)=>a+b.amount,0),v=allocations("investments").reduce((a,b)=>a+b.amount,0);return {r,o,i,s,v,left:i-r-o-s-v}}
const icons={overview:'<path d="M3 10 12 3l9 7v11h-6v-7H9v7H3z"/>',bills:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',savings:'<path d="M3 11h2l2-4h9l3 3h2v6h-3l-1 4h-3v-3H9v3H6l-1-4H3z"/><path d="M10 4h5M15 10h.01"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3 4 0 1 3 3 1 3 3-2 3 1 3-3 3-3-1-2 3-3-2-3 1-3-3 1-3-2-3 3-3 3 1z"/>'};
function header(title){return `<div class="top"><h1>${title}</h1><span id="saveStatus" class="status"></span></div>`}
function monthbar() {
  const months = [-1, 0, 1].map(slot => {
    const value = shift(month, slot);
    const label = new Date(value+'-01T12:00:00').toLocaleDateString('en-GB', {
      month: slot ? 'short' : 'long'
    });
    return `<button class="month ${slot ? '' : 'active'}" data-act="month"
      data-month="${value}" style="--slot:${slot}" aria-label="${monthName(value)}"
      ${slot ? '' : 'aria-current="date"'}><span>${label}</span></button>`;
  });
  return `<div class="monthpicker"><div class="year">${month.slice(0,4)}</div>
    <div class="months" id="monthSwipe">${months.join('')}</div></div>`;
}
function selectMonth(value) {
  if (value === month) return;
  const direction = value > month ? 1 : -1;
  const focused = $('#monthSwipe')?.contains(document.activeElement);
  month = value;
  render();
  const picker = $('#monthSwipe');
  if (focused) picker?.querySelector('.active').focus({preventScroll: true});
  if (!picker || reducedMotion.matches) return;

  const timing = {duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)'};
  picker.querySelectorAll('.month').forEach((button, index) => {
    const slot = index - 1;
    const oldSlot = slot + direction;
    button.animate([
      {left: `calc(50% + ${oldSlot} * 36%)`, opacity: Math.abs(oldSlot) > 1 ? 0 : 1},
      {left: `calc(50% + ${slot} * 36%)`, opacity: 1}
    ], timing);
    button.firstElementChild.animate([
      {transform: `scale(${oldSlot === 0 ? 1 : .64})`},
      {transform: `scale(${slot === 0 ? 1 : .64})`}
    ], timing);
  });
  app.querySelectorAll('.figure').forEach(el => el.animate(
    [{opacity: .25, transform: 'translateY(3px)'}, {opacity: 1, transform: 'none'}],
    timing
  ));
}
function billRow(b,manage=false){let group=b.kind|| (b.recurring?'recurring':'oneoff');return `<div class="billcard" data-row-id="${esc(b.id)}" data-group="${group}"><button class="row editrow" data-act="edit" data-id="${esc(b.id)}" data-type="${b.recurring?'recurring':'oneoff'}" ${manage&&reorder?'disabled':''}><span class="glyph">${b.recurring?'↻':'◇'}</span><span class="label">${esc(b.name)}${b.kind?`<small>${b.recurring?'Recurring monthly':'One-off'}</small>`:''}${b.day?`<small>Due day ${b.day}${b.recurring?' of each month':''}</small>`:''}</span><strong class="amount">${figure(b.amount)}</strong>${manage&&reorder?'':'<span class="chev">›</span>'}</button>${manage&&reorder?`<button class="grip" aria-label="Drag ${esc(b.name)} to reorder" data-grip="${esc(b.id)}" data-group="${group}">⠿</button><button class="move" data-act="move" data-id="${esc(b.id)}" data-group="${group}" data-dir="-1" aria-label="Move up">↑</button><button class="move" data-act="move" data-id="${esc(b.id)}" data-group="${group}" data-dir="1" aria-label="Move down">↓</button>`:''}</div>`}
function orderList(list,group){let ids=data.order?.[group==='recurring'?'recurring':month+':'+group]||[];return [...list].sort((a,b)=>{let i=ids.indexOf(a.id),j=ids.indexOf(b.id);return (i<0?Infinity:i)-(j<0?Infinity:j)||0})}
function groupList(g){return g==='recurring'?recurring():g==='oneoff'?ordinaryOneoffs():allocations(g)}
function setOrder(g, ids, redraw = true) {
  (data.order ??= {})[g === 'recurring' ? 'recurring' : month+':'+g] = ids;
  save();
  if (redraw) render();
}
function reorderControl(){return `<div class="reorderbar"><span class="note">${reorder?'Drag the grip or use arrows to move items.':'Tap a card to edit or delete.'}</span><button class="secondary" data-act="reorder">${reorder?'Done':'Reorder'}</button></div>`}
function section(title,total,rows,empty){return `<section class="panel"><div class="heading"><h2>${title}</h2><strong>${figure(total)}</strong></div>${rows||`<div class="empty">${empty}</div>`}</section>`}
function overview(){let c=current(),t=totals();return monthbar()+`<section class="panel summary"><small>Remaining balance</small><div class="balance ${t.left<0?'negative':''}">${figure(t.left)}</div><div class="totals"><div><small>Total income</small><strong>${figure(t.i)}</strong></div><div><small>Total bills</small><strong>${figure(t.r+t.o)}</strong></div><div><small>Savings</small><strong>${figure(t.s)}</strong></div><div><small>Investments</small><strong>${figure(t.v)}</strong></div></div></section>`+section('Income',t.i,[['salary','Salary','£'],['rollover','Rollover income','↻'],['extra','Extra income','+']].map(([k,l,g])=>`<button class="row editrow" data-act="income" data-key="${k}"><span class="glyph">${g}</span><span class="label">${l}</span><strong class="amount">${figure(c[k])}</strong><span class="chev">›</span></button>`).join(''),'')+section('Recurring bills',t.r,recurring().map(b=>billRow(b)).join(''),'No recurring bills yet.')+section('One-off bills',t.o,ordinaryOneoffs().map(b=>billRow(b)).join(''),'No one-off bills this month.')+section('Savings & investments',t.s+t.v,[...allocations('savings'),...allocations('investments')].map(b=>billRow(b)).join(''),'No allocations this month.')+`<button class="primary wide" data-act="add">＋ Add bill</button>`}
function bills(){let t=totals(),list=billTab==='recurring'?recurring():ordinaryOneoffs();return header('Bills')+monthbar()+`<section class="panel summary">
  <small>Total monthly bills</small><div class="balance">${figure(t.r+t.o)}</div>
  <div class="totals"><div><small>Recurring bills</small><strong>${figure(t.r)}</strong></div>
  <div><small>One-off bills</small><strong>${figure(t.o)}</strong></div></div>
</section><div class="seg"><button data-act="billtab" data-value="recurring" class="${billTab==='recurring'?'active':''}">Recurring</button><button data-act="billtab" data-value="oneoff" class="${billTab==='oneoff'?'active':''}">One-off</button></div>`+reorderControl()+section(billTab==='recurring'?'Recurring bills':'One-off bills',list.reduce((a,b)=>a+b.amount,0),list.map(b=>billRow(b,true)).join(''),'No bills to show.')+`<button class="primary wide" data-act="add">＋ Add new bill</button><p class="note">Recurring changes can apply to this month only or this month and future months. Earlier months stay unchanged.</p>`}
function savings(){let t=totals();return header('Savings & investments')+monthbar()+`<section class="panel summary"><small>Total allocated this month</small><div class="balance">${figure(t.s+t.v)}</div></section>`+reorderControl()+section('Savings',t.s,allocations('savings').map(b=>billRow(b,true)).join(''),'No savings allocations this month.')+`<button class="primary wide" data-act="addallocation" data-kind="savings">＋ Add savings</button>`+section('Investments',t.v,allocations('investments').map(b=>billRow(b,true)).join(''),'No investment allocations this month.')+`<button class="primary wide" data-act="addallocation" data-kind="investments">＋ Add investment</button><p class="note">Allocations reduce your remaining budget. They are not account balances or investment valuations.</p>`}
function settings(){return header('Settings')+`<section class="panel"><div class="row"><span class="glyph">✓</span><div class="label"><strong>Local storage</strong><small>Private data stored on this device</small></div></div></section><div class="sectionlabel">DATA & BACKUP</div><section class="panel"><button class="row setting" data-act="backup"><span class="glyph">↓</span><span class="label"><strong>Back up to Files</strong><small>Save your complete budget to iCloud Drive</small></span>›</button><button class="row setting" data-act="restore"><span class="glyph">↑</span><span class="label"><strong>Restore from backup</strong><small>Import a previously exported JSON file</small></span>›</button><div class="row"><span class="label muted">Last backup prepared</span><small>${data.lastBackup?esc(new Date(data.lastBackup).toLocaleDateString('en-GB')):'Never'}</small></div></section><p class="note">Your iPhone may clear website data in some circumstances. Keep a separate backup in Files. ${!data.lastBackup||Date.now()-Date.parse(data.lastBackup)>30*86400000?'A backup is recommended now.':''}</p><div class="sectionlabel">ABOUT</div><section class="panel"><div class="row"><span>Appearance</span><div class="themebuttons"><button data-act="theme" data-value="dark" class="${data.theme!=='light'?'selected':''}">Dark</button><button data-act="theme" data-value="light" class="${data.theme==='light'?'selected':''}">Light</button></div></div><div class="row"><span>Version</span><small>1.3</small></div><button class="row setting" data-act="update"><span class="label">Check for updates</span>›</button></section><p class="note">No account, cloud database or bank connection. To install on iPhone, open the hosted app in Safari, tap Share, then Add to Home Screen.</p>`}
function render(){if(!ready)return;document.documentElement.dataset.theme=data.theme==='light'?'light':'dark';document.querySelector('meta[name=theme-color]').content=data.theme==='light'?'#f2f5f4':'#101619';app.innerHTML=tab==='overview'?overview():tab==='bills'?bills():tab==='savings'?savings():settings();$('#nav').innerHTML=Object.entries(icons).map(([k,v])=>`<button class="${tab===k?'active':''}" data-act="tab" data-value="${k}" ${tab===k?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${v}</svg>${k[0].toUpperCase()+k.slice(1)}</button>`).join('');updateStatus();bindGestures()}
function dialog(html,action){$('#fields').innerHTML=html;submitAction=action;modal.showModal()}
function amountInput(n){return `<label for="amount">Amount (£)</label><input id="amount" name="amount" type="number" inputmode="decimal" min="0" max="99999999" step="0.01" placeholder="0.00" value="${!n?'':(n/100).toFixed(2)}">`}
function cents(v){let n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<0||n>9999999900)throw Error('Enter a valid amount.');return n}
function income(k){let labels={salary:'Salary',rollover:'Rollover income',extra:'Extra income'};dialog(`<h2>Edit ${labels[k].toLowerCase()}</h2><p class="note">${monthName(month)}</p>${amountInput(current()[k])}`,f=>{ensure()[k]=cents(f.amount);changed()})}
function findBill(id,type){return (type==='recurring'?allRecurring():current().oneoffs).find(b=>b.id===id)}
function editBill(id,type,kind){let b=id?findBill(id,type):null;if(id&&!b)return;kind=b?.kind||kind||'';let noun=kind?'allocation':'bill';let isRec=b?b.recurring:kind?false:tab!=='bills'||billTab==='recurring';dialog(`<h2>${b?'Edit':'Add'} ${noun}</h2><p class="note">${monthName(month)}</p><label for="name"> ${kind?"Allocation name":"Bill name"}</label><input id="name" name="name" maxlength="100" required value="${esc(b?.name||'')}">${amountInput(b?.amount)}${kind?'':`<label for="day">Due day (optional)</label><input id="day" name="day" type="number" inputmode="numeric" min="1" max="31" value="${b?.day||''}">`}${b?`<p class="note">${isRec?'Recurring':'One-off'} ${noun}</p>`:`<label for="type">${kind?"Frequency":"Bill type"}</label><select id="type" name="type"><option value="recurring" ${isRec?'selected':''}>Recurring monthly</option><option value="oneoff" ${!isRec?'selected':''}>One-off</option></select>`}${b&&isRec?'<label for="scope">Apply changes to</label><select id="scope" name="scope"><option value="future">This month and future months</option><option value="single">This month only</option></select>':''}${b?`<button type="button" class="danger wide" id="deleteInModal">Delete ${noun}</button>`:''}`,f=>{let name=f.name.trim();if(!name)throw Error('Enter a bill name.');let val={name,amount:cents(f.amount),day:f.day?Number(f.day):null,...(kind?{kind}:{})};if(b){if(isRec){if(f.scope==='single')ensure().overrides[id]=val;else {let s=data.series.find(s=>s.id===id);s.versions=s.versions.filter(v=>v.from<month);s.versions.push({...val,from:month});delete ensure().overrides[id]}}else Object.assign(ensure().oneoffs.find(x=>x.id===id),val)}else if(f.type==='recurring')data.series.push({id:uid(),versions:[{...val,from:month}]});else ensure().oneoffs.push({...val,id:uid()});changed()});if(b)$('#deleteInModal').onclick=()=>{modal.close();deleteBill(id,type)}}
function deleteBill(id,type){let b=findBill(id,type);if(!b)return;dialog(`<h2>Delete ${b.kind?"allocation":"bill"}?</h2><p>${esc(b.name)} · ${money(b.amount)}</p>${type==='recurring'?'<label for="scope">Remove from</label><select id="scope" name="scope"><option value="future">This month and future months</option><option value="single">This month only</option></select>':'<p class="note">This removes the entry from this month.</p>'}`,f=>{if(type==='recurring'){if(f.scope==='single')ensure().overrides[id]={deleted:true};else {let s=data.series.find(s=>s.id===id);s.versions=s.versions.filter(v=>v.from<month);s.versions.push({from:month,deleted:true});delete ensure().overrides[id]}}else ensure().oneoffs=ensure().oneoffs.filter(b=>b.id!==id);changed()});form.querySelector('[type=submit]').textContent='Delete'}
function changed(){save();render()}
form.addEventListener('submit',e=>{e.preventDefault();try{submitAction(Object.fromEntries(new FormData(form)));modal.close();form.querySelector('[type=submit]').textContent='Save'}catch(e){toast(e.message)}});$('#cancel').onclick=()=>modal.close();modal.addEventListener('close',()=>{if(!modal.open)form.querySelector('[type=submit]').textContent='Save'});
function backup(){let now=new Date().toISOString(),copy={...data,lastBackup:now},file=new File([JSON.stringify(copy,null,2)],`BudgetBuddy-${now.slice(0,10)}.json`,{type:'application/json'});const done=()=>{data.lastBackup=now;changed();toast('Backup prepared. Keep it in Files or iCloud Drive.')};if(navigator.canShare?.({files:[file]})){navigator.share({files:[file],title:'BudgetBuddy backup'}).then(done).catch(e=>{if(e.name!=='AbortError')download()})}else download();function download(){let url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);done()}}
const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);const validAmount=n=>Number.isSafeInteger(n)&&n>=0&&n<=9999999900;const validId=s=>typeof s==='string'&&s.length>0&&s.length<200&&!['__proto__','constructor','prototype'].includes(s);const validBill=b=>b&&(b.kind==null||['savings','investments'].includes(b.kind))&&typeof b.name==='string'&&b.name.trim().length>0&&b.name.length<=100&&validAmount(b.amount)&&(b.day==null||Number.isInteger(b.day)&&b.day>=1&&b.day<=31);const object=o=>o&&typeof o==='object'&&!Array.isArray(o);
function validate(d){if(!object(d)||(d.theme!=null&&!['dark','light'].includes(d.theme))||(d.order!=null&&(!object(d.order)||!Object.values(d.order).every(v=>Array.isArray(v)&&v.every(validId))))||d.version!==1||!object(d.months)||!Array.isArray(d.series))return false;let ids=new Set();for(let s of d.series){if(!object(s)||!validId(s.id)||ids.has(s.id)||!Array.isArray(s.versions)||!s.versions.length)return false;ids.add(s.id);if(!s.versions.every(v=>object(v)&&validMonth(v.from)&&(v.deleted===true||validBill(v))))return false}for(let [m,c] of Object.entries(d.months)){if(!validMonth(m)||!object(c)||!['salary','rollover','extra'].every(k=>validAmount(c[k]))||!Array.isArray(c.oneoffs)||!c.oneoffs.every(b=>validBill(b)&&validId(b.id))||!object(c.overrides))return false;for(let [id,b] of Object.entries(c.overrides))if(!ids.has(id)||!object(b)||!(b.deleted===true||validBill(b)))return false}return d.lastBackup==null||typeof d.lastBackup==='string'&&Number.isFinite(Date.parse(d.lastBackup))}
$('#restore').onchange=async e=>{let f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>20*1024*1024)throw Error();let d=JSON.parse(await f.text());if(!validate(d))throw Error();if(!confirm('Replace all current budget data with this backup?'))return;data=d;changed();toast('Backup restored.')}catch{toast('Invalid or unsupported backup. Your data was not changed.')}};
document.addEventListener('click',e=>{let b=e.target.closest('[data-act]');if(!b||!ready)return;let a=b.dataset;switch(a.act){case'tab':reorder=false;tab=a.value;render();window.scrollTo(0,0);break;case'month':selectMonth(a.month);break;case'billtab':reorder=false;billTab=a.value;render();break;case'income':income(a.key);break;case'add':editBill();break;case'addallocation':editBill(null,null,a.kind);break;case'edit':editBill(a.id,a.type);break;case'delete':deleteBill(a.id,a.type);break;case'reorder':reorder=!reorder;render();break;case'theme':data.theme=a.value;changed();break;case'move':{let ids=groupList(a.group).map(x=>x.id),i=ids.indexOf(a.id),j=i+Number(a.dir);if(i>=0&&j>=0&&j<ids.length){[ids[i],ids[j]]=[ids[j],ids[i]];setOrder(a.group,ids)}break}case'update':checkUpdate(true);break;case'backup':backup();break;case'restore':$('#restore').click();break}});
(async()=>{app.innerHTML='<p>Loading your budget…</p>';try{db=await openDB();let d=await readDB();if(d){if(!validate(d))throw Error('Stored data invalid');data=d}else{let legacy=localStorage.getItem(storageKey);if(legacy){let parsed=JSON.parse(legacy);if(!validate(parsed))throw Error();data=parsed;await writeDB(data)}}}catch(e){if(db){app.innerHTML='<h1>Unable to load budget</h1><p>Your existing data has not been overwritten. Reopen the app and try again.</p>';return}try{let d=localStorage.getItem(storageKey);if(d){let parsed=JSON.parse(d);if(!validate(parsed))throw Error();data=parsed}}catch{app.innerHTML='<h1>Storage unavailable</h1><p>Open in a normal Safari window and try again.</p>';return}}ready=true;render();navigator.storage?.persist?.().catch(()=>{});if('serviceWorker'in navigator&&location.protocol!=='file:')setupUpdates()})();

function bindGestures() {
  const picker = $('#monthSwipe');
  let start;
  picker?.addEventListener('touchstart', e => {
    start = e.touches.length === 1 ? e.touches[0] : null;
  }, {passive: true});
  picker?.addEventListener('touchcancel', () => { start = null; });
  picker?.addEventListener('touchend', e => {
    const end = e.changedTouches[0];
    if (!start || end.identifier !== start.identifier) return;
    const dx = end.clientX - start.clientX;
    const dy = end.clientY - start.clientY;
    start = null;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
      selectMonth(shift(month, dx < 0 ? 1 : -1));
    }
  }, {passive: true});
  app.querySelectorAll('[data-grip]').forEach(grip => {
    grip.addEventListener('pointerdown', beginCardDrag);
  });
}

function beginCardDrag(event) {
  if (!event.isPrimary || event.button !== 0 || document.querySelector('.drag-preview')) return;
  event.preventDefault();
  const grip = event.currentTarget;
  const row = grip.closest('.billcard');
  const parent = row.parentElement;
  const group = row.dataset.group;
  const original = [...parent.children].filter(card => card.dataset.group === group);
  const originalNext = row.nextElementSibling;
  const bounds = row.getBoundingClientRect();
  const preview = row.cloneNode(true);
  preview.classList.add('drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  Object.assign(preview.style, {width: `${bounds.width}px`, left: `${bounds.left}px`, top: `${bounds.top}px`});
  document.body.append(preview);
  row.classList.add('drag-placeholder');
  parent.setPointerCapture(event.pointerId);

  let x = event.clientX;
  let y = event.clientY;
  let frame;

  function place() {
    if (!parent.isConnected) {
      finish();
      return;
    }
    if (y < 70) window.scrollBy(0, -10);
    if (y > innerHeight - 100) window.scrollBy(0, 10);
    const dx = x - event.clientX;
    const dy = y - event.clientY;
    preview.style.transform = `translate(${dx}px,${dy}px)`;
    const rows = [...parent.children].filter(card => card.dataset.group === group);
    const index = rows.indexOf(row);
    const centre = bounds.top + dy + bounds.height / 2;
    const parentTop = parent.getBoundingClientRect().top;
    const midpoint = card => parentTop + parent.clientTop + card.offsetTop + card.offsetHeight / 2;
    let next = row.nextElementSibling;
    if (index > 0 && centre < midpoint(rows[index - 1])) {
      next = rows.slice(0, index).find(card => centre < midpoint(card));
    } else if (index < rows.length - 1 && centre > midpoint(rows[index + 1])) {
      const later = rows.slice(index + 1);
      next = later.find(card => centre < midpoint(card)) ?? later.at(-1).nextElementSibling;
    }
    if (next !== row.nextElementSibling) {
      const neighbours = rows.filter(card => card !== row);
      const before = neighbours.map(card => card.getBoundingClientRect().top);
      parent.insertBefore(row, next);
      neighbours.forEach((card, i) => {
        card.getAnimations().forEach(animation => animation.cancel());
        const delta = before[i] - card.getBoundingClientRect().top;
        if (delta && !reducedMotion.matches) {
          card.animate([{transform: `translateY(${delta}px)`}, {transform: 'none'}],
            {duration: 180, easing: 'ease-out'});
        }
      });
    }
    frame = requestAnimationFrame(place);
  }

  function move(e) {
    if (e.pointerId !== event.pointerId) return;
    x = e.clientX;
    y = e.clientY;
  }

  function finish(e) {
    if (e && e.pointerId !== event.pointerId) return;
    cancelAnimationFrame(frame);
    parent.removeEventListener('pointermove', move);
    parent.removeEventListener('pointerup', finish);
    parent.removeEventListener('pointercancel', finish);
    parent.removeEventListener('lostpointercapture', finish);
    if (parent.hasPointerCapture(event.pointerId)) parent.releasePointerCapture(event.pointerId);

    if (!parent.isConnected) {
      preview.remove();
      return;
    }
    if (e?.type === 'pointerup') {
      const ids = [...parent.children].filter(card => card.dataset.group === group).map(card => card.dataset.rowId);
      if (ids.some((id, i) => id !== original[i].dataset.rowId)) {
        setOrder(group, ids, false);
      }
    } else {
      parent.insertBefore(row, originalNext);
    }
    const from = preview.getBoundingClientRect();
    preview.remove();
    row.classList.remove('drag-placeholder');
    const to = row.getBoundingClientRect();
    if (!reducedMotion.matches) {
      row.animate([
        {transform: `translate(${from.left-to.left}px,${from.top-to.top}px) scale(1.02)`},
        {transform: 'none'}
      ], {duration: 200, easing: 'ease-out'});
    }
  }

  parent.addEventListener('pointermove', move);
  parent.addEventListener('pointerup', finish);
  parent.addEventListener('pointercancel', finish);
  parent.addEventListener('lostpointercapture', finish);
  frame = requestAnimationFrame(place);
}
async function setupUpdates(){try{let had=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',async()=>{if(!had||updating)return;updating=true;await queue;if(!saved){updating=false;toast('Update ready. Back up before reloading.');return}if(modal.open){updating=false;toast('Update ready. Finish editing, then check for updates.');return}location.reload()});registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await checkUpdate(false);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate(false)})}catch(e){console.warn(e)}}
async function checkUpdate(manual){try{if(!registration)throw Error();await registration.update();if(registration.waiting)registration.waiting.postMessage('ACTIVATE');if(manual)toast(registration.installing||registration.waiting?'Update downloading…':'Checked for updates. You are up to date.')}catch(e){if(manual)toast('Could not check for updates. Connect to the internet and try again.')}}
