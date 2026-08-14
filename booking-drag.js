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
  下へこの距離動かすと
  予約移動モード
*/
const DOWN_TRIGGER=20;

/*
  左右端の自動スクロール範囲
*/
const EDGE_ZONE=70;
const MAX_AUTO_SPEED=13;


let active=null;
let autoFrame=null;
let suppressClickUntil=0;

let realtimeChannel=null;
let realtimeTimer=null;

let hiddenAt=0;
let pageEnhanceTimer=null;


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
    Math.floor(minutes/60);

  const m=
    minutes%60;

  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
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


  return `${get('year')}-${get('month')}-${get('day')}`;
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
      )?.value||0
    );


  const minute=
    Number(
      parts.find(
        p=>p.type==='minute'
      )?.value||0
    );


  return hour*60+minute;
}


function selectedDate(){

  return $('date')?.value||'';
}


function getScheduleScroll(){

  return document.querySelector(
    '.timelineScroll,.scheduleScroll'
  );
}


/* =====================================================
   CSS
===================================================== */

function addStyles(){

  if(
    $('nakanoUnifiedBookingStyle')
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
      touch-action:pan-x;
    }

    .bookingBlock.dragging{
      z-index:100!important;
      opacity:.97;

      transform:
        translateY(10px)
        scale(1.035);

      box-shadow:
        0 0 0 3px rgba(97,87,77,.20),
        0 9px 26px rgba(0,0,0,.23);

      transition:none!important;
      touch-action:none!important;
      cursor:grabbing;
    }

    body.bookingDragging{
      overscroll-behavior:none;
    }

    body.bookingDragging .timelineScroll,
    body.bookingDragging .scheduleScroll{
      touch-action:none!important;
      overscroll-behavior:none;
    }


    /* ドラッグ中の時刻 */

    .dragScheduleHint{
      position:fixed;
      z-index:999999;

      min-width:132px;

      transform:
        translate(
          -50%,
          -50%
        );

      background:
        rgba(
          255,
          255,
          255,
          .96
        );

      color:#332f2b;

      border:
        2px solid
        #61574d;

      border-radius:14px;

      padding:
        8px 14px 9px;

      text-align:center;

      box-shadow:
        0 5px 18px
        rgba(0,0,0,.18);

      pointer-events:none;
    }

    .dragScheduleHintLabel{
      display:block;
      font-size:10px;
      color:#766f68;
      line-height:1.2;
    }

    .dragScheduleHintTime{
      display:block;
      margin-top:1px;
      font-size:23px;
      line-height:1.2;
      font-weight:800;
      letter-spacing:.03em;
    }


    /* 端の自動スクロール表示 */

    .dragEdge{
      position:fixed;
      top:0;
      bottom:0;
      width:54px;
      opacity:0;
      z-index:99998;
      pointer-events:none;
      transition:opacity .12s ease;
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


    /* 操作説明 */

    .bookingOperationGuide{
      margin-top:9px;
      padding:10px 11px;

      border:
        1px solid
        #e7e0d7;

      border-radius:12px;

      background:#faf8f5;

      color:#68615b;

      font-size:12px;
      line-height:1.65;
    }

    .bookingOperationShort{
      font-weight:700;
      color:#514b45;
    }

    .bookingOperationGuide details{
      margin-top:5px;
    }

    .bookingOperationGuide summary{
      cursor:pointer;
      list-style:none;
      color:#777069;
      font-size:12px;
    }

    .bookingOperationGuide summary::-webkit-details-marker{
      display:none;
    }

    .bookingOperationDetail{
      padding-top:8px;
      color:#746d67;
      line-height:1.75;
    }

    .bookingRefreshRow{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:8px;
      margin-top:8px;
    }

    .bookingRefreshStatus{
      color:#8a837d;
      font-size:11px;
    }

    .bookingRefreshButton{
      width:auto!important;
      min-width:72px;

      padding:7px 10px;

      border:
        1px solid
        #ddd5cc;

      border-radius:10px;

      background:#fff;
      color:#554e48;

      font-size:12px;
      font-weight:700;
    }

  `;


  document.head.appendChild(
    style
  );
}


/* =====================================================
   表示名
===================================================== */

function renamePages(){

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
    getScheduleScroll();


  if(
    !scroll
    ||
    $('bookingOperationGuide')
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
      予約カード：下へスライド → そのまま左右で時間変更
    </div>

    <details>

      <summary>
        操作方法を詳しく見る ▼
      </summary>

      <div class="bookingOperationDetail">

        予約カードに指を置き、
        少し下へ動かすと移動モードになります。<br>

        指を離さず左右へ動かすと、
        30分単位で予約時間を変更できます。<br>

        移動中はスケジュールの中央に
        変更先の時刻が表示されます。<br>

        指を画面の左右端まで動かすと、
        見えていない時間帯へ
        自動でスクロールします。<br>

        希望の時間で指を離すと
        最終確認が表示されます。<br><br>

        時間軸だけを動かしたい場合は、
        予約カード以外の場所を
        左右へスライドしてください。

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
      ()=>location.reload()
    );
}


/* =====================================================
   時刻表示
===================================================== */

function positionHint(){

  const hint=
    $('dragScheduleHint');


  const scroll=
    active?.scrollElement
    ||
    getScheduleScroll();


  if(
    !hint
    ||
    !scroll
  ){
    return;
  }


  const rect=
    scroll.getBoundingClientRect();


  /*
    白いスケジュール枠の
    見えている領域の中央
  */

  hint.style.left=
    `${rect.left + rect.width/2}px`;


  hint.style.top=
    `${rect.top + rect.height/2}px`;
}


function showHint(time){

  let hint=
    $('dragScheduleHint');


  if(!hint){

    hint=
      document.createElement(
        'div'
      );


    hint.id=
      'dragScheduleHint';


    hint.className=
      'dragScheduleHint';


    hint.innerHTML=`

      <span class="dragScheduleHintLabel">
        変更先
      </span>

      <span class="dragScheduleHintTime"></span>

    `;


    document.body.appendChild(
      hint
    );
  }


  hint
    .querySelector(
      '.dragScheduleHintTime'
    )
    .textContent=
      time;


  positionHint();
}


function hideHint(){

  $('dragScheduleHint')
    ?.remove();
}


/* =====================================================
   エッジ
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
   管理トップ予約ID補完
===================================================== */

async function resolveBookingForBlock(
  block
){

  /*
    当日予約一覧は
    既にIDを持っている
  */
  if(
    block.dataset.bookingId
  ){

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
          block.dataset.bookingId
        )
        .single();


    if(error){
      throw error;
    }


    return data;
  }


  /*
    管理トップは今のHTMLでは
    data-booking-id が無いため
    日付＋時間＋名前＋メニューから特定
  */

  const date=
    selectedDate();


  const time=
    block
      .querySelector(
        '.bookingTime'
      )
      ?.textContent
      ?.trim();


  const name=
    block
      .querySelector(
        '.bookingName'
      )
      ?.textContent
      ?.trim();


  const menu=
    block
      .querySelector(
        '.bookingMenu'
      )
      ?.textContent
      ?.trim();


  if(
    !date
    ||
    !time
  ){

    throw new Error(
      '予約を特定できませんでした'
    );
  }


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
        'booking_date',
        date
      )
      .eq(
        'status',
        'confirmed'
      );


  if(error){
    throw error;
  }


  const booking=
    (data||[])
      .find(
        row=>

          String(
            row.start_time
          )
          .slice(
            0,
            5
          )
          ===
          time

          &&

          String(
            row.customer_name||''
          )
          .trim()
          ===
          name

          &&

          String(
            row.menu_name||''
          )
          .trim()
          ===
          menu
      );


  if(!booking){

    throw new Error(
      '対象の予約を見つけられませんでした'
    );
  }


  /*
    次回から直接取得できるよう
    DOMへIDを追加
  */

  block.dataset.bookingId=
    booking.id;


  return booking;
}


/* =====================================================
   メニュー時間
===================================================== */

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
    data
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


  return Number(
    data?.minutes||30
  );
}


/* =====================================================
   保存
===================================================== */

async function saveNewTime(
  booking,
  newMinutes
){

  const newTime=
    minutesToTime(
      newMinutes
    );


  const oldLabel=
    String(
      booking.start_time
    )
    .slice(
      0,
      5
    );


  const newLabel=
    newTime.slice(
      0,
      5
    );


  if(
    oldLabel===newLabel
  ){

    return 'same';
  }


  if(
    !confirm(
      `${oldLabel} → ${newLabel} に予約時間を変更しますか？`
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
          booking.memo||null

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


  const time=
    state.element.querySelector(
      '.bookingTime'
    );


  if(time){

    time.textContent=
      state.originalTime;
  }
}


function updateCardPosition(){

  if(
    !active?.dragging
  ){
    return;
  }


  const scroll=
    active.scrollElement;


  const fingerMove=
    active.currentX
    -
    active.startX;


  const scrollMove=
    scroll.scrollLeft
    -
    active.startScrollLeft;


  const totalPixels=
    fingerMove
    +
    scrollMove;


  const movedMinutes=
    totalPixels
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
        next-DAY_START
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


  const box=
    active.element
      .querySelector(
        '.bookingTime'
      );


  if(box){

    box.textContent=
      label;
  }


  showHint(
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
    !active?.dragging
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
    x-rect.left;


  const rightDistance=
    rect.right-x;


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

    const power=
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
        power
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

    const power=
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
      power
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
      scroll.scrollLeft
      !==
      before
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


  showHint(
    state.originalTime
  );


  stopAutoScroll();


  autoFrame=
    requestAnimationFrame(
      autoScrollLoop
    );
}


/* =====================================================
   Pointer
===================================================== */

async function pointerDown(
  event,
  element
){

  if(active){
    return;
  }


  const scroll=
    element.closest(
      '.timelineScroll,.scheduleScroll'
    );


  if(!scroll){
    return;
  }


  let booking;


  try{

    booking=
      await resolveBookingForBlock(
        element
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

    scrollElement:
      scroll,

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
      scroll.scrollLeft,

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

    dragging:false

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
    下に動かしたら
    予約移動モード
  */
  if(
    !active.dragging
  ){

    if(
      dy>=DOWN_TRIGGER
      &&
      Math.abs(dx)<=36
    ){

      event.preventDefault();


      startDragging(
        active,
        event
      );


      return;
    }


    /*
      横方向を先に動かしたら
      普通の横スクロール
    */
    if(
      Math.abs(dx)>20
    ){

      active=null;

      return;
    }


    return;
  }


  event.preventDefault();


  updateCardPosition();
}


function cleanupDrag(state){

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


  hideHint();

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

    /*
      管理画面を最新表示に
    */
    setTimeout(
      ()=>location.reload(),
      180
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
   ドラッグ直後の詳細画面誤表示を防止
===================================================== */

document.addEventListener(
  'click',
  event=>{

    if(
      Date.now()
      <
      suppressClickUntil

      &&

      event.target.closest(
        '.bookingBlock'
      )
    ){

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();
    }

  },
  true
);


/* =====================================================
   カード登録
===================================================== */

function attachBlock(block){

  if(
    block.dataset.dragUnified
  ){
    return;
  }


  block.dataset.dragUnified='1';


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
   現在時刻を中央表示
===================================================== */

let lastAutoDate=null;


function scrollToCurrentTime(
  force=false
){

  const scroll=
    getScheduleScroll();


  const date=
    selectedDate();


  if(
    !scroll
    ||
    !date
  ){
    return;
  }


  if(
    date!==todayJapan()
  ){

    if(
      force
      ||
      lastAutoDate!==date
    ){

      scroll.scrollLeft=0;

      lastAutoDate=date;
    }


    return;
  }


  if(
    !force
    &&
    lastAutoDate===date
  ){
    return;
  }


  const now=
    currentJapanMinutes();


  const position=
    (
      now-DAY_START
    )
    *
    PX_PER_MINUTE;


  scroll.scrollLeft=
    Math.max(
      0,
      position
      -
      scroll.clientWidth/2
    );


  lastAutoDate=
    date;
}


function setupDateWatch(){

  const date=
    $('date');


  if(!date){
    return;
  }


  date.addEventListener(
    'change',
    ()=>{

      lastAutoDate=null;


      setTimeout(
        ()=>scrollToCurrentTime(true),
        200
      );
    }
  );
}


/* =====================================================
   Realtime
===================================================== */

function setupRealtime(){

  try{

    realtimeChannel=
      supabase.channel(
        `nakano-management-${Date.now()}`
      );


    const reload=
      ()=>{

        clearTimeout(
          realtimeTimer
        );


        realtimeTimer=
          setTimeout(
            ()=>{

              /*
                操作中は勝手に
                リロードしない
              */
              if(
                active?.dragging
              ){
                return;
              }


              location.reload();

            },
            600
          );
      };


    for(
      const table
      of [
        'nakano_bookings',
        'nakano_blocked_times',
        'nakano_open_slots'
      ]
    ){

      realtimeChannel.on(
        'postgres_changes',
        {
          event:'*',
          schema:'public',
          table
        },
        reload
      );
    }


    realtimeChannel.subscribe(
      status=>{

        const box=
          $('bookingRefreshStatus');


        if(!box){
          return;
        }


        if(
          status==='SUBSCRIBED'
        ){

          box.textContent=
            '自動更新 ON';
        }
        else if(
          status==='CHANNEL_ERROR'
        ){

          box.textContent=
            '自動更新 再接続待ち';
        }

      }
    );

  }
  catch(error){

    console.error(
      'Realtime設定エラー',
      error
    );
  }
}


/* =====================================================
   ホーム画面追加版 / PWA 復帰対策
===================================================== */

function refreshAfterResume(){

  /*
    ドラッグ中は邪魔しない
  */
  if(
    active?.dragging
  ){
    return;
  }


  /*
    復帰時は確実性優先で
    Supabaseから全データを取り直す
  */
  location.reload();
}


document.addEventListener(
  'visibilitychange',
  ()=>{

    if(
      document.visibilityState
      ===
      'hidden'
    ){

      hiddenAt=
        Date.now();

      return;
    }


    if(
      document.visibilityState
      ===
      'visible'
    ){

      /*
        2秒以上バックグラウンドなら
        最新状態へ更新
      */
      if(
        hiddenAt
        &&
        Date.now()-hiddenAt
        >
        2000
      ){

        refreshAfterResume();
      }

    }

  }
);


window.addEventListener(
  'pageshow',
  event=>{

    /*
      iPhoneの戻るキャッシュから
      復帰した場合
    */
    if(
      event.persisted
    ){

      refreshAfterResume();
    }

  }
);


/* =====================================================
   ページ強化
===================================================== */

function enhance(){

  clearTimeout(
    pageEnhanceTimer
  );


  pageEnhanceTimer=
    setTimeout(
      ()=>{

        renamePages();

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

renamePages();

createGuide();

scanBlocks();

setupDateWatch();

setupRealtime();


setTimeout(
  ()=>scrollToCurrentTime(true),
  500
);


new MutationObserver(
  enhance
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
  'resize',
  positionHint
);