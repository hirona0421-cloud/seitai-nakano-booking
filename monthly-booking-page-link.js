(()=>{
  function openRow(row){
    const id=row?.dataset?.bookingId;
    if(!id)return;
    const u=new URL('./booking-edit.html',location.href);
    u.searchParams.set('id',id);
    u.searchParams.set('_v',String(Date.now()));
    location.href=u.href;
  }

  document.addEventListener('click',e=>{
    const row=e.target.closest?.('.monthlyBookingRow[data-booking-id]');
    if(!row)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openRow(row);
  },true);

  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const row=e.target.closest?.('.monthlyBookingRow[data-booking-id]');
    if(!row)return;
    e.preventDefault();
    openRow(row);
  });

  function refreshHintsOnce(){
    document.querySelectorAll('.monthlyBookingRow[data-booking-id]').forEach(row=>{
      row.setAttribute('role','button');
      row.tabIndex=0;
      const hint=row.querySelector('.monthlyBookingEditHint');
      if(hint&&hint.textContent!=='タップして別ページで予約を編集'){
        hint.textContent='タップして別ページで予約を編集';
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshHintsOnce,{once:true});
  else refreshHintsOnce();
  setTimeout(refreshHintsOnce,800);
})();