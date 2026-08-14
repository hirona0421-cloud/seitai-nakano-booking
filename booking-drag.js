import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(
  'https://scjzofjyxmchfjsngqtb.supabase.co',
  'sb_publishable_EGlr-6w0xh4gD8OImboE_Q_V-COJ7t9'
);

const DAY_START=8*60;
const DAY_END=22*60+30;
const PX_PER_MINUTE=2;
const SNAP_MINUTES=30;
const DOWN_TRIGGER=10;
const HORIZONTAL_CANCEL=34;
const EDGE_ZONE=72;
const MAX_AUTO_SPEED=13;

let active=null;
let autoFrame=null;
let suppressClickUntil=0;
let realtimeChannel=null;
let realtimeTimer=null;
let hiddenAt=0;
let lastAutoDate=null;
let enhanceTimer=null;

const $=id=>document.getElementById(id);
const getScheduleScroll=()=>document.querySelector('.timelineScroll,.scheduleScroll');
const selectedDate=()=>$('date')?.value||'';

function timeToMinutes(time){
  const [h,m]=String(time).slice(0,5).split(':').map(Number);
  return h*60+m;
}
function minutesToTime(minutes){
  const h=Math.floor(minutes/60),m=minutes%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}
function snapMinutes(v){return Math.round(v/SNAP_MINUTES)*SNAP_MINUTES;}
function todayJapan(){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const g=t=>p.find(x=>x.type===t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function currentJapanMinutes(){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const g=t=>Number(p.find(x=>x.type===t)?.value||0);
  return g('hour')*60+g('minute');
}

function addStyles(){
  if($('nakanoUnifiedBookingStyle'))return;
  const s=document.createElement('style');
  s.id='nakanoUnifiedBookingStyle';
  s.textContent=`
  .bookingBlock{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:pan-x}
  .bookingBlock.dragging{z-index:100!important;opacity:.97;transform:translateY(10px) scale(1.035);box-shadow:0 0 0 3px rgba(97,87,77,.20),0 9px 26px rgba(0,0,0,.23);transition:none!important;touch-action:none!important}
  body.bookingDragging{overscroll-behavior:none}
  body.bookingDragging .timelineScroll,body.bookingDragging .scheduleScroll{touch-action:none!important;overscroll-behavior:none}
  .dragDestinationSlot{height:34px;display:flex;align-items:center;justify-content:center;margin:2px 0 6px;pointer-events:none}
  .dragDestinationPill{opacity:0;transform:translateY(2px);min-width:132px;padding:5px 12px 6px;border:1px solid #cfc4b9;border-radius:11px;background:#fff;color:#332f2b;text-align:center;box-shadow:0 2px 9px rgba(0,0,0,.09);transition:opacity .08s ease,transform .08s ease}
  .dragDestinationSlot.show .dragDestinationPill{opacity:1;transform:translateY(0)}
  .dragDestinationLabel{font-size:10px;color:#77716a;margin-right:6px}.dragDestinationTime{font-size:19px;font-weight:800;letter-spacing:.02em}
  .dragEdge{position:fixed;top:0;bottom:0;width:54px;opacity:0;z-index:99998;pointer-events:none;transition:opacity .12s ease}.dragEdge.left{left:0;background:linear-gradient(to right,rgba(97,87,77,.18),rgba(97,87,77,0))}.dragEdge.right{right:0;background:linear-gradient(to left,rgba(97,87,77,.18),rgba(97,87,77,0))}.dragEdge.show{opacity:1}
  .bookingOperationGuide{margin-top:9px;padding:10px 11px;border:1px solid #e7e0d7;border-radius:12px;background:#faf8f5;color:#68615b;font-size:12px;line-height:1.65}.bookingOperationShort{font-weight:700;color:#514b45}.bookingOperationGuide details{margin-top:5px}.bookingOperationGuide summary{cursor:pointer;list-style:none;color:#777069;font-size:12px}.bookingOperationGuide summary::-webkit-details-marker{display:none}.bookingOperationDetail{padding-top:8px;color:#746d67;line-height:1.75}.bookingRefreshRow{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}.bookingRefreshStatus{color:#8a837d;font-size:11px}.bookingRefreshButton{width:auto!important;min-width:72px;padding:7px 10px;border:1px solid #ddd5cc;border-radius:10px;background:#fff;color:#554e48;font-size:12px;font-weight:700}
  `;
  document.head.appendChild(s);
}

function renamePages(){
  if(location.pathname.endsWith('/bookings.html')){
    document.title='整体なかの｜当日予約一覧';
    const p=[...document.querySelectorAll('p')].find(x=>x.textContent.includes('予約一覧・スケジュール'));
    if(p)p.textContent='当日予約一覧・スケジュール';
  }
  document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='予約一覧')b.textContent='当日予約一覧';});
}

function ensureDestinationSlot(){
  const scroll=getScheduleScroll();
  if(!scroll)return null;
  let slot=$('dragDestinationSlot');
  if(slot)return slot;
  slot=document.createElement('div');
  slot.id='dragDestinationSlot';slot.className='dragDestinationSlot';
  slot.innerHTML='<div class="dragDestinationPill"><span class="dragDestinationLabel">変更先</span><span class="dragDestinationTime">--:--</span></div>';
  scroll.insertAdjacentElement('beforebegin',slot);
  return slot;
}
function showDestination(time){
  const slot=ensureDestinationSlot();if(!slot)return;
  const box=slot.querySelector('.dragDestinationTime');if(box)box.textContent=time;
  slot.classList.add('show');
}
function hideDestination(){$('dragDestinationSlot')?.classList.remove('show');}

function createGuide(){
  const scroll=getScheduleScroll();
  if(!scroll||$('bookingOperationGuide'))return;
  const g=document.createElement('div');g.id='bookingOperationGuide';g.className='bookingOperationGuide';
  g.innerHTML=`<div class="bookingOperationShort">予約カード：少し下へスライド → そのまま左右で時間変更</div><details><summary>操作方法を詳しく見る ▼</summary><div class="bookingOperationDetail">予約カードに指を置き、少し下へ動かすと移動モードになります。<br>指を離さず左右へ動かすと、30分単位で予約時間を変更できます。<br>移動中はスケジュール上部に「変更先 10:00」のように表示されます。<br>左右端へ動かすと、見えていない時間帯へ自動で横スクロールします。<br>希望の時間で指を離すと変更確認が表示されます。<br><br>時間軸だけを動かす場合は、予約カード以外の場所を左右へスライドしてください。</div></details><div class="bookingRefreshRow"><span id="bookingRefreshStatus" class="bookingRefreshStatus">自動更新 ON</span><button id="bookingManualRefresh" class="bookingRefreshButton" type="button">↻ 更新</button></div>`;
  scroll.insertAdjacentElement('afterend',g);
  $('bookingManualRefresh')?.addEventListener('click',()=>location.reload());
}

function createEdges(){
  if($('dragEdgeLeft'))return;
  for(const [id,c] of [['dragEdgeLeft','left'],['dragEdgeRight','right']]){const d=document.createElement('div');d.id=id;d.className=`dragEdge ${c}`;document.body.appendChild(d);}
}
function hideEdges(){$('dragEdgeLeft')?.classList.remove('show');$('dragEdgeRight')?.classList.remove('show');}

function inferDurationFromBlock(block){
  const w=parseFloat(block.style.width)||block.getBoundingClientRect().width||72;
  if(w<=76)return 30;
  return Math.max(30,Math.round((w/PX_PER_MINUTE)/30)*30);
}
function immediateStateFromBlock(event,element,scroll){
  const originalTime=element.querySelector('.bookingTime')?.textContent?.trim()||'';
  const originalMinutes=timeToMinutes(originalTime);
  if(!Number.isFinite(originalMinutes))return null;
  return {element,bookingId:element.dataset.bookingId||'',duration:inferDurationFromBlock(element),scrollElement:scroll,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,currentX:event.clientX,currentY:event.clientY,startScrollLeft:scroll.scrollLeft,originalMinutes,newMinutes:originalMinutes,originalLeft:(originalMinutes-DAY_START)*PX_PER_MINUTE,originalTime,dragging:false};
}
async function fetchBookingById(id){
  if(!id)throw new Error('予約IDがありません');
  const {data,error}=await supabase.from('nakano_bookings').select('*').eq('id',id).single();
  if(error)throw error;return data;
}
async function saveNewTime(booking,newMinutes){
  const newTime=minutesToTime(newMinutes),oldLabel=String(booking.start_time).slice(0,5),newLabel=newTime.slice(0,5);
  if(oldLabel===newLabel)return 'same';
  if(!confirm(`${oldLabel} → ${newLabel} に予約時間を変更しますか？`))return false;
  const {error}=await supabase.rpc('nakano_admin_change_booking',{p_booking_id:booking.id,p_date:booking.booking_date,p_start_time:newTime,p_menu_id:booking.menu_id,p_customer_name:booking.customer_name,p_phone:booking.phone,p_memo:booking.memo||null});
  if(error){console.error(error);alert('その時間には移動できません。空き時間・予約不可時間・他の予約を確認してください。');return false;}
  return true;
}
function restoreCard(s){
  s.element.style.left=`${s.originalLeft}px`;const t=s.element.querySelector('.bookingTime');if(t)t.textContent=s.originalTime;
}
function updateCardPosition(){
  if(!active?.dragging)return;
  const scroll=active.scrollElement;
  const moved=(active.currentX-active.startX+scroll.scrollLeft-active.startScrollLeft)/PX_PER_MINUTE;
  let next=snapMinutes(active.originalMinutes+moved);
  const latest=DAY_END-active.duration+30;
  next=Math.max(DAY_START,Math.min(latest,next));active.newMinutes=next;
  active.element.style.left=`${(next-DAY_START)*PX_PER_MINUTE}px`;
  const label=minutesToTime(next).slice(0,5),box=active.element.querySelector('.bookingTime');if(box)box.textContent=label;
  showDestination(label);
}
function stopAutoScroll(){if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=null;}hideEdges();}
function autoScrollLoop(){
  if(!active?.dragging){stopAutoScroll();return;}
  const scroll=active.scrollElement,rect=scroll.getBoundingClientRect(),x=active.currentX;
  const ld=x-rect.left,rd=rect.right-x;let speed=0;
  hideEdges();
  if(ld<EDGE_ZONE){const p=Math.max(0,Math.min(1,(EDGE_ZONE-ld)/EDGE_ZONE));speed=-(3+p*MAX_AUTO_SPEED);$('dragEdgeLeft')?.classList.add('show');}
  else if(rd<EDGE_ZONE){const p=Math.max(0,Math.min(1,(EDGE_ZONE-rd)/EDGE_ZONE));speed=3+p*MAX_AUTO_SPEED;$('dragEdgeRight')?.classList.add('show');}
  if(speed){const before=scroll.scrollLeft;scroll.scrollLeft+=speed;if(before!==scroll.scrollLeft)updateCardPosition();}
  autoFrame=requestAnimationFrame(autoScrollLoop);
}
function startDragging(s,event){
  s.dragging=true;s.element.classList.add('dragging');document.body.classList.add('bookingDragging');
  try{s.element.setPointerCapture(event.pointerId);}catch{}
  try{navigator.vibrate?.(15);}catch{}
  showDestination(s.originalTime);stopAutoScroll();autoFrame=requestAnimationFrame(autoScrollLoop);
}
function pointerDown(event,element){
  if(active||event.pointerType==='mouse'&&event.button!==0)return;
  const scroll=element.closest('.timelineScroll,.scheduleScroll');if(!scroll)return;
  active=immediateStateFromBlock(event,element,scroll);
}
function pointerMove(event){
  if(!active||active.pointerId!==event.pointerId)return;
  active.currentX=event.clientX;active.currentY=event.clientY;
  const dx=active.currentX-active.startX,dy=active.currentY-active.startY;
  if(!active.dragging){
    if(dy>=DOWN_TRIGGER&&Math.abs(dx)<=48){event.preventDefault();startDragging(active,event);return;}
    if(Math.abs(dx)>=HORIZONTAL_CANCEL&&Math.abs(dx)>Math.abs(dy)*1.15){active=null;return;}
    return;
  }
  event.preventDefault();updateCardPosition();
}
function cleanupDrag(s){s.element.classList.remove('dragging');document.body.classList.remove('bookingDragging');hideDestination();stopAutoScroll();}
async function pointerUp(event){
  if(!active||active.pointerId!==event.pointerId)return;
  const s=active;active=null;if(!s.dragging)return;
  suppressClickUntil=Date.now()+800;cleanupDrag(s);
  if(s.newMinutes===s.originalMinutes){restoreCard(s);return;}
  try{const b=await fetchBookingById(s.bookingId);const r=await saveNewTime(b,s.newMinutes);if(r===true){setTimeout(()=>location.reload(),180);return;}}catch(e){console.error(e);alert('予約情報を確認できませんでした。画面を更新してもう一度お試しください。');}
  restoreCard(s);
}
function pointerCancel(){if(!active)return;const s=active;active=null;if(s.dragging)restoreCard(s);cleanupDrag(s);}

document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest('.bookingBlock')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}},true);

function attachBlock(block){
  if(block.dataset.dragUnified)return;block.dataset.dragUnified='1';
  block.addEventListener('pointerdown',e=>pointerDown(e,block));
  block.addEventListener('contextmenu',e=>e.preventDefault());block.addEventListener('dragstart',e=>e.preventDefault());
}
function scanBlocks(){document.querySelectorAll('.bookingBlock').forEach(attachBlock);}

function scrollToCurrentTime(force=false){
  const scroll=getScheduleScroll(),date=selectedDate();if(!scroll||!date)return;
  if(date!==todayJapan()){if(force||lastAutoDate!==date){scroll.scrollLeft=0;lastAutoDate=date;}return;}
  if(!force&&lastAutoDate===date)return;
  const pos=(currentJapanMinutes()-DAY_START)*PX_PER_MINUTE;
  scroll.scrollLeft=Math.max(0,pos-scroll.clientWidth/2);lastAutoDate=date;
}
function setupDateWatch(){const d=$('date');if(!d)return;d.addEventListener('change',()=>{lastAutoDate=null;setTimeout(()=>scrollToCurrentTime(true),220);});}

function setupRealtime(){
  try{
    realtimeChannel=supabase.channel(`nakano-management-${Date.now()}`);
    const reload=()=>{clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>{if(!active?.dragging)location.reload();},650);};
    for(const table of ['nakano_bookings','nakano_blocked_times','nakano_open_slots'])realtimeChannel.on('postgres_changes',{event:'*',schema:'public',table},reload);
    realtimeChannel.subscribe(status=>{const b=$('bookingRefreshStatus');if(!b)return;if(status==='SUBSCRIBED')b.textContent='自動更新 ON';else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')b.textContent='自動更新 再接続待ち';});
  }catch(e){console.error('Realtime設定エラー',e);}
}
function refreshAfterResume(){if(!active?.dragging)location.reload();}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hiddenAt=Date.now();return;}if(document.visibilityState==='visible'&&hiddenAt&&Date.now()-hiddenAt>1000)refreshAfterResume();});
window.addEventListener('pageshow',e=>{if(e.persisted)refreshAfterResume();});
window.addEventListener('focus',()=>{if(hiddenAt&&Date.now()-hiddenAt>1500)refreshAfterResume();});

function enhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>{renamePages();ensureDestinationSlot();createGuide();scanBlocks();scrollToCurrentTime();},60);}

addStyles();createEdges();renamePages();ensureDestinationSlot();createGuide();scanBlocks();setupDateWatch();setupRealtime();
setTimeout(()=>scrollToCurrentTime(true),450);
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
window.addEventListener('pointermove',pointerMove,{passive:false});
window.addEventListener('pointerup',pointerUp);
window.addEventListener('pointercancel',pointerCancel);
