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

const DOWN_TRIGGER=24;
const EDGE_ZONE=72;
const MAX_AUTO_SPEED=13;

let active=null;
let autoFrame=null;


function timeToMinutes(time){

  const [h,m]=
    String(time)
      .slice(0,5)
      .split(':')
      .map(Number);

  return h*60+m;
}


function minutesToTime(minutes){

  const h=Math.floor(minutes/60);
  const m=minutes%60;

  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}


function snapMinutes(value){

  return Math.round(
    value/SNAP_MINUTES
  )*SNAP_MINUTES;
}


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

      /*
        横方向は通常の
        スケジュールスクロールを許可
      */
      touch-action:pan-x;
    }


    .bookingBlock.dragging{

      z-index:100!important;

      opacity:.96;

      transform:
        translateY(12px)
        scale(1.035);

      box-shadow:
        0 0 0 3px rgba(97,87,77,.20),
        0 8px 24px rgba(0,0,0,.22);

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

      z-index:99999;

      min-width:190px;

      text-align:center;

      background:#2f2d2a;

      color:#fff;

      padding:
        11px 18px;

      border-radius:14px;

      box-shadow:
        0 6px 22px
        rgba(0,0,0,.24);

      pointer-events:none;

    }


    .dragTopHint .small{

      display:block;

      font-size:11px;

      opacity:.78;

      margin-bottom:2px;

    }


    .dragTopHint .time{

      display:block;

      font-size:24px;

      font-weight:800;

      letter-spacing:.03em;

    }


    .dragEdge{

      position:fixed;

      top:0;

      bottom:0;

      width:54px;

      z-index:9998;

      pointer-events:none;

      opacity:0;

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

  `;

  document.head.appendChild(
    style
  );
}


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


function showHint(time){

  let hint=
    document.getElementById(
      'dragTopHint'
    );

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
      <span class="small">
        変更先
      </span>

      <span class="time"></span>
    `;

    document.body.appendChild(
      hint
    );
  }

  hint
    .querySelector(
      '.time'
    )
    .textContent=
      time;
}


function hideHint(){

  document
    .getElementById(
      'dragTopHint'
    )
    ?.remove();
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
    data?.minutes
    ||
    30
  );
}


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


  window.dispatchEvent(
    new CustomEvent(
      'nakano:booking-updated',
      {
        detail:{
          bookingId:
            booking.id
        }
      }
    )
  );


  return true;
}


function restore(state){

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


function stopAuto(){

  if(autoFrame){

    cancelAnimationFrame(
      autoFrame
    );

    autoFrame=null;
  }


  hideEdges();
}


function cleanup(state){

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

  stopAuto();
}


function updatePosition(){

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
        next-DAY_START
      )
      *
      PX_PER_MINUTE
    }px`;


  const label=
    minutesToTime(
      next
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
      label;
  }


  showHint(
    label
  );
}


function autoLoop(){

  if(
    !active
    ||
    !active.dragging
  ){

    stopAuto();

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


  let speed=
    0;


  const left=
    document.getElementById(
      'dragEdgeLeft'
    );


  const right=
    document.getElementById(
      'dragEdgeRight'
    );


  left
    ?.classList
    .remove(
      'show'
    );


  right
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


    left
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


    right
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

      updatePosition();
    }
  }


  autoFrame=
    requestAnimationFrame(
      autoLoop
    );
}


function armDrag(
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


  showHint(
    state.originalTime
  );


  stopAuto();


  autoFrame=
    requestAnimationFrame(
      autoLoop
    );
}


async function pointerDown(
  event,
  element
){

  if(active){
    return;
  }


  const id=
    element.dataset.bookingId;


  if(!id){
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
        id
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
      ).slice(
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
    予約カードを少し下へ動かすと
    移動モードに入る
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
      28
    ){

      event.preventDefault();


      armDrag(
        active,
        event
      );


      return;
    }


    /*
      横へ動かした場合は
      通常の横スクロール
    */
    if(
      Math.abs(dx)>18
    ){

      active=null;

      return;
    }


    return;
  }


  event.preventDefault();


  updatePosition();
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


  cleanup(
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

    window.dispatchEvent(
      new Event(
        'nakano:refresh-request'
      )
    );


    return;
  }


  restore(
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

    restore(
      state
    );
  }


  cleanup(
    state
  );
}


function attachBlock(block){

  if(
    block.dataset.dragEnhanced
  ){
    return;
  }


  block.dataset.dragEnhanced=
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


addStyles();

createEdges();

scanBlocks();


new MutationObserver(
  scanBlocks
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