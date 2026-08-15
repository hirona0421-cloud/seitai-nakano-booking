import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const supabase=createClient('https://scjzofjyxmchfjsngqtb.supabase.co','sb_publishable_EGlr-6w0xh4gD8OImboE_Q_V-COJ7t9');

const DAY_START=8*60;
const DAY_END=23*60;
const LAST_VISIBLE_START=22*60+45;
const PX_PER_MINUTE=2;
const SNAP_MINUTES=15;
const DOWN_TRIGGER=10;
const HORIZONTAL_CANCEL=34;
const EDGE_ZONE=72;
const MAX_AUTO_SPEED=13;

let active=null,autoFrame=null,suppressClickUntil=0,realtimeChannel=null,realtimeTimer=null,hiddenAt=0,lastAutoDate=null,enhanceTimer=null;
const bookingCache=new Map();
const $=id=>document.getElementById(id);
const getScheduleScroll=()=>document.querySelector('.timelineScroll,.scheduleScroll');
const selectedDate=()=>$('date')?.value||'';
const isAdmin=()=>location.pathname.endsWith('/admin.html')||location.pathname.endsWith('/');
const isBookings=()=>location.pathname.endsWith('/bookings.html');

function timeToMinutes(t){const [h,m]=String(t).slice(0,5).split(':').map(Number);return h*60+m}
function minutesToTime(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}:00`}
function snapMinutes(v){return Math.round(v/SNAP_MINUTES)*SNAP_MINUTES}
function overlaps(aStart,aEnd,bStart,bEnd){return aStart<bEnd&&aEnd>bStart}
function todayJapan(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),g=t=>p.find(x=>x.type===t)?.value;return `${g('year')}-${g('month')}-${g('day')}`}
function currentJapanMinutes(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),g=t=>Number(p.find(x=>x.type===t)?.value||0);return g('hour')*60+g('minute')}
function monthDates(month){if(!/^\d{4}-\d{2}$/.test(month||''))return[];const[y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),out=[];for(let d=1;d<=last;d++)out.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);return out}
function nextMonth(month){const[y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`}
function quarterTimes(){const out=[];for(let n=DAY_START;n<=LAST_VISIBLE_START;n+=15)out.push(minutesToTime(n));return out}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}

function addStyles(){
  if($('nakanoUnifiedBookingStyle'))return;
  const s=document.createElement('style');
  s.id='nakanoUnifiedBookingStyle';
  s.textContent=`
.bookingBlock{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:pan-x;position:absolute}.bookingBlock.dragging,.bookingBlock.resizing{z-index:100!important;opacity:.97;box-shadow:0 0 0 3px rgba(97,87,77,.20),0 9px 26px rgba(0,0,0,.23);transition:none!important;touch-action:none!important}.bookingBlock.dragging{transform:translateY(10px) scale(1.025)}.bookingBlock.resizing{transform:translateY(4px)}body.bookingDragging{overscroll-behavior:none}body.bookingDragging .timelineScroll,body.bookingDragging .scheduleScroll{touch-action:none!important;overscroll-behavior:none}
.bookingResizeHandle{position:absolute;right:0;top:0;bottom:0;width:20px;z-index:8;cursor:ew-resize;touch-action:none;background:linear-gradient(to left,rgba(97,87,77,.13),rgba(97,87,77,.02));border-left:1px dashed rgba(97,87,77,.38)}.bookingResizeHandle:after{content:'↔';position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:11px;color:#746b63;font-weight:800}.bookingBlock.resizing .bookingResizeHandle{background:rgba(97,87,77,.20)}
.bookingOriginGhost{position:absolute;top:8px;height:82px;z-index:4;pointer-events:none;border:2px dashed rgba(92,88,84,.42);border-radius:10px;background:rgba(92,88,84,.13);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;color:rgba(70,67,64,.68);font-size:10px;font-weight:700}.bookingOriginGhost span{padding:3px 6px;border-radius:7px;background:rgba(255,255,255,.70);white-space:nowrap}
.dragDestinationSlot{height:34px;display:flex;align-items:center;justify-content:center;margin:2px 0 6px;pointer-events:none}.dragDestinationPill{opacity:0;transform:translateY(2px);min-width:150px;padding:5px 12px 6px;border:1px solid #cfc4b9;border-radius:11px;background:#fff;color:#332f2b;text-align:center;box-shadow:0 2px 9px rgba(0,0,0,.09);transition:opacity .08s ease,transform .08s ease}.dragDestinationSlot.show .dragDestinationPill{opacity:1;transform:translateY(0)}.dragDestinationLabel{font-size:10px;color:#77716a;margin-right:6px}.dragDestinationTime{font-size:17px;font-weight:800}
.dragEdge{position:fixed;top:0;bottom:0;width:54px;opacity:0;z-index:99998;pointer-events:none;transition:opacity .12s}.dragEdge.left{left:0;background:linear-gradient(to right,rgba(97,87,77,.18),transparent)}.dragEdge.right{right:0;background:linear-gradient(to left,rgba(97,87,77,.18),transparent)}.dragEdge.show{opacity:1}
.bookingOperationGuide{margin-top:9px;padding:10px 11px;border:1px solid #e7e0d7;border-radius:12px;background:#faf8f5;color:#68615b;font-size:12px;line-height:1.65}.bookingOperationShort{font-weight:700;color:#514b45}.bookingOperationGuide details{margin-top:5px}.bookingOperationGuide summary{cursor:pointer;list-style:none;color:#777069;font-size:12px}.bookingOperationGuide summary::-webkit-details-marker{display:none}.bookingOperationDetail{padding-top:8px;color:#746d67;line-height:1.75}.bookingRefreshRow{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}.bookingRefreshStatus{color:#8a837d;font-size:11px}.bookingRefreshButton{width:auto!important;min-width:72px;padding:7px 10px;border:1px solid #ddd5cc;border-radius:10px;background:#fff;color:#554e48;font-size:12px;font-weight:700}
.blockedFold,.monthlyBookingFold{margin-top:12px;border:1px solid #e7e0d7;border-radius:13px;overflow:hidden}.blockedFold>summary,.monthlyBookingFold>summary{padding:13px;background:#faf8f5;font-weight:700;cursor:pointer;list-style:none}.blockedFold>summary::-webkit-details-marker,.monthlyBookingFold>summary::-webkit-details-marker{display:none}.blockedFoldInner,.monthlyBookingInner{padding:0 12px 10px}.monthlyBookingRow{padding:10px 0;border-bottom:1px solid #eee7df;font-size:12px;line-height:1.55}.monthlyBookingRow:last-child{border-bottom:0}.monthlyBookingTime{font-weight:800;font-size:13px}.monthlyBookingCount{color:#77716a;font-weight:600;margin-left:5px}
.quarterGuide{position:absolute;top:0;height:100%;border-left:1px dashed rgba(122,114,106,.32);pointer-events:none;z-index:2}.quarterOpenOverlay{position:absolute;top:0;height:100%;z-index:1;pointer-events:none;border-left:1px solid rgba(122,114,106,.12)}.quarterOpenOverlay.open{background:#f1f7f2}.quarterOpenOverlay.closed{background:#f1f0ee}
#slots.hourlySlots{display:block!important}.hourSlotGroup{border:1px solid #e7e0d7;border-radius:13px;background:#faf8f5;margin:8px 0;padding:9px}.hourSlotTitle{font-size:14px;font-weight:800;margin-bottom:7px}.hourSlotButtons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.hourQuarter{min-width:0;padding:9px 2px;border:1px solid #ddd5cc;border-radius:10px;background:#fff;font-size:12px;font-weight:700}.hourQuarter.open{background:#eaf3ec;color:#168047}.hourQuarter.closed{background:#eeeeec;color:#8a8580}.hourQuarter.busy{background:#f6dddd;color:#9b4138}
`;
  document.head.appendChild(s);
}

function renamePages(){
  if(isBookings()){
    document.title='整体なかの｜当日予約一覧';
    const p=[...document.querySelectorAll('p')].find(x=>x.textContent.includes('予約一覧・スケジュール'));
    if(p)p.textContent='当日予約一覧・スケジュール';
  }
  document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='予約一覧')b.textContent='当日予約一覧'});
}

function ensureDestinationSlot(){
  const scroll=getScheduleScroll();if(!scroll)return null;
  let slot=$('dragDestinationSlot');if(slot)return slot;
  slot=document.createElement('div');slot.id='dragDestinationSlot';slot.className='dragDestinationSlot';
  slot.innerHTML='<div class="dragDestinationPill"><span class="dragDestinationLabel">変更先</span><span class="dragDestinationTime">--:--</span></div>';
  scroll.insertAdjacentElement('beforebegin',slot);return slot;
}
function showDestination(t){const s=ensureDestinationSlot();if(!s)return;const b=s.querySelector('.dragDestinationTime');if(b)b.textContent=t;s.classList.add('show')}
function hideDestination(){$('dragDestinationSlot')?.classList.remove('show')}

function createGuide(){
  const scroll=getScheduleScroll();if(!scroll||$('bookingOperationGuide'))return;
  const g=document.createElement('div');g.id='bookingOperationGuide';g.className='bookingOperationGuide';
  g.innerHTML=`<div class="bookingOperationShort">予約カード本体：下へ少し動かして左右＝開始時間変更 ／ 右端の ↔ ＝施術時間の伸縮</div><details><summary>操作方法を詳しく見る ▼</summary><div class="bookingOperationDetail">開始時間は予約カードに指を置き、少し下へ動かしてから左右へ移動します。<br>施術時間はカード右端の ↔ をそのまま左右へ動かします。<br>どちらも15分単位です。CLOSE・予約不可・他の予約に重なる変更は保存されません。</div></details><div class="bookingRefreshRow"><span id="bookingRefreshStatus" class="bookingRefreshStatus">自動更新 ON</span><button id="bookingManualRefresh" class="bookingRefreshButton" type="button">↻ 更新</button></div>`;
  scroll.insertAdjacentElement('afterend',g);$('bookingManualRefresh')?.addEventListener('click',()=>location.reload());
}
function createEdges(){if($('dragEdgeLeft'))return;for(const[id,c]of[['dragEdgeLeft','left'],['dragEdgeRight','right']]){const d=document.createElement('div');d.id=id;d.className=`dragEdge ${c}`;document.body.appendChild(d)}}
function hideEdges(){$('dragEdgeLeft')?.classList.remove('show');$('dragEdgeRight')?.classList.remove('show')}

async function fetchBookingById(id,force=false){
  if(!id)throw new Error('予約IDがありません');
  if(!force&&bookingCache.has(id))return bookingCache.get(id);
  const{data,error}=await supabase.from('nakano_bookings').select('*').eq('id',id).single();if(error)throw error;
  bookingCache.set(id,data);return data;
}
function inferDurationFromBlock(el){const d=Number(el.dataset.duration);if(d>0)return d;const w=parseFloat(el.style.width)||el.getBoundingClientRect().width||60;return Math.max(15,Math.round((w/PX_PER_MINUTE)/15)*15)}
function ensureResizeHandle(el){if(el.querySelector('.bookingResizeHandle'))return;const h=document.createElement('span');h.className='bookingResizeHandle';h.title='左右に動かして施術時間を変更';h.setAttribute('aria-label','施術時間を変更');el.appendChild(h)}
async function hydrateBlock(el){
  if(el.dataset.hydrating==='1')return;el.dataset.hydrating='1';ensureResizeHandle(el);
  const id=el.dataset.bookingId;if(!id)return;
  try{
    const b=await fetchBookingById(id);const d=Number(b.minutes)||30;
    el.dataset.duration=String(d);el.dataset.startTime=String(b.start_time).slice(0,5);
    el.style.width=`${Math.max(44,d*PX_PER_MINUTE)}px`;
  }catch(e){console.warn('予約カードの時間取得に失敗',e)}finally{el.dataset.hydrating='0'}
}
function scanBlocks(){document.querySelectorAll('.bookingBlock').forEach(attachBlock)}
function attachBlock(el){
  ensureResizeHandle(el);hydrateBlock(el);
  if(el.dataset.dragUnified)return;el.dataset.dragUnified='1';
  el.addEventListener('pointerdown',e=>pointerDown(e,el));
  el.addEventListener('contextmenu',e=>e.preventDefault());el.addEventListener('dragstart',e=>e.preventDefault());
}

function immediateStateFromBlock(e,el,scroll,mode){
  const text=el.dataset.startTime||el.querySelector('.bookingTime')?.textContent?.trim().slice(0,5)||'';
  const om=timeToMinutes(text);if(!Number.isFinite(om))return null;
  const duration=inferDurationFromBlock(el);
  return{mode,element:el,bookingId:el.dataset.bookingId||'',duration,originalDuration:duration,newDuration:duration,scrollElement:scroll,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,currentX:e.clientX,currentY:e.clientY,startScrollLeft:scroll.scrollLeft,originalMinutes:om,newMinutes:om,originalLeft:(om-DAY_START)*PX_PER_MINUTE,originalTime:text,interacting:false,originGhost:null};
}
function createOriginGhost(s){
  removeOriginGhost(s);const lane=s.element.parentElement;if(!lane)return;
  const g=document.createElement('div');g.className='bookingOriginGhost';g.style.left=`${s.originalLeft}px`;g.style.width=`${Math.max(44,s.originalDuration*PX_PER_MINUTE)}px`;g.innerHTML=`<span>元 ${s.originalTime}・${s.originalDuration}分</span>`;lane.insertBefore(g,s.element);s.originGhost=g;
}
function removeOriginGhost(s){if(s?.originGhost){s.originGhost.remove();s.originGhost=null}}
function startInteraction(s,e){
  s.interacting=true;createOriginGhost(s);s.element.classList.add(s.mode==='resize'?'resizing':'dragging');document.body.classList.add('bookingDragging');
  try{s.element.setPointerCapture(e.pointerId)}catch{}try{navigator.vibrate?.(12)}catch{}
  if(s.mode==='resize')showDestination(`${s.originalTime}–${minutesToTime(s.originalMinutes+s.originalDuration).slice(0,5)}（${s.originalDuration}分）`);else showDestination(s.originalTime);
  stopAutoScroll();autoFrame=requestAnimationFrame(autoScrollLoop);
}
function pointerDown(e,el){
  if(active||(e.pointerType==='mouse'&&e.button!==0))return;const scroll=el.closest('.timelineScroll,.scheduleScroll');if(!scroll)return;
  const mode=e.target.closest('.bookingResizeHandle')?'resize':'move';active=immediateStateFromBlock(e,el,scroll,mode);if(!active)return;
  if(mode==='resize'){e.preventDefault();e.stopPropagation();startInteraction(active,e)}
}
function updateMove(){
  const s=active;if(!s?.interacting)return;const scroll=s.scrollElement,moved=(s.currentX-s.startX+scroll.scrollLeft-s.startScrollLeft)/PX_PER_MINUTE;
  let next=snapMinutes(s.originalMinutes+moved);next=Math.max(DAY_START,Math.min(DAY_END-s.duration,next));s.newMinutes=next;
  s.element.style.left=`${(next-DAY_START)*PX_PER_MINUTE}px`;const label=minutesToTime(next).slice(0,5),box=s.element.querySelector('.bookingTime');if(box)box.textContent=label;showDestination(label);
}
function updateResize(){
  const s=active;if(!s?.interacting)return;const scroll=s.scrollElement,moved=(s.currentX-s.startX+scroll.scrollLeft-s.startScrollLeft)/PX_PER_MINUTE;
  const maxDuration=Math.min(360,DAY_END-s.originalMinutes);let next=snapMinutes(s.originalDuration+moved);next=Math.max(15,Math.min(maxDuration,next));s.newDuration=next;
  s.element.style.width=`${Math.max(44,next*PX_PER_MINUTE)}px`;const end=minutesToTime(s.originalMinutes+next).slice(0,5),box=s.element.querySelector('.bookingTime');if(box)box.textContent=`${s.originalTime}–${end}`;showDestination(`${s.originalTime}–${end}（${next}分）`);
}
function updateActive(){if(active?.mode==='resize')updateResize();else updateMove()}
function pointerMove(e){
  if(!active||active.pointerId!==e.pointerId)return;active.currentX=e.clientX;active.currentY=e.clientY;
  if(active.mode==='resize'){e.preventDefault();updateResize();return}
  const dx=active.currentX-active.startX,dy=active.currentY-active.startY;
  if(!active.interacting){if(dy>=DOWN_TRIGGER&&Math.abs(dx)<=48){e.preventDefault();startInteraction(active,e);return}if(Math.abs(dx)>=HORIZONTAL_CANCEL&&Math.abs(dx)>Math.abs(dy)*1.15){active=null;return}return}
  e.preventDefault();updateMove();
}
function stopAutoScroll(){if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=null}hideEdges()}
function autoScrollLoop(){
  if(!active?.interacting){stopAutoScroll();return}const scroll=active.scrollElement,rect=scroll.getBoundingClientRect(),x=active.currentX,ld=x-rect.left,rd=rect.right-x;let speed=0;hideEdges();
  if(ld<EDGE_ZONE){const p=Math.max(0,Math.min(1,(EDGE_ZONE-ld)/EDGE_ZONE));speed=-(3+p*MAX_AUTO_SPEED);$('dragEdgeLeft')?.classList.add('show')}else if(rd<EDGE_ZONE){const p=Math.max(0,Math.min(1,(EDGE_ZONE-rd)/EDGE_ZONE));speed=3+p*MAX_AUTO_SPEED;$('dragEdgeRight')?.classList.add('show')}
  if(speed){const before=scroll.scrollLeft;scroll.scrollLeft+=speed;if(before!==scroll.scrollLeft)updateActive()}autoFrame=requestAnimationFrame(autoScrollLoop);
}
function cleanupInteraction(s){s.element.classList.remove('dragging','resizing');document.body.classList.remove('bookingDragging');removeOriginGhost(s);hideDestination();stopAutoScroll()}
function restoreCard(s){s.element.style.left=`${s.originalLeft}px`;s.element.style.width=`${Math.max(44,s.originalDuration*PX_PER_MINUTE)}px`;const t=s.element.querySelector('.bookingTime');if(t)t.textContent=s.originalTime}
async function saveNewTime(b,n){
  const nt=minutesToTime(n),ol=String(b.start_time).slice(0,5),nl=nt.slice(0,5);if(ol===nl)return'same';if(!confirm(`${ol} → ${nl} に予約開始時間を変更しますか？`))return false;
  const{error}=await supabase.rpc('nakano_admin_move_booking',{p_booking_id:b.id,p_start_time:nt});if(error){console.error(error);alert('その時間には移動できません。OPEN/CLOSE・予約不可時間・他の予約を確認してください。');return false}return true;
}
async function saveNewDuration(b,n){
  const old=Number(b.minutes)||30;if(old===n)return'same';const start=String(b.start_time).slice(0,5),end=minutesToTime(timeToMinutes(start)+n).slice(0,5);
  if(!confirm(`施術時間を ${old}分 → ${n}分（${start}〜${end}）に変更しますか？`))return false;
  const{error}=await supabase.rpc('nakano_admin_resize_booking',{p_booking_id:b.id,p_minutes:n});if(error){console.error(error);alert('その長さには変更できません。延長先のOPEN/CLOSE・予約不可時間・他の予約を確認してください。');return false}return true;
}
async function pointerUp(e){
  if(!active||active.pointerId!==e.pointerId)return;const s=active;active=null;if(!s.interacting)return;suppressClickUntil=Date.now()+900;cleanupInteraction(s);
  const changed=s.mode==='resize'?s.newDuration!==s.originalDuration:s.newMinutes!==s.originalMinutes;if(!changed){restoreCard(s);return}
  try{const b=await fetchBookingById(s.bookingId,true),r=s.mode==='resize'?await saveNewDuration(b,s.newDuration):await saveNewTime(b,s.newMinutes);if(r===true){setTimeout(()=>location.reload(),160);return}}catch(err){console.error(err);alert('予約情報を確認できませんでした。画面を更新してもう一度お試しください。')}restoreCard(s);
}
function pointerCancel(){if(!active)return;const s=active;active=null;if(s.interacting)restoreCard(s);cleanupInteraction(s)}
document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest('.bookingBlock')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()}},true);

function scrollToCurrentTime(force=false){const scroll=getScheduleScroll(),date=selectedDate();if(!scroll||!date)return;if(date!==todayJapan()){if(force||lastAutoDate!==date){scroll.scrollLeft=0;lastAutoDate=date}return}if(!force&&lastAutoDate===date)return;scroll.scrollLeft=Math.max(0,(currentJapanMinutes()-DAY_START)*PX_PER_MINUTE-scroll.clientWidth/2);lastAutoDate=date}
function setupDateWatch(){const d=$('date');if(!d)return;d.addEventListener('change',()=>{lastAutoDate=null;setTimeout(()=>{scrollToCurrentTime(true);refreshQuarterUI();loadMonthlyBookings()},240)})}
function setupRealtime(){try{realtimeChannel=supabase.channel(`nakano-management-${Date.now()}`);const reload=()=>{clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>{if(!active?.interacting)location.reload()},650)};for(const table of['nakano_bookings','nakano_blocked_times','nakano_open_slots'])realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table},reload);realtimeChannel.subscribe(status=>{const b=$('bookingRefreshStatus');if(!b)return;if(status==='SUBSCRIBED')b.textContent='自動更新 ON';else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')b.textContent='自動更新 再接続待ち'})}catch(e){console.error('Realtime設定エラー',e)}}
function refreshAfterResume(){if(!active?.interacting)location.reload()}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}if(document.visibilityState==='visible'&&hiddenAt&&Date.now()-hiddenAt>1000)refreshAfterResume()});window.addEventListener('pageshow',e=>{if(e.persisted)refreshAfterResume()});window.addEventListener('focus',()=>{if(hiddenAt&&Date.now()-hiddenAt>1500)refreshAfterResume()});

function improveAdminLayout(){
  if(!isAdmin())return;const admin=$('adminArea');if(!admin)return;const cards=[...admin.querySelectorAll(':scope > section.card')];const addCard=cards.find(c=>c.querySelector('#addBooking')),blockCard=cards.find(c=>c.querySelector('#blockedList')),openCard=cards.find(c=>c.querySelector('#slots'));
  if(addCard&&openCard&&addCard.previousElementSibling!==openCard)openCard.insertAdjacentElement('afterend',addCard);
  if(blockCard)ensureBlockedFold(blockCard);
  ensureMonthlyBookingFold();
}
function ensureBlockedFold(blockCard){
  if(blockCard.dataset.foldReady==='1')return;const list=$('blockedList'),h=[...blockCard.querySelectorAll('h3')].find(x=>x.textContent.includes('この月の予約不可一覧'));if(!list||!h)return;
  const hr=h.previousElementSibling;if(hr?.tagName==='HR')hr.remove();const d=document.createElement('details');d.className='blockedFold';d.innerHTML='<summary>この月の予約不可一覧 ▼</summary><div class="blockedFoldInner"></div>';h.replaceWith(d);d.querySelector('.blockedFoldInner').appendChild(list);blockCard.dataset.foldReady='1';
}
function ensureMonthlyBookingFold(){
  if(!isAdmin()||$('monthlyBookingsCard'))return;const admin=$('adminArea'),schedule=$('scheduleScroll')?.closest('section.card');if(!admin||!schedule)return;
  const card=document.createElement('section');card.className='card';card.id='monthlyBookingsCard';card.innerHTML=`<details class="monthlyBookingFold"><summary>今月の予約一覧 <span id="monthlyBookingCount" class="monthlyBookingCount"></span> ▼</summary><div class="monthlyBookingInner"><div id="monthlyBookingList" class="muted">読み込んでいます…</div></div></details>`;schedule.insertAdjacentElement('afterend',card);loadMonthlyBookings();
}
async function loadMonthlyBookings(){
  if(!isAdmin()||!$('monthlyBookingList'))return;const month=$('month')?.value||selectedDate().slice(0,7);if(!month)return;const first=`${month}-01`,next=nextMonth(month);const box=$('monthlyBookingList');box.textContent='読み込んでいます…';
  const{data,error}=await supabase.from('nakano_bookings').select('id,booking_date,start_time,minutes,menu_name,customer_name,status').gte('booking_date',first).lt('booking_date',next).eq('status','confirmed').order('booking_date').order('start_time');
  if(error){box.textContent='予約一覧を読み込めませんでした。';return}const rows=data||[];$('monthlyBookingCount').textContent=`${rows.length}件`;if(!rows.length){box.innerHTML='<span class="muted">この月の予約はありません。</span>';return}
  box.innerHTML=rows.map(b=>`<div class="monthlyBookingRow"><div class="monthlyBookingTime">${esc(b.booking_date.slice(5).replace('-','/'))}　${esc(String(b.start_time).slice(0,5))}〜${esc(minutesToTime(timeToMinutes(b.start_time)+(Number(b.minutes)||30)).slice(0,5))}</div><div>${esc(b.customer_name||'')}　${esc(b.menu_name||'')}　${Number(b.minutes)||30}分</div></div>`).join('');
}

function addQuarterOptions(select){if(!select)return;const opts=[...select.options].filter(o=>o.value);if(opts.length<2)return;const mins=new Set(opts.map(o=>timeToMinutes(o.value)));const additions=[];for(const m of [...mins])if(mins.has(m+30)&&!mins.has(m+15))additions.push(m+15);for(const q of additions){const o=document.createElement('option');o.value=minutesToTime(q);o.textContent=minutesToTime(q).slice(0,5);select.appendChild(o)}const all=[...select.options],first=all.shift();all.sort((a,b)=>(a.value||'').localeCompare(b.value||''));select.replaceChildren(first,...all)}
function addQuarterGuides(){for(const lane of document.querySelectorAll('#scheduleLane,#lane')){if(lane.dataset.quarterGuideReady)return;for(let m=DAY_START+15;m<DAY_END;m+=30){const g=document.createElement('div');g.className='quarterGuide';g.style.left=`${(m-DAY_START)*PX_PER_MINUTE}px`;lane.appendChild(g)}lane.dataset.quarterGuideReady='1'}}
async function fetchDayState(date){const[slots,bookings,blocked]=await Promise.all([supabase.from('nakano_open_slots').select('*').eq('slot_date',date),supabase.from('nakano_bookings').select('*').eq('booking_date',date).eq('status','confirmed'),supabase.from('nakano_blocked_times').select('*').eq('blocked_date',date)]);if(slots.error||bookings.error||blocked.error)throw slots.error||bookings.error||blocked.error;return{slots:slots.data||[],bookings:bookings.data||[],blocked:blocked.data||[]}}
function renderQuarterBackground(slots){
  const map=new Map(slots.map(r=>[String(r.start_time).slice(0,5),!!r.is_open]));for(const lane of document.querySelectorAll('#scheduleLane,#lane')){lane.querySelectorAll('.quarterOpenOverlay').forEach(x=>x.remove());for(let m=DAY_START;m<DAY_END;m+=15){const t=minutesToTime(m).slice(0,5),d=document.createElement('div');d.className=`quarterOpenOverlay ${map.get(t)?'open':'closed'}`;d.style.left=`${(m-DAY_START)*PX_PER_MINUTE}px`;d.style.width=`${15*PX_PER_MINUTE}px`;lane.insertBefore(d,lane.firstChild)}}
}
async function toggleQuarterSlot(time,isOpen){const date=selectedDate();if(!date)return;const{error}=await supabase.from('nakano_open_slots').upsert({slot_date:date,start_time:time,is_open:!isOpen},{onConflict:'slot_date,start_time'});if(error){alert('変更できませんでした。');return}setTimeout(()=>location.reload(),120)}
async function renderAdminQuarterOpenClose(state){
  if(!isAdmin())return;const box=$('slots'),date=selectedDate();if(!box||!date)return;const{slots,bookings,blocked}=state||await fetchDayState(date),slotMap=new Map(slots.map(r=>[String(r.start_time).slice(0,5),r]));
  box.classList.add('hourlySlots');box.innerHTML='';
  for(let hour=8;hour<=22;hour++){
    const group=document.createElement('div');group.className='hourSlotGroup';group.innerHTML=`<div class="hourSlotTitle">${hour}時</div><div class="hourSlotButtons"></div>`;const buttons=group.querySelector('.hourSlotButtons');
    for(const minute of[0,15,30,45]){const total=hour*60+minute;if(total>LAST_VISIBLE_START)continue;const label=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,row=slotMap.get(label),isOpen=!!row?.is_open,slotStart=total,slotEnd=total+15;
      const booking=bookings.find(b=>overlaps(slotStart,slotEnd,timeToMinutes(b.start_time),timeToMinutes(b.start_time)+(Number(b.minutes)||30)));const blockedItem=blocked.find(bt=>{let end=timeToMinutes(bt.end_time);if(String(bt.end_time).startsWith('23:59'))end=24*60;return overlaps(slotStart,slotEnd,timeToMinutes(bt.start_time),end)});const busy=booking||blockedItem;
      const b=document.createElement('button');b.type='button';b.className=`hourQuarter ${busy?'busy':isOpen?'open':'closed'}`;b.innerHTML=`<span class="slotTime">${String(minute).padStart(2,'0')}</span><span class="slotLabel">${booking?'予約':blockedItem?'予定':isOpen?'空き':'CLOSE'}</span>`;
      b.onclick=()=>{if(booking){document.querySelector(`.bookingBlock[data-booking-id="${booking.id}"]`)?.click();return}if(blockedItem)return;toggleQuarterSlot(`${label}:00`,isOpen)};buttons.appendChild(b);
    }
    box.appendChild(group);
  }
  box.dataset.hourUiReady='1';const p=[...box.parentElement.querySelectorAll('p.muted')].find(x=>x.textContent.includes('30分単位')||x.textContent.includes('15分単位'));if(p)p.textContent='15分単位で受付可否を変更できます。';
}
async function refreshQuarterUI(){
  const date=selectedDate();if(!date)return;try{const state=await fetchDayState(date);renderQuarterBackground(state.slots);if(isAdmin())await renderAdminQuarterOpenClose(state)}catch(e){console.warn('15分表示の更新に失敗',e)}
}
async function upsertRows(rows){for(let i=0;i<rows.length;i+=500){const{error}=await supabase.from('nakano_open_slots').upsert(rows.slice(i,i+500),{onConflict:'slot_date,start_time'});if(error)throw error}}
function installQuarterBulkControls(){
  if(!isAdmin())return;
  for(const[id,open]of[['openAll',true],['closeAll',false]]){const b=$(id);if(!b||b.dataset.quarterBulk)return;b.dataset.quarterBulk='1';b.onclick=null;b.addEventListener('click',async()=>{const date=selectedDate();if(!date)return;b.disabled=true;try{await upsertRows(quarterTimes().map(start_time=>({slot_date:date,start_time,is_open:open})));location.reload()}catch(e){console.error(e);alert('一括変更できませんでした。')}finally{b.disabled=false}})}
  for(const[id,open]of[['openMonth',true],['closeMonth',false]]){const b=$(id);if(!b||b.dataset.quarterBulk)return;b.dataset.quarterBulk='1';b.onclick=null;b.addEventListener('click',async()=>{const month=$('month')?.value;if(!month)return;const label=open?'OPEN':'CLOSE';if(!confirm(`${month} を全部${label}にしますか？`))return;b.disabled=true;const msg=$('monthMsg');if(msg)msg.textContent='変更しています…';try{const rows=[];for(const date of monthDates(month))for(const start_time of quarterTimes())rows.push({slot_date:date,start_time,is_open:open});await upsertRows(rows);if(msg)msg.textContent=`${month} を15分単位ですべて${label}にしました。`;setTimeout(()=>location.reload(),180)}catch(e){console.error(e);if(msg)msg.textContent='一括変更できませんでした。'}finally{b.disabled=false}})}
}
function enhanceQuarterTimes(){if(!isAdmin())return;addQuarterOptions($('adminTime'));addQuarterOptions($('editTime'));for(const id of['blockedStart','blockedEnd']){const el=$(id);if(el)el.step='900'}}

function enhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{renamePages();ensureDestinationSlot();createGuide();scanBlocks();scrollToCurrentTime();improveAdminLayout();enhanceQuarterTimes();addQuarterGuides();installQuarterBulkControls();refreshQuarterUI()},90)}

addStyles();createEdges();renamePages();ensureDestinationSlot();createGuide();scanBlocks();setupDateWatch();setupRealtime();
setTimeout(()=>{scrollToCurrentTime(true);improveAdminLayout();enhanceQuarterTimes();addQuarterGuides();installQuarterBulkControls();refreshQuarterUI();loadMonthlyBookings()},500);
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerCancel);
