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
  長押し判定
*/
const LONG_PRESS_MS=350;

/*
  端から何px以内で
  自動スクロールを始めるか
*/
const EDGE_ZONE=70;

/*
  自動スクロール最大速度
  1フレームあたりpx
*/
const MAX_AUTO_SPEED=12;


let active=null;
let autoScrollFrame=null;


/* =====================================================
   共通
===================================================== */

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


/* =====================================================
   CSS追加
===================================================== */

function addStyles(){

  if(
    document.getElementById(
      'nakanoDragStyle'
    )
  ){
    return;
  }


  const style=
    document.createElement(
      'style'
    );


  style.id=
    'nakanoDragStyle';


  style.textContent=`

    .bookingBlock{

      user-select:none;
      -webkit-user-select:none;

      -webkit-touch-callout:none;

    }


    .bookingBlock.dragArmed{

      z-index:100!important;

      transform:scale(1.035);

      opacity:.96;

      box-shadow:
        0 0 0 3px rgba(97,87,77,.20),
        0 8px 24px rgba(0,0,0,.22);

      transition:
        transform .12s ease,
        box-shadow .12s ease;

    }


    .bookingBlock.dragging{

      z-index:100!important;

      transition:none!important;

      cursor:grabbing;

    }


    body.bookingDragging{

      overscroll-behavior:none;

    }


    body.bookingDragging .timelineScroll{

      touch-action:none!important;

      overscroll-behavior:none;

    }


    .dragHint{

      position:fixed;

      left:50%;

      bottom:
        calc(
          24px
          +
          env(safe-area-inset-bottom)
        );

      transform:
        translateX(-50%);

      z-index:99999;

      background:#2f2d2a;

      color:#fff;

      padding:
        11px 16px;

      border-radius:
        999px;

      font-size:13px;

      font-weight:700;

      white-space:nowrap;

      box-shadow:
        0 5px 20px
        rgba(0,0,0,.25);

      pointer-events:none;

    }


    .dragEdge{

      position:fixed;

      top:0;

      bottom:0;

      width:52px;

      z-index:9998;

      pointer-events:none;

      opacity:0;

      transition:opacity .15s ease;

    }


    .dragEdge.left{

      left:0;

      background:
        linear-gradient(
          to right,
          rgba(97,87,77,.16),
          rgba(97,87,77,0)
        );

    }


    .dragEdge.right{

      right:0;

      background:
        linear-gradient(
          to left,
          rgba(97,87,77,.16),
          rgba(97,87,77,0)
        );

    }


    .dragEdge.show{

      opacity:1;

    }

  `;


  document.head.appendChild(
    style
  );
}


/* =====================================================
   ヒント
===================================================== */

function showHint(text){

  let hint=
    document.getElementById(
      'dragHint'
    );


  if(!hint){

    hint=
      document.createElement(
        'div'
      );


    hint.id=
      'dragHint';


    hint.className=
      'dragHint';


    document.body.appendChild(
      hint
    );

  }


  hint.textContent=
    text;
}


function hideHint(){

  document
    .getElementById(
      'dragHint'
    )
    ?.remove();
}


/* =====================================================
   端の表示
===================================================== */

function createEdges(){

  if(
    document.getElementById(
      'dragEdgeLeft'
    )
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

  document
    .getElementById(
      'dragEdgeLeft'
    )
    ?.classList
    .remove(
      'show'
    );


  document
    .getElementById(
      'dragEdgeRight'
    )
    ?.classList
    .remove(
      'show'
    );
}


/* =====================================================
   DB
===================================================== */

async function getBooking(bookingId){

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
        bookingId
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
   時刻保存
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
    ).slice(
      0,
      5
    );


  const displayNew=
    newTime.slice(
      0,
      5
    );


  if(
    oldTime
    ===
    displayNew
  ){

    return true;
  }


  if(
    !confirm(
      `${oldTime} → ${displayNew} に予約時間を変更しますか？`
    )
  ){

    return false;
  }


  const {error}=
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
   カード位置更新
===================================================== */

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


  /*
    指の移動量
  */
  const pointerDifference=
    active.currentX
    -
    active.startX;


  /*
    ドラッグ開始後に
    スクロールした量
  */
  const scrollDifference=
    scroll.scrollLeft
    -
    active.startScrollLeft;


  /*
    指移動＋自動スクロール
    の両方を時間に反映
  */
  const totalPixels=
    pointerDifference
    +
    scrollDifference;


  const movedMinutes=
    totalPixels
    /
    PX_PER_MINUTE;


  let newMinutes=
    snapMinutes(
      active.originalMinutes
      +
      movedMinutes
    );


  /*
    予約が営業時間外に
    はみ出さないようにする
  */
  const latestStart=
    DAY_END
    -
    active.duration
    +
    30;


  newMinutes=
    Math.max(
      DAY_START,
      Math.min(
        latestStart,
        newMinutes
      )
    );


  active.newMinutes=
    newMinutes;


  const newLeft=
    (
      newMinutes
      -
      DAY_START
    )
    *
    PX_PER_MINUTE;


  active.element.style.left=
    `${newLeft}px`;


  const text=
    minutesToTime(
      newMinutes
    ).slice(
      0,
      5
    );


  const timeBox=
    active.element.querySelector(
      '.bookingTime'
    );


  if(timeBox){

    timeBox.textContent=
      text;
  }


  showHint(
    `変更先 ${text}`
  );
}


/* =====================================================
   自動スクロール
===================================================== */

function stopAutoScroll(){

  if(
    autoScrollFrame
  ){

    cancelAnimationFrame(
      autoScrollFrame
    );


    autoScrollFrame=
      null;
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
    scroll.getBoundingClientRect();


  const x=
    active.currentX;


  let speed=
    0;


  const leftDistance=
    x
    -
    rect.left;


  const rightDistance=
    rect.right
    -
    x;


  const leftEdge=
    document.getElementById(
      'dragEdgeLeft'
    );


  const rightEdge=
    document.getElementById(
      'dragEdgeRight'
    );


  leftEdge
    ?.classList
    .remove(
      'show'
    );


  rightEdge
    ?.classList
    .remove(
      'show'
    );


  /*
    左端
  */
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


    leftEdge
      ?.classList
      .add(
        'show'
      );

  }


  /*
    右端
  */
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


    rightEdge
      ?.classList
      .add(
        'show'
      );

  }


  if(
    speed!==0
  ){

    const before=
      scroll.scrollLeft;


    scroll.scrollLeft+=
      speed;


    /*
      実際にスクロールしたら
      カード位置も更新
    */
    if(
      scroll.scrollLeft
      !==
      before
    ){

      updateCardPosition();
    }

  }


  autoScrollFrame=
    requestAnimationFrame(
      autoScrollLoop
    );
}


/* =====================================================
   元位置へ戻す
===================================================== */

function restoreOriginal(
  state
){

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


/* =====================================================
   状態解除
===================================================== */

function cleanupState(
  state
){

  clearTimeout(
    state.timer
  );


  state.element
    .classList
    .remove(
      'dragArmed',
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


/* =====================================================
   キャンセル
===================================================== */

function cancelDrag(){

  if(!active){
    return;
  }


  const state=
    active;


  active=null;


  restoreOriginal(
    state
  );


  cleanupState(
    state
  );
}


/* =====================================================
   ドラッグ完了
===================================================== */

async function finishDrag(){

  if(!active){
    return;
  }


  const state=
    active;


  active=null;


  cleanupState(
    state
  );


  if(
    !state.dragging
  ){

    return;
  }


  const success=
    await saveNewTime(
      state.booking,
      state.newMinutes
    );


  if(success){

    location.reload();

    return;
  }


  restoreOriginal(
    state
  );
}


/* =====================================================
   長押し開始
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
      '.timelineScroll'
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


  const originalLeft=
    (
      originalMinutes
      -
      DAY_START
    )
    *
    PX_PER_MINUTE;


  const state={

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

    originalLeft,

    originalMinutes,

    newMinutes:
      originalMinutes,

    originalTime:
      String(
        booking.start_time
      ).slice(
        0,
        5
      ),

    dragging:
      false,

    timer:
      null

  };


  active=
    state;


  /*
    長押し判定
  */
  state.timer=
    setTimeout(
      ()=>{

        if(
          active
          !==
          state
        ){
          return;
        }


        state.dragging=
          true;


        element
          .classList
          .add(
            'dragArmed',
            'dragging'
          );


        document.body
          .classList
          .add(
            'bookingDragging'
          );


        /*
          指をカードに固定
        */
        try{

          element.setPointerCapture(
            state.pointerId
          );

        }
        catch{}


        /*
          対応端末では軽く振動
        */
        try{

          navigator.vibrate?.(
            25
          );

        }
        catch{}


        showHint(
          `${state.originalTime}　そのまま左右へ移動`
        );


        stopAutoScroll();


        autoScrollFrame=
          requestAnimationFrame(
            autoScrollLoop
          );

      },
      LONG_PRESS_MS
    );
}


/* =====================================================
   指移動
===================================================== */

function pointerMove(
  event
){

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
    長押し成立前

    大きく動いたら
    普通の横スクロールとして扱う
  */
  if(
    !active.dragging
  ){

    if(
      Math.abs(dx)>18
      ||
      Math.abs(dy)>18
    ){

      clearTimeout(
        active.timer
      );


      active=null;
    }


    return;
  }


  /*
    長押し成立後は
    ブラウザのスクロールを止める
  */
  event.preventDefault();


  updateCardPosition();
}


/* =====================================================
   指を離した
===================================================== */

function pointerUp(
  event
){

  if(
    !active
    ||
    active.pointerId
    !==
    event.pointerId
  ){

    return;
  }


  finishDrag();
}


/* =====================================================
   予約カードへ機能追加
===================================================== */

function attachBlock(
  block
){

  if(
    block.dataset.dragEnhanced
  ){
    return;
  }


  block.dataset.dragEnhanced=
    '1';


  block.addEventListener(
    'pointerdown',
    event=>{

      pointerDown(
        event,
        block
      );

    }
  );


  /*
    iPhone長押しメニュー防止
  */
  block.addEventListener(
    'contextmenu',
    event=>{

      event.preventDefault();

    }
  );


  block.addEventListener(
    'dragstart',
    event=>{

      event.preventDefault();

    }
  );
}


/* =====================================================
   予約カード監視
===================================================== */

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
   起動
===================================================== */

addStyles();

createEdges();

scanBlocks();


const observer=
  new MutationObserver(
    ()=>{

      scanBlocks();

    }
  );


observer.observe(
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
  ()=>{

    /*
      iPhone側で操作が
      キャンセルされた場合
    */
    cancelDrag();

  }
);