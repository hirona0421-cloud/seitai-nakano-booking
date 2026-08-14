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
const LONG_PRESS_MS=450;

let active=null;

function timeToMinutes(time){
  const [h,m]=String(time)
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
    document.createElement('style');

  style.id=
    'nakanoDragStyle';

  style.textContent=`

    .bookingBlock{
      user-select:none;
      -webkit-user-select:none;
    }

    .bookingBlock.dragReady{
      box-shadow:
        0 0 0 3px rgba(97,87,77,.18),
        0 6px 18px rgba(0,0,0,.16);
    }

    .bookingBlock.dragging{
      z-index:50!important;
      opacity:.92;
      cursor:grabbing;
      transition:none!important;
    }

    .dragHint{
      position:fixed;
      left:50%;
      bottom:26px;
      transform:translateX(-50%);
      z-index:9999;
      background:#2f2d2a;
      color:#fff;
      padding:10px 14px;
      border-radius:999px;
      font-size:13px;
      box-shadow:0 4px 18px rgba(0,0,0,.2);
      pointer-events:none;
    }

  `;

  document.head.appendChild(
    style
  );
}

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

  hint.textContent=text;
}

function hideHint(){

  document
    .getElementById(
      'dragHint'
    )
    ?.remove();
}

async function getBooking(
  bookingId
){

  const {data,error}=
    await supabase
      .from('nakano_bookings')
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

  const {data,error}=
    await supabase
      .from('nakano_menus')
      .select('minutes')
      .eq(
        'id',
        booking.menu_id
      )
      .single();

  if(error){
    return 30;
  }

  return Number(
    data?.minutes||30
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
    ).slice(0,5);

  const displayNew=
    newTime.slice(0,5);

  if(
    oldTime===displayNew
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

function cancelDrag(){

  if(!active){
    return;
  }

  clearTimeout(
    active.timer
  );

  active.element
    .classList
    .remove(
      'dragReady',
      'dragging'
    );

  active.element.style.left=
    `${active.originalLeft}px`;

  const timeBox=
    active.element.querySelector(
      '.bookingTime'
    );

  if(timeBox){
    timeBox.textContent=
      active.originalTime;
  }

  hideHint();

  active=null;
}

async function finishDrag(){

  if(!active){
    return;
  }

  clearTimeout(
    active.timer
  );

  const state=
    active;

  active=null;

  state.element
    .classList
    .remove(
      'dragReady',
      'dragging'
    );

  hideHint();

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

  let booking;

  try{

    booking=
      await getBooking(
        bookingId
      );

  }
  catch(error){

    console.error(error);

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
      originalMinutes-DAY_START
    )
    *
    PX_PER_MINUTE;

  const state={
    element,
    booking,
    duration,
    pointerId:
      event.pointerId,

    startX:
      event.clientX,

    originalLeft,

    originalMinutes,

    newMinutes:
      originalMinutes,

    originalTime:
      String(
        booking.start_time
      ).slice(0,5),

    dragging:false,

    timer:null
  };

  active=state;

  state.timer=
    setTimeout(
      ()=>{

        if(
          active!==state
        ){
          return;
        }

        state.dragging=true;

        element.classList.add(
          'dragReady',
          'dragging'
        );

        try{
          element.setPointerCapture(
            event.pointerId
          );
        }
        catch{}

        showHint(
          `${state.originalTime}　長押しのまま左右へ動かしてください`
        );

      },
      LONG_PRESS_MS
    );
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

  if(
    !active.dragging
  ){

    const distance=
      Math.abs(
        event.clientX
        -
        active.startX
      );

    /*
      長押し前に普通に横へスワイプした場合は
      スケジュールスクロールを優先
    */
    if(distance>12){

      clearTimeout(
        active.timer
      );

      active=null;
    }

    return;
  }

  event.preventDefault();

  const dx=
    event.clientX
    -
    active.startX;

  const movedMinutes=
    dx/
    PX_PER_MINUTE;

  let newMinutes=
    snapMinutes(
      active.originalMinutes
      +
      movedMinutes
    );

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
      newMinutes-DAY_START
    )
    *
    PX_PER_MINUTE;

  active.element.style.left=
    `${newLeft}px`;

  const text=
    minutesToTime(
      newMinutes
    ).slice(0,5);

  const timeBox=
    active.element.querySelector(
      '.bookingTime'
    );

  if(timeBox){
    timeBox.textContent=text;
  }

  showHint(
    `変更先 ${text}`
  );
}

function pointerUp(event){

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

function attachBlock(
  block
){

  if(
    block.dataset.dragReady
  ){
    return;
  }

  block.dataset.dragReady=
    '1';

  block.addEventListener(
    'pointerdown',
    event=>
      pointerDown(
        event,
        block
      )
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
  cancelDrag
);