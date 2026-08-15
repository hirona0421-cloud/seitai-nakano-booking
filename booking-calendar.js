import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(
  'https://scjzofjyxmchfjsngqtb.supabase.co',
  'sb_publishable_EGlr-6w0xh4gD8OImboE_Q_V-COJ7t9'
);

const $=id=>document.getElementById(id);
let menus=[];
let activeMenuId='';
let viewMonth='';
let monthData=[];
let loadingToken=0;

function todayJapan(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const g=t=>parts.find(x=>x.type===t)?.value||'';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function currentMonth(){return todayJapan().slice(0,7)}
function monthLabel(month){const[y,m]=month.split('-').map(Number);return `${y}年${m}月`}
function addMonths(month,n){const[y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function daysInMonth(month){const[y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()}
function weekdayOfFirst(month){return new Date(`${month}-01T00:00:00Z`).getUTCDay()}
function isoDate(month,day){return `${month}-${String(day).padStart(2,'0')}`}
function formatShortDate(s){const[y,m,d]=s.split('-').map(Number);return new Intl.DateTimeFormat('ja-JP',{timeZone:'UTC',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(Date.UTC(y,m-1,d)))}

function addStyles(){
  if($('bookingCalendarStyle'))return;
  const s=document.createElement('style');
  s.id='bookingCalendarStyle';
  s.textContent=`
.bookingCalendar{margin-top:10px;border:1px solid #e7e0d7;border-radius:15px;background:#faf8f5;overflow:hidden}
.bookingCalendarHeader{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:6px;padding:10px;border-bottom:1px solid #e7e0d7;background:#fff}
.bookingCalendarNav{height:38px;border:1px solid #ddd5cc;border-radius:10px;background:#fff;color:#514b45;font-weight:800}
.bookingCalendarMonth{text-align:center;font-size:16px;font-weight:800}
.bookingCalendarLegend{display:flex;flex-wrap:wrap;gap:10px;padding:9px 10px 0;color:#77716a;font-size:11px}
.bookingCalendarWeek,.bookingCalendarGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;padding-left:8px;padding-right:8px}
.bookingCalendarWeek{padding-top:9px;text-align:center;color:#8a837d;font-size:10px}
.bookingCalendarGrid{padding-top:6px;padding-bottom:10px}
.bookingCalendarBlank{min-height:58px}
.bookingCalendarDay{min-width:0;min-height:58px;padding:5px 2px;border:1px solid #e2dbd3;border-radius:10px;background:#fff;color:#3f3a35;text-align:center}
.bookingCalendarDay:disabled{opacity:.42;background:#f1efec}
.bookingCalendarDay.selected{border-color:#61574d;box-shadow:0 0 0 1px #61574d inset;background:#eee7df}
.bookingCalendarDate{display:block;font-size:13px;font-weight:800;line-height:1.1}
.bookingCalendarMark{display:block;margin-top:4px;font-size:16px;font-weight:900;line-height:1}
.bookingCalendarCount{display:block;margin-top:2px;font-size:8px;color:#8c847d;line-height:1.1}
.bookingCalendarDay.good .bookingCalendarMark{color:#26734b}.bookingCalendarDay.few .bookingCalendarMark{color:#9a711b}.bookingCalendarDay.none .bookingCalendarMark{color:#9a6a64}
.bookingCalendarStatus{padding:0 10px 10px;color:#77716a;font-size:11px;line-height:1.6}
.bookingCalendarNearest{margin:0 10px 10px;padding:9px 10px;border-radius:10px;background:#fff;color:#5b544d;font-size:12px;line-height:1.5}
.bookingCalendarNativeHint{margin-top:8px;color:#8a837d;font-size:11px}
@media(max-width:380px){.bookingCalendarDay{min-height:54px}.bookingCalendarGrid,.bookingCalendarWeek{gap:4px;padding-left:6px;padding-right:6px}}
`;
  document.head.appendChild(s);
}

function ensureCalendar(){
  const date=$('date');
  if(!date||$('bookingAvailabilityCalendar'))return;
  const wrap=document.createElement('div');
  wrap.id='bookingAvailabilityCalendar';
  wrap.className='bookingCalendar';
  wrap.innerHTML=`
    <div class="bookingCalendarHeader">
      <button class="bookingCalendarNav" id="calendarPrev" type="button">‹</button>
      <div class="bookingCalendarMonth" id="calendarMonthLabel"></div>
      <button class="bookingCalendarNav" id="calendarNext" type="button">›</button>
    </div>
    <div class="bookingCalendarLegend"><span>○ 空きあり</span><span>△ 残り少なめ</span><span>× 空きなし</span></div>
    <div class="bookingCalendarWeek"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>
    <div class="bookingCalendarGrid" id="calendarGrid"></div>
    <div class="bookingCalendarStatus" id="calendarStatus">メニューを選ぶと空き状況が表示されます。</div>
    <div class="bookingCalendarNearest hidden" id="calendarNearest"></div>
  `;
  date.insertAdjacentElement('afterend',wrap);
  const hint=document.createElement('div');
  hint.className='bookingCalendarNativeHint';
  hint.textContent='日付は上のカレンダーから選べます。';
  wrap.insertAdjacentElement('afterend',hint);

  $('calendarPrev').onclick=()=>{viewMonth=addMonths(viewMonth,-1);loadMonth()};
  $('calendarNext').onclick=()=>{viewMonth=addMonths(viewMonth,1);loadMonth()};
  date.addEventListener('change',()=>{
    if(date.value)viewMonth=date.value.slice(0,7);
    renderCalendar();
  });
}

async function loadMenus(){
  const{data,error}=await supabase.from('nakano_menus').select('id,display_order,is_active').eq('is_active',true).order('display_order');
  if(error){console.error(error);return}
  menus=data||[];
  bindMenuButtons();
}

function bindMenuButtons(){
  const buttons=[...document.querySelectorAll('#menus .menu')];
  if(!buttons.length||!menus.length)return;
  buttons.forEach((b,i)=>{
    const menu=menus[i];
    if(!menu)return;
    b.dataset.calendarMenuId=menu.id;
    if(b.dataset.calendarBound==='1')return;
    b.dataset.calendarBound='1';
    b.addEventListener('click',()=>{
      activeMenuId=b.dataset.calendarMenuId||'';
      const date=$('date')?.value;
      viewMonth=(date?date.slice(0,7):currentMonth());
      loadMonth();
    });
  });

  const active=document.querySelector('#menus .menu.active');
  if(active?.dataset.calendarMenuId&&activeMenuId!==active.dataset.calendarMenuId){
    activeMenuId=active.dataset.calendarMenuId;
    loadMonth();
  }
}

async function loadMonth(){
  ensureCalendar();
  if(!viewMonth)viewMonth=$('date')?.value?.slice(0,7)||currentMonth();
  $('calendarMonthLabel').textContent=monthLabel(viewMonth);

  if(!activeMenuId){
    monthData=[];
    renderCalendar();
    $('calendarStatus').textContent='メニューを選ぶと空き状況が表示されます。';
    $('calendarNearest').classList.add('hidden');
    return;
  }

  const token=++loadingToken;
  $('calendarStatus').textContent='空き状況を確認しています…';
  $('calendarNearest').classList.add('hidden');
  const{data,error}=await supabase.rpc('nakano_month_availability',{p_month:`${viewMonth}-01`,p_menu_id:activeMenuId});
  if(token!==loadingToken)return;
  if(error){
    console.error(error);
    monthData=[];
    renderCalendar();
    $('calendarStatus').textContent='空き状況を読み込めませんでした。日付入力からも選択できます。';
    return;
  }
  monthData=data||[];
  renderCalendar();
  $('calendarStatus').textContent='空きのある日をタップすると、予約できる時間が表示されます。';

  const nearest=monthData.find(r=>Number(r.available_count)>0&&r.first_time);
  if(nearest){
    $('calendarNearest').textContent=`この月の直近の空き：${formatShortDate(nearest.slot_date)} ${String(nearest.first_time).slice(0,5)}〜`;
    $('calendarNearest').classList.remove('hidden');
  }
}

function renderCalendar(){
  ensureCalendar();
  if(!viewMonth)viewMonth=currentMonth();
  $('calendarMonthLabel').textContent=monthLabel(viewMonth);
  const box=$('calendarGrid');
  if(!box)return;
  box.innerHTML='';
  const map=new Map(monthData.map(r=>[r.slot_date,r]));
  const first=weekdayOfFirst(viewMonth);
  for(let i=0;i<first;i++){
    const blank=document.createElement('span');blank.className='bookingCalendarBlank';box.appendChild(blank);
  }
  const today=todayJapan();
  const selected=$('date')?.value||'';
  for(let day=1;day<=daysInMonth(viewMonth);day++){
    const iso=isoDate(viewMonth,day);
    const row=map.get(iso);
    const count=Number(row?.available_count||0);
    const past=iso<today;
    const b=document.createElement('button');
    b.type='button';
    b.className='bookingCalendarDay';
    if(iso===selected)b.classList.add('selected');
    let mark='×',kind='none';
    if(count>=4){mark='○';kind='good'}else if(count>=1){mark='△';kind='few'}
    b.classList.add(kind);
    b.innerHTML=`<span class="bookingCalendarDate">${day}</span><span class="bookingCalendarMark">${past?'':mark}</span><span class="bookingCalendarCount">${past?'':count?`${count}枠`:'空きなし'}</span>`;
    b.disabled=past||!activeMenuId||count===0;
    b.onclick=()=>{
      const date=$('date');
      if(!date)return;
      date.value=iso;
      date.dispatchEvent(new Event('change',{bubbles:true}));
      renderCalendar();
      setTimeout(()=>document.querySelector('#slots')?.closest('.card')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    };
    box.appendChild(b);
  }
}

function observeMenus(){
  const menuBox=$('menus');
  if(!menuBox)return;
  new MutationObserver(()=>bindMenuButtons()).observe(menuBox,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
}

function setupNewBookingReset(){
  $('newBooking')?.addEventListener('click',()=>{
    activeMenuId='';
    monthData=[];
    viewMonth=currentMonth();
    setTimeout(()=>{bindMenuButtons();loadMonth()},60);
  });
}

async function start(){
  if(new URLSearchParams(location.search).get('manage'))return;
  addStyles();
  ensureCalendar();
  viewMonth=$('date')?.value?.slice(0,7)||currentMonth();
  renderCalendar();
  observeMenus();
  setupNewBookingReset();
  await loadMenus();
  setTimeout(bindMenuButtons,200);
}

start();
