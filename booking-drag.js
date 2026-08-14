import {createClient}
from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';


const supabase=createClient(
  'https://scjzofjyxmchfjsngqtb.supabase.co',
  'sb_publishable_EGlr-6w0xh4gD8OImboE_Q_V-COJ7t9'
);


const DAY_START=8*60;
const DAY_END=22*60+30;

const PX_PER_MINUTE=2;
const SNAP_MINUTES=30;

/*
  予約カードを何px下げたら
  移動モードにするか
*/
const DOWN_TRIGGER=22;

/*
  左右端の自動スクロール領域
*/
const EDGE_ZONE=72;

const MAX_AUTO_SPEED=13;


let active=null;

let autoFrame=null;

let suppressClickUntil=0;

let realtimeReloadTimer=null;

let pendingRealtimeReload=false;


/* =====================================================
   共通
===================================================== */

function $(id){

  return document.getElementById(id);

}


function timeToMinutes(time){

  const [h,m]=
    String(time)
      .slice(0,5)
      .split(':')
      .map(Number);


  return h*60+m;
}


function minutesToTime(minutes){

  const h=
    Math.floor(
      minutes/60
    );


  const m=
    minutes%60;


  return `${
    String(h).padStart(2,'0')
  }:${
    String(m).padStart(2,'0')
  }:00`;
}


function snapMinutes(value){

  return Math.round(
    value/SNAP_MINUTES
  )*SNAP_MINUTES;
}


function todayJapan(){

  const parts=
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:'Asia/Tokyo',
        year:'numeric',
        month:'2-digit',
        day:'2-digit'
      }
    )
    .formatToParts(
      new Date()
    );


  const get=
    type=>
      parts.find(
        p=>p.type===type
      )?.value;


  return `${
    get('year')
  }-${
    get('month')
  }-${
    get('day')
  }`;
}


function currentJapanMinutes(){

  const parts=
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:'Asia/Tokyo',
        hour:'2-digit',
        minute:'2-digit',
        hourCycle:'h23'
      }
    )
    .formatToParts(
      new Date()
    );


  const hour=
    Number(
      parts.find(
        p=>p.type==='hour'
      )?.value
      ||
      0
    );


  const minute=
    Number(
      parts.find(
        p=>p.type==='minute'
      )?.value
      ||
      0
    );


  return hour*60+minute;
}


function selectedDate(){

  return $('date')?.value
    ||
    '';
}


/* =====================================================
   CSS
===================================================== */

function addStyles(){

  if(
    document.getElementById(
      'nakanoUnifiedBookingStyle'
    )
  ){
    return;
  }


  const style=
    document.createElement(
      'style'
    );


  style.id=
    'nakanoUnifiedBookingStyle';


  style.textContent=`

    .bookingBlock{

      user-select:none;
      -webkit-user-select:none;

      -webkit-touch-callout:none;

      /*
        普通に横へ動かした時は
        時間軸の横スクロール
      */
      touch-action:pan-x;

    }


    .bookingBlock.dragging{

      z-index:100!important;

      opacity:.97;

      transform:
        translateY(12px)
        scale(1.035);

      box-shadow:
        0 0 0 3px rgba(97,87,77,.20),
        0 9px 26px rgba(0,0,0,.23);

      transition:none!important;

      cursor:grabbing;

      touch-action:none!important;

    }


    body.bookingDragging{

      overscroll-behavior:none;

    }


    body.bookingDragging .timelineScroll,
    body.bookingDragging .scheduleScroll{

      touch-action:none!important;

      overscroll-behavior:none;

    }


    .dragTopHint{

      position:fixed;

      top:
        calc(
          10px
          +
          env(safe-area-inset-top)
        );

      left:50%;

      transform:
        translateX(-50%);

      z-index:999999;

      min-width:190px;

      text-align:center;

      background:#2f2d2a;

      color:#fff;

      padding:10px 19px 11px;

      border-radius:15px;

      box-shadow:
        0 6px 24px
        rgba(0,0,0,.28);

      pointer-events:none;

    }


    .dragTopHintSmall{

      display:block;

      font-size:11px;

      opacity:.76;

      margin-bottom:1px;

    }


    .dragTopHintTime{

      display:block;

      font-size:25px;

      line-height:1.2;

      font-weight:800;

      letter-spacing:.04em;

    }


    .dragEdge{

      position:fixed;

      top:0;

      bottom:0;

      width:56px;

      z-index:99998;

      opacity:0;

      pointer-events:none;

      transition:
        opacity .12s ease;

    }


    .dragEdge.left{

      left:0;

      background:
        linear-gradient(
          to right,
          rgba(97,87,77,.18),
          rgba(97,87,77,0)
        );

    }


    .dragEdge.right{

      right:0;

      background:
        linear-gradient(
          to left,
          rgba(97,87,77,.18),
          rgba(97,87,77,0)
        );

    }


    .dragEdge.show{

      opacity:1;

    }


    .bookingOperationGuide{

      margin-top:10px;

      background:#faf8f5;

      border:
        1px solid
        #e7e0d7;

      border-radius:12px;

      padding:10px 11px;

      color:#665f59;

      font-size:12px;

      line-height:1.65;

    }


    .bookingOperationShort{

      font-weight:700;

      color:#514b45;

    }


    .bookingOperationGuide details{

      margin-top:6px;

    }


    .bookingOperationGuide summary{

      cursor:pointer;

      font-size:12px;

      color:#756d66;

      list-style:none;

    }


    .bookingOperationGuide summary::-webkit-details-marker{

      display:none;

    }


    .bookingOperationDetail{

      padding-top:8px;

      color:#746d67;

      font-size:12px;

      line-height:1.75;

    }


    .bookingRefreshRow{

      display:flex;

      align-items:center;

      justify-content:space-between;

      gap:8px;

      margin-top:8px;

    }


    .bookingRefreshStatus{

      font-size:11px;

      color:#8a837d;

    }


    .bookingRefreshButton{

      width:auto!important;

      min-width:72px;

      border:
        1px solid
        #ddd5cc;

      background:#fff;

      color:#554e48;

      border-radius:10px;

      padding:7px 10px;

      font-size:12px;

      font-weight:700;

    }


    .realtimePending{

      position:fixed;

      right:12px;

      bottom:
        calc(
          18px
          +
          env(safe-area-inset-bottom)
        );

      z-index:99997;

      background:#61574d;

      color:#fff;

      border-radius:999px;

      padding:8px 12px;

      font-size:12px;

      box-shadow:
        0 4px 18px
        rgba(0,0,0,.18);

    }

  `;


  document.head.appendChild(
    style
  );
}


/* =====================================================
   名称変更
===================================================== */

function renameBookingList(){

  /*
    bookings.html
  */
  if(
    location.pathname
      .endsWith(
        '/bookings.html'
      )
  ){

    document.title=
      '整体なかの｜当日予約一覧';


    const subtitle=
      [...document.querySelectorAll('p')]
        .find(
          p=>
            p.textContent
              .includes(
                '予約一覧・スケジュール'
              )
        );


    if(subtitle){

      subtitle.textContent=
        '当日予約一覧・スケジュール';

    }

  }


  /*
    admin.html のボタン
  */
  document
    .querySelectorAll(
      'button'
    )
    .forEach(
      button=>{

        if(
          button.textContent.trim()
          ===
          '予約一覧'
        ){

          button.textContent=
            '当日予約一覧';

        }

      }
    );

}


/* =====================================================
   操作案内
===================================================== */

function createGuide(){

  const scroll=
    document.querySelector(
      '.timelineScroll,.scheduleScroll'
    );


  if(!scroll){
    return;
  }


  if(
    document.getElementById(
      'bookingOperationGuide'
    )
  ){
    return;
  }


  const guide=
    document.createElement(
      'div'
    );


  guide.id=
    'bookingOperationGuide';


  guide.className=
    'bookingOperationGuide';


  guide.innerHTML=`

    <div class="bookingOperationShort">

      予約カード：
      下へスライド →
      そのまま左右で時間変更

    </div>


    <details>

      <summary>

        操作方法を詳しく見る ▼

      </summary>


      <div class="bookingOperationDetail">

        予約カードに指を置き、
        少し下へスライドすると
        移動モードになります。<br>

        指を離さず、
        そのまま左右へ動かすと
        30分単位で予約時間を変更できます。<br>

        移動中は画面上部に
        「変更先 10:30」のように
        時間が表示されます。<br>

        画面の左右端まで動かすと、
        見えていない時間帯へ
        自動でスクロールします。<br>

        希望の時間で指を離すと、
        最後に変更確認が表示されます。<br><br>

        時間軸だけを見たい場合は、
        予約カード以外の場所を
        左右にスライドしてください。

      </div>

    </details>


    <div class="bookingRefreshRow">

      <span
        id="bookingRefreshStatus"
        class="bookingRefreshStatus"
      >
        自動更新 ON
      </span>

      <button
        id="bookingManualRefresh"
        class="bookingRefreshButton"
        type="button"
      >
        ↻ 更新
      </button>

    </div>

  `;


  scroll.insertAdjacentElement(
    'afterend',
    guide
  );


  $('bookingManualRefresh')
    ?.addEventListener(
      'click',
      ()=>{

        location.reload();

      }
    );

}


/* =====================================================
   ドラッグ上部表示
===================================================== */

function showDragHint(time){

  let hint=
    $('dragTopHint');


  if(!hint){

    hint=
      document.createElement(
        'div'
      );


    hint.id=
      'dragTopHint';


    hint.className=
      'dragTopHint';


    hint.innerHTML=`

      <span class="dragTopHintSmall">
        変更先
      </span>

      <span
        class="dragTopHintTime"
      ></span>

    `;


    document.body.appendChild(
      hint
    );

  }


  hint
    .querySelector(
      '.dragTopHintTime'
    )
    .textContent=
      time;
}


function hideDragHint(){

  $('dragTopHint')
    ?.remove();

}


/* =====================================================
   左右端表示
===================================================== */

function createEdges(){

  if(
    $('dragEdgeLeft')
  ){
    return;
  }


  const left=
    document.createElement(
      'div'
    );


  left.id=
    'dragEdgeLeft';


  left.className=
    'dragEdge left';


  document.body.appendChild(
    left
  );


  const right=
    document.createElement(
      'div'
    );


  right.id=
    'dragEdgeRight';


  right.className=
    'dragEdge right';


  document.body.appendChild(
    right
  );

}


function hideEdges(){

  $('dragEdgeLeft')
    ?.classList
    .remove(
      'show'
    );


  $('dragEdgeRight')
    ?.classList
    .remove(
      'show'
    );

}


/* =====================================================
   DB
===================================================== */

async function getBooking(id){

  const {
    data,
    error
  }=
    await supabase
      .from(
        'nakano_bookings'
      )
      .select('*')
      .eq(
        'id',
        id
      )
      .single();


  if(error){

    throw error;

  }


  return data;
}


async function getMenuMinutes(
  booking
){

  if(
    Number(
      booking.minutes
    )>0
  ){

    return Number(
      booking.minutes
    );

  }


  const {
    data,
    error
  }=
    await supabase
      .from(
        'nakano_menus'
      )
      .select(
        'minutes'
      )
      .eq(
        'id',
        booking.menu_id
      )
      .single();


  if(error){

    return 30;

  }


  return Number(
    data?.minutes
    ||
    30
  );

}


/* =====================================================
   予約時間保存
===================================================== */

async function saveNewTime(
  booking,
  newMinutes
){

  const newTime=
    minutesToTime(
      newMinutes
    );


  const oldTime=
    String(
      booking.start_time
    )
    .slice(
      0,
      5
    );


  const nextTime=
    newTime.slice(
      0,
      5
    );


  if(
    oldTime
    ===
    nextTime
  ){

    return 'same';

  }


  if(
    !confirm(
      `${oldTime} → ${nextTime} に予約時間を変更しますか？`
    )
  ){

    return false;

  }


  const {
    error
  }=
    await supabase.rpc(
      'nakano_admin_change_booking',
      {

        p_booking_id:
          booking.id,

        p_date:
          booking.booking_date,

        p_start_time:
          newTime,

        p_menu_id:
          booking.menu_id,

        p_customer_name:
          booking.customer_name,

        p_phone:
          booking.phone,

        p_memo:
          booking.memo
          ||
          null

      }
    );


  if(error){

    console.error(
      error
    );


    alert(
      'その時間には移動できません。空き時間・予約不可時間・他の予約を確認してください。'
    );


    return false;

  }


  return true;
}


/* =====================================================
   カード位置
===================================================== */

function restoreCard(state){

  state.element.style.left=
    `${state.originalLeft}px`;


  const timeBox=
    state.element.querySelector(
      '.bookingTime'
    );


  if(timeBox){

    timeBox.textContent=
      state.originalTime;

  }

}


function updateCardPosition(){

  if(
    !active
    ||
    !active.dragging
  ){

    return;

  }


  const scroll=
    active.scrollElement;


  const pointerDx=
    active.currentX
    -
    active.startX;


  const scrollDx=
    scroll.scrollLeft
    -
    active.startScrollLeft;


  const movedMinutes=
    (
      pointerDx
      +
      scrollDx
    )
    /
    PX_PER_MINUTE;


  let next=
    snapMinutes(
      active.originalMinutes
      +
      movedMinutes
    );


  const latest=
    DAY_END
    -
    active.duration
    +
    30;


  next=
    Math.max(
      DAY_START,
      Math.min(
        latest,
        next
      )
    );


  active.newMinutes=
    next;


  active.element.style.left=
    `${
      (
        next
        -
        DAY_START
      )
      *
      PX_PER_MINUTE
    }px`;


  const label=
    minutesToTime(
      next
    )
    .slice(
      0,
      5
    );


  const timeBox=
    active.element.querySelector(
      '.bookingTime'
    );


  if(timeBox){

    timeBox.textContent=
      label;

  }


  showDragHint(
    label
  );

}


/* =====================================================
   自動横スクロール
===================================================== */

function stopAutoScroll(){

  if(autoFrame){

    cancelAnimationFrame(
      autoFrame
    );


    autoFrame=null;

  }


  hideEdges();

}


function autoScrollLoop(){

  if(
    !active
    ||
    !active.dragging
  ){

    stopAutoScroll();

    return;

  }


  const scroll=
    active.scrollElement;


  const rect=
    scroll
      .getBoundingClientRect();


  const x=
    active.currentX;


  const leftDistance=
    x
    -
    rect.left;


  const rightDistance=
    rect.right
    -
    x;


  let speed=0;


  $('dragEdgeLeft')
    ?.classList
    .remove(
      'show'
    );


  $('dragEdgeRight')
    ?.classList
    .remove(
      'show'
    );


  if(
    leftDistance
    <
    EDGE_ZONE
  ){

    const strength=
      Math.max(
        0,
        Math.min(
          1,
          (
            EDGE_ZONE
            -
            leftDistance
          )
          /
          EDGE_ZONE
        )
      );


    speed=
      -
      (
        3
        +
        strength
        *
        MAX_AUTO_SPEED
      );


    $('dragEdgeLeft')
      ?.classList
      .add(
        'show'
      );

  }
  else if(
    rightDistance
    <
    EDGE_ZONE
  ){

    const strength=
      Math.max(
        0,
        Math.min(
          1,
          (
            EDGE_ZONE
            -
            rightDistance
          )
          /
          EDGE_ZONE
        )
      );


    speed=
      3
      +
      strength
      *
      MAX_AUTO_SPEED;


    $('dragEdgeRight')
      ?.classList
      .add(
        'show'
      );

  }


  if(speed){

    const before=
      scroll.scrollLeft;


    scroll.scrollLeft+=
      speed;


    if(
      before
      !==
      scroll.scrollLeft
    ){

      updateCardPosition();

    }

  }


  autoFrame=
    requestAnimationFrame(
      autoScrollLoop
    );

}


/* =====================================================
   ドラッグ開始
===================================================== */

function startDragging(
  state,
  event
){

  if(
    state.dragging
  ){
    return;
  }


  state.dragging=
    true;


  state.element
    .classList
    .add(
      'dragging'
    );


  document.body
    .classList
    .add(
      'bookingDragging'
    );


  try{

    state.element
      .setPointerCapture(
        event.pointerId
      );

  }
  catch{}


  try{

    navigator.vibrate?.(
      25
    );

  }
  catch{}


  showDragHint(
    state.originalTime
  );


  stopAutoScroll();


  autoFrame=
    requestAnimationFrame(
      autoScrollLoop
    );

}


/* =====================================================
   Pointer操作
===================================================== */

async function pointerDown(
  event,
  element
){

  if(active){
    return;
  }


  const bookingId=
    element.dataset.bookingId;


  if(!bookingId){
    return;
  }


  const scrollElement=
    element.closest(
      '.timelineScroll,.scheduleScroll'
    );


  if(!scrollElement){
    return;
  }


  let booking;


  try{

    booking=
      await getBooking(
        bookingId
      );

  }
  catch(error){

    console.error(
      error
    );

    return;

  }


  const duration=
    await getMenuMinutes(
      booking
    );


  const originalMinutes=
    timeToMinutes(
      booking.start_time
    );


  active={

    element,

    booking,

    duration,

    scrollElement,

    pointerId:
      event.pointerId,

    startX:
      event.clientX,

    startY:
      event.clientY,

    currentX:
      event.clientX,

    currentY:
      event.clientY,

    startScrollLeft:
      scrollElement.scrollLeft,

    originalMinutes,

    newMinutes:
      originalMinutes,

    originalLeft:
      (
        originalMinutes
        -
        DAY_START
      )
      *
      PX_PER_MINUTE,

    originalTime:
      String(
        booking.start_time
      )
      .slice(
        0,
        5
      ),

    dragging:
      false

  };

}


function pointerMove(event){

  if(
    !active
    ||
    active.pointerId
    !==
    event.pointerId
  ){

    return;

  }


  active.currentX=
    event.clientX;


  active.currentY=
    event.clientY;


  const dx=
    active.currentX
    -
    active.startX;


  const dy=
    active.currentY
    -
    active.startY;


  /*
    下方向へ少し動かしたら
    予約移動モード
  */
  if(
    !active.dragging
  ){

    if(
      dy
      >=
      DOWN_TRIGGER

      &&

      Math.abs(dx)
      <=
      32
    ){

      event.preventDefault();


      startDragging(
        active,
        event
      );


      return;

    }


    /*
      先に横へ動かしたら
      普通の横スクロール
    */
    if(
      Math.abs(dx)
      >
      18
    ){

      active=null;

      return;

    }


    return;

  }


  event.preventDefault();


  updateCardPosition();

}


function cleanupDrag(
  state
){

  state.element
    .classList
    .remove(
      'dragging'
    );


  document.body
    .classList
    .remove(
      'bookingDragging'
    );


  hideDragHint();

  stopAutoScroll();

}


async function pointerUp(event){

  if(
    !active
    ||
    active.pointerId
    !==
    event.pointerId
  ){

    return;

  }


  const state=
    active;


  active=null;


  if(
    !state.dragging
  ){

    return;

  }


  suppressClickUntil=
    Date.now()+700;


  cleanupDrag(
    state
  );


  const result=
    await saveNewTime(
      state.booking,
      state.newMinutes
    );


  if(
    result===true
  ){

    setTimeout(
      ()=>{

        location.reload();

      },
      250
    );


    return;

  }


  restoreCard(
    state
  );

}


function pointerCancel(){

  if(!active){
    return;
  }


  const state=
    active;


  active=null;


  if(
    state.dragging
  ){

    restoreCard(
      state
    );

  }


  cleanupDrag(
    state
  );

}


/* =====================================================
   ドラッグ後の誤タップ防止
===================================================== */

document.addEventListener(
  'click',
  event=>{

    if(
      Date.now()
      <
      suppressClickUntil
    ){

      if(
        event.target.closest(
          '.bookingBlock'
        )
      ){

        event.preventDefault();

        event.stopPropagation();

        event.stopImmediatePropagation();

      }

    }

  },
  true
);


/* =====================================================
   予約カードへ機能付与
===================================================== */

function attachBlock(block){

  if(
    block.dataset.dragUnified
  ){
    return;
  }


  block.dataset.dragUnified=
    '1';


  block.addEventListener(
    'pointerdown',
    event=>
      pointerDown(
        event,
        block
      )
  );


  block.addEventListener(
    'contextmenu',
    event=>
      event.preventDefault()
  );


  block.addEventListener(
    'dragstart',
    event=>
      event.preventDefault()
  );

}


function scanBlocks(){

  document
    .querySelectorAll(
      '.bookingBlock'
    )
    .forEach(
      attachBlock
    );

}


/* =====================================================
   現在時刻へ自動スクロール
===================================================== */

let lastAutoScrollDate=null;


function scrollToCurrentTime(
  force=false
){

  const scroll=
    document.querySelector(
      '.timelineScroll,.scheduleScroll'
    );


  if(!scroll){
    return;
  }


  const date=
    selectedDate();


  if(!date){
    return;
  }


  /*
    今日以外は朝側から表示
  */
  if(
    date
    !==
    todayJapan()
  ){

    if(
      force
      ||
      lastAutoScrollDate
      !==
      date
    ){

      scroll.scrollLeft=0;


      lastAutoScrollDate=
        date;

    }


    return;

  }


  if(
    !force
    &&
    lastAutoScrollDate
    ===
    date
  ){

    return;

  }


  const now=
    currentJapanMinutes();


  const position=
    (
      now
      -
      DAY_START
    )
    *
    PX_PER_MINUTE;


  /*
    現在時刻が画面中央付近
  */
  const target=
    Math.max(
      0,
      position
      -
      scroll.clientWidth/2
    );


  scroll.scrollLeft=
    target;


  lastAutoScrollDate=
    date;

}


function setupDateScroll(){

  const date=
    $('date');


  if(!date){
    return;
  }


  date.addEventListener(
    'change',
    ()=>{

      lastAutoScrollDate=null;


      setTimeout(
        ()=>{

          scrollToCurrentTime(
            true
          );

        },
        200
      );

    }
  );

}


/* =====================================================
   リアルタイム自動更新
===================================================== */

function eventMatchesCurrentDate(
  payload,
  dateField
){

  const row=
    payload.new
    ||
    payload.old
    ||
    {};


  const date=
    row[dateField];


  /*
    DELETEなどで日付が取れない時は
    安全側で更新
  */
  if(!date){
    return true;
  }


  return date
    ===
    selectedDate();
}


function editIsOpen(){

  const card=
    $('editCard');


  if(!card){
    return false;
  }


  return !card
    .classList
    .contains(
      'hidden'
    );

}


function showPendingBadge(){

  if(
    $('realtimePending')
  ){
    return;
  }


  const badge=
    document.createElement(
      'div'
    );


  badge.id=
    'realtimePending';


  badge.className=
    'realtimePending';


  badge.textContent=
    '更新あり';


  badge.onclick=
    ()=>location.reload();


  document.body.appendChild(
    badge
  );

}


function scheduleRealtimeReload(){

  clearTimeout(
    realtimeReloadTimer
  );


  realtimeReloadTimer=
    setTimeout(
      ()=>{

        if(
          active?.dragging
          ||
          editIsOpen()
        ){

          pendingRealtimeReload=
            true;


          showPendingBadge();


          return;
        }


        location.reload();

      },
      650
    );

}


function setupRealtime(){

  const channel=
    supabase.channel(
      `nakano-admin-live-${Math.random()}`
    );


  channel.on(
    'postgres_changes',
    {
      event:'*',
      schema:'public',
      table:'nakano_bookings'
    },
    payload=>{

      if(
        eventMatchesCurrentDate(
          payload,
          'booking_date'
        )
      ){

        scheduleRealtimeReload();

      }

    }
  );


  channel.on(
    'postgres_changes',
    {
      event:'*',
      schema:'public',
      table:'nakano_blocked_times'
    },
    payload=>{

      if(
        eventMatchesCurrentDate(
          payload,
          'blocked_date'
        )
      ){

        scheduleRealtimeReload();

      }

    }
  );


  channel.on(
    'postgres_changes',
    {
      event:'*',
      schema:'public',
      table:'nakano_open_slots'
    },
    payload=>{

      if(
        eventMatchesCurrentDate(
          payload,
          'slot_date'
        )
      ){

        scheduleRealtimeReload();

      }

    }
  );


  channel.subscribe(
    status=>{

      const label=
        $('bookingRefreshStatus');


      if(!label){
        return;
      }


      if(
        status
        ===
        'SUBSCRIBED'
      ){

        label.textContent=
          '自動更新 ON';

      }
      else if(
        status
        ===
        'CHANNEL_ERROR'
      ){

        label.textContent=
          '自動更新 接続確認中';

      }

    }
  );

}


/* =====================================================
   編集を閉じた後に保留更新
===================================================== */

function watchEditCard(){

  const card=
    $('editCard');


  if(!card){
    return;
  }


  new MutationObserver(
    ()=>{

      if(
        pendingRealtimeReload

        &&

        card.classList
          .contains(
            'hidden'
          )
      ){

        location.reload();

      }

    }
  )
  .observe(
    card,
    {
      attributes:true,
      attributeFilter:[
        'class'
      ]
    }
  );

}


/* =====================================================
   DOM監視
===================================================== */

let enhanceTimer=null;


function enhancePage(){

  clearTimeout(
    enhanceTimer
  );


  enhanceTimer=
    setTimeout(
      ()=>{

        renameBookingList();

        createGuide();

        scanBlocks();

        scrollToCurrentTime();

      },
      80
    );

}


/* =====================================================
   起動
===================================================== */

addStyles();

createEdges();

renameBookingList();

createGuide();

scanBlocks();

setupDateScroll();

setupRealtime();

watchEditCard();


setTimeout(
  ()=>{

    scrollToCurrentTime(
      true
    );

  },
  600
);


new MutationObserver(
  enhancePage
)
.observe(
  document.body,
  {
    childList:true,
    subtree:true
  }
);


window.addEventListener(
  'pointermove',
  pointerMove,
  {
    passive:false
  }
);


window.addEventListener(
  'pointerup',
  pointerUp
);


window.addEventListener(
  'pointercancel',
  pointerCancel
);


window.addEventListener(
  'pageshow',
  ()=>{

    setTimeout(
      ()=>{

        scrollToCurrentTime(
          true
        );

      },
      250
    );

  }
);