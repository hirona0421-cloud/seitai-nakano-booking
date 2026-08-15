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

  function refreshHints(){
    document.querySelectorAll('.monthlyBookingRow[data-booking-id]').forEach(row=>{
      row.setAttribute('role','button');
      row.tabIndex=0;
      const hint=row.querySelector('.monthlyBookingEditHint');
      if(hint)hint.textContent='タップして別ページで予約を編集';
    });
  }

  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const row=e.target.closest?.('.monthlyBookingRow[data-booking-id]');
    if(!row)return;
    e.preventDefault();
    openRow(row);
  });

  refreshHints();
  new MutationObserver(refreshHints).observe(document.body,{childList:true,subtree:true});
})();