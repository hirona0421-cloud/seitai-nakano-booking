import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(
  'https://scjzofjyxmchfjsngqtb.supabase.co',
  'sb_publishable_EGlr-6w0xh4gD8OImboE_Q_V-COJ7t9'
);

const $=id=>document.getElementById(id);
const SESSION_KEY='nakano_staff_edit_session';
let sessionId='';
try{
  sessionId=sessionStorage.getItem(SESSION_KEY)||'';
  if(!sessionId){
    sessionId=crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY,sessionId);
  }
}catch{
  sessionId=crypto.randomUUID();
}

let ownedKey='';
let ownedLabel='';
let heartbeatTimer=null;
let lockChannel=null;
let dataChannel=null;
let releasing=false;

function addSharedStyle(){
  if($('nakanoStaffSyncStyle'))return;
  const s=document.createElement('style');
  s.id='nakanoStaffSyncStyle';
  s.textContent=`
    .staffSyncBanner{margin:0 0 12px;padding:11px 12px;border-radius:12px;border:1px solid #d9d1c8;background:#faf8f5;color:#5e5751;font-size:12px;line-height:1.6}
    .staffSyncBanner.editing{background:#edf4ee;border-color:#cbdccb;color:#45694b}
    .staffSyncBanner.locked{background:#fff5ef;border-color:#ead3c4;color:#80564c}
    .staffSyncBanner.updated{background:#eef3f8;border-color:#cfdbe7;color:#496379}
    .staffSyncBanner button{width:auto!important;margin:7px 0 0!important;padding:7px 10px!important;border-radius:9px!important;border:1px solid #cfc5bb!important;background:#fff!important;color:#554d47!important;font-size:11px!important;font-weight:700!important}
  `;
  document.head.appendChild(s);
}

async function acquireLock(resourceKey,resourceType,resourceId){
  if(!resourceKey)return{acquired:false,owner_label:'管理者'};
  if(ownedKey&&ownedKey!==resourceKey)await releaseOwnedLock();
  const{data,error}=await supabase.rpc('nakano_acquire_edit_lock',{
    p_resource_key:resourceKey,
    p_resource_type:resourceType,
    p_resource_id:String(resourceId||''),
    p_session_id:sessionId
  });
  if(error){
    console.warn('編集ロック取得エラー',error);
    return{acquired:false,owner_label:'別の管理者'};
  }
  const row=Array.isArray(data)?data[0]:data;
  if(row?.acquired){
    ownedKey=resourceKey;
    ownedLabel=row.owner_label||'あなた';
    startHeartbeat();
  }
  return row||{acquired:false,owner_label:'別の管理者'};
}

function startHeartbeat(){
  clearInterval(heartbeatTimer);
  heartbeatTimer=setInterval(async()=>{
    if(!ownedKey)return;
    const key=ownedKey;
    const{data,error}=await supabase.rpc('nakano_refresh_edit_lock',{
      p_resource_key:key,
      p_session_id:sessionId
    });
    if(error||data!==true){
      if(ownedKey===key){
        ownedKey='';
        clearInterval(heartbeatTimer);
        document.dispatchEvent(new CustomEvent('nakano-lock-lost',{detail:{resourceKey:key}}));
      }
    }
  },15000);
}

async function releaseOwnedLock(){
  if(!ownedKey||releasing)return;
  const key=ownedKey;
  ownedKey='';
  clearInterval(heartbeatTimer);
  releasing=true;
  try{
    await supabase.rpc('nakano_release_edit_lock',{
      p_resource_key:key,
      p_session_id:sessionId
    });
  }catch{}
  releasing=false;
}

function subscribeLockChanges(onChange){
  try{
    lockChannel=supabase.channel(`nakano-edit-lock-ui-${sessionId}-${Date.now()}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'nakano_edit_locks'},payload=>onChange?.(payload))
      .subscribe();
  }catch(e){console.warn('編集ロックRealtime設定エラー',e)}
}

function stopChannels(){
  try{if(lockChannel)supabase.removeChannel(lockChannel)}catch{}
  try{if(dataChannel)supabase.removeChannel(dataChannel)}catch{}
  lockChannel=null;dataChannel=null;
}

window.addEventListener('pagehide',()=>{
  if(ownedKey){supabase.rpc('nakano_release_edit_lock',{p_resource_key:ownedKey,p_session_id:sessionId}).catch(()=>{});}
  stopChannels();
});

/* =========================
   顧客・カルテ管理
========================= */
async function initCustomersPage(){
  addSharedStyle();
  const{data:{session}}=await supabase.auth.getSession();
  if(!session)return;

  let currentCustomerId='';
  let currentEditingId='';
  let readonlyMode=false;
  let pendingRefresh=false;

  const inferCustomerId=()=>{
    if(currentCustomerId)return currentCustomerId;
    const name=String($('detailName')?.textContent||'').trim();
    const phone=String($('editPhone')?.value||'').replace(/\D/g,'');
    if(!name)return'';
    const item=[...document.querySelectorAll('.customerItem')].find(el=>{
      const n=String(el.querySelector('.customerName')?.textContent||'').trim();
      const p=String(el.querySelector('.customerMeta')?.textContent||'').replace(/\D/g,'');
      return n===name&&(!phone||p===phone);
    });
    if(item?.dataset.id)currentCustomerId=item.dataset.id;
    return currentCustomerId;
  };

  const customerBanner=()=>{
    let b=$('customerSyncBanner');
    if(!b&&$('customerCard')){
      b=document.createElement('div');
      b.id='customerSyncBanner';
      b.className='staffSyncBanner hidden';
      $('customerCard').insertBefore(b,$('customerCard').firstChild);
    }
    return b;
  };

  const editorBanner=()=>{
    let b=$('karteSyncBanner');
    const ed=$('karteEditor');
    if(!b&&ed){
      b=document.createElement('div');
      b.id='karteSyncBanner';
      b.className='staffSyncBanner';
      ed.insertBefore(b,ed.children[1]||null);
    }
    return b;
  };

  function setEditorReadonly(value){
    readonlyMode=!!value;
    const ed=$('karteEditor');
    if(!ed)return;
    ed.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=readonlyMode});
    if($('saveKarte'))$('saveKarte').disabled=readonlyMode;
    if($('deleteKarte'))$('deleteKarte').disabled=readonlyMode;
    if($('openEditorBodyChart'))$('openEditorBodyChart').disabled=false;
    if($('cancelKarte'))$('cancelKarte').disabled=false;
  }

  function showCustomerStatus(text,kind='updated'){
    const b=customerBanner();if(!b)return;
    b.className=`staffSyncBanner ${kind}`;
    b.textContent=text;
  }

  function showEditorStatus(text,kind='editing',withRetry=false){
    const b=editorBanner();if(!b)return;
    b.className=`staffSyncBanner ${kind}`;
    b.innerHTML='';
    const span=document.createElement('span');span.textContent=text;b.appendChild(span);
    if(withRetry){
      b.appendChild(document.createElement('br'));
      const btn=document.createElement('button');
      btn.type='button';btn.textContent='編集を開始';
      btn.onclick=async()=>{
        const cid=inferCustomerId();if(!cid)return;
        const result=await acquireLock(`karte:${cid}`,'karte',cid);
        if(result?.acquired){setEditorReadonly(false);showEditorStatus('あなたが編集中です。もう一方の管理画面では閲覧専用になります。','editing')}
        else showEditorStatus(`${result?.owner_label||'別の管理者'}さんが編集中です。現在は閲覧専用です。`,'locked',true);
      };
      b.appendChild(btn);
    }
  }

  async function findInitialKarteId(cid){
    try{
      const{data}=await supabase.from('nakano_karte_records').select('id').eq('customer_id',cid).order('created_at',{ascending:true}).limit(1).maybeSingle();
      return data?.id||'';
    }catch{return''}
  }

  const fieldMap={
    visit_date:'karteVisitDate',chief_complaint:'karteChiefComplaint',painful_areas:'kartePainfulAreas',symptom_since:'karteSince',
    pain_level:'kartePainLevel',medical_history:'karteMedicalHistory',medications:'karteMedications',current_treatment:'karteCurrentTreatment',
    contraindications:'karteContraindications',sleep_condition:'karteSleep',lifestyle:'karteLifestyle',customer_message:'karteCustomerMessage',
    therapist_findings:'karteFindings',treatment_content:'karteTreatment',after_condition:'karteAfter',next_plan:'karteNextPlan',therapist_note:'karteTherapistNote'
  };

  function applyRemoteRow(row){
    if(!row)return;
    for(const[key,id]of Object.entries(fieldMap)){
      const el=$(id);if(!el)continue;
      if(key==='pain_level')el.value=row[key]??'';
      else el.value=row[key]??'';
    }
    showEditorStatus('別の管理者が保存した最新内容に自動更新しました。','updated',false);
    setEditorReadonly(true);
  }

  function refreshSelectedCustomerView(){
    const cid=inferCustomerId();if(!cid)return;
    const item=document.querySelector(`.customerItem[data-id="${CSS.escape(String(cid))}"]`);
    if(item)item.click();
  }

  document.addEventListener('click',e=>{
    const item=e.target.closest?.('.customerItem[data-id]');
    if(item){
      currentCustomerId=item.dataset.id||'';
      currentEditingId='';
      pendingRefresh=false;
      if(ownedKey&&ownedKey!==`karte:${currentCustomerId}`)releaseOwnedLock();
    }
  },true);

  document.addEventListener('click',async e=>{
    const btn=e.target.closest?.('.editKarte,.editInitialKarte,#newKarte');
    if(!btn||btn.dataset.staffLockPass==='1')return;
    const original=btn.onclick;
    if(typeof original!=='function')return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();

    const cid=inferCustomerId();
    if(!cid){original.call(btn,e);return;}

    if(btn.classList.contains('editKarte'))currentEditingId=btn.dataset.id||'';
    else if(btn.classList.contains('editInitialKarte'))currentEditingId=await findInitialKarteId(cid);
    else currentEditingId='';

    const result=await acquireLock(`karte:${cid}`,'karte',cid);
    if(result?.acquired){
      setEditorReadonly(false);
      original.call(btn,e);
      setTimeout(()=>showEditorStatus('あなたが編集中です。もう一方の管理画面では閲覧専用になります。','editing'),0);
      return;
    }

    const owner=result?.owner_label||'別の管理者';
    if(btn.id==='newKarte'){
      showCustomerStatus(`${owner}さんがこのお客様のカルテを編集中です。新しい施術記録は、編集が終わってから追加できます。`,'locked');
      return;
    }

    original.call(btn,e);
    setTimeout(()=>{
      setEditorReadonly(true);
      showEditorStatus(`${owner}さんがこのお客様のカルテを編集中です。現在は閲覧専用です。`,'locked',false);
    },0);
  },true);

  function wrapEditorButtons(){
    const save=$('saveKarte');
    if(save&&save.onclick&&!save.dataset.staffSyncWrapped){
      const original=save.onclick;save.dataset.staffSyncWrapped='1';
      save.onclick=async function(e){
        if(readonlyMode||!ownedKey){showEditorStatus('編集ロックを取得していないため保存できません。','locked',true);return;}
        await original.call(this,e);
        if(String($('karteMsg')?.textContent||'').includes('保存しました')){
          await releaseOwnedLock();
          showEditorStatus('保存しました。編集ロックを解除しました。','updated');
          if(pendingRefresh){pendingRefresh=false;setTimeout(refreshSelectedCustomerView,450)}
        }
      };
    }
    const del=$('deleteKarte');
    if(del&&del.onclick&&!del.dataset.staffSyncWrapped){
      const original=del.onclick;del.dataset.staffSyncWrapped='1';
      del.onclick=async function(e){
        if(readonlyMode||!ownedKey){showEditorStatus('閲覧中のため削除できません。','locked',true);return;}
        await original.call(this,e);
        if($('karteEditor')?.classList.contains('hidden'))await releaseOwnedLock();
      };
    }
    const cancel=$('cancelKarte');
    if(cancel&&cancel.onclick&&!cancel.dataset.staffSyncWrapped){
      const original=cancel.onclick;cancel.dataset.staffSyncWrapped='1';
      cancel.onclick=async function(e){
        await releaseOwnedLock();
        original.call(this,e);
        setEditorReadonly(false);
        currentEditingId='';
        if(pendingRefresh){pendingRefresh=false;setTimeout(refreshSelectedCustomerView,50)}
      };
    }
  }
  let wrapTries=0;
  const wrapTimer=setInterval(()=>{wrapEditorButtons();if(++wrapTries>40)clearInterval(wrapTimer)},100);

  dataChannel=supabase.channel(`nakano-karte-data-${sessionId}-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'nakano_karte_records'},payload=>{
      const row=payload.new&&Object.keys(payload.new).length?payload.new:payload.old;
      const cid=String(row?.customer_id||'');
      const selected=String(inferCustomerId()||'');
      const rowId=String(row?.id||'');
      if(cid&&selected&&cid!==selected)return;
      if(!cid&&rowId&&currentEditingId&&rowId!==String(currentEditingId))return;

      if(ownedKey){return;}

      const editorOpen=!$('karteEditor')?.classList.contains('hidden');
      if(editorOpen&&currentEditingId&&rowId===String(currentEditingId)){
        if(payload.eventType==='DELETE'){
          setEditorReadonly(true);
          showEditorStatus('この施術記録は別の管理者によって削除されました。','locked');
        }else{
          applyRemoteRow(payload.new);
        }
        return;
      }

      if(editorOpen){pendingRefresh=true;showEditorStatus('別の管理者がカルテを更新しました。編集画面を閉じると一覧へ反映します。','updated');return;}
      setTimeout(refreshSelectedCustomerView,120);
    })
    .subscribe();

  subscribeLockChanges(payload=>{
    const row=payload.new&&Object.keys(payload.new).length?payload.new:payload.old;
    const cid=inferCustomerId();
    if(!cid||String(row?.resource_key||'')!==`karte:${cid}`)return;
    if(ownedKey)return;
    const editorOpen=!$('karteEditor')?.classList.contains('hidden');
    if(!editorOpen)return;
    if(payload.eventType==='DELETE')showEditorStatus('編集ロックが解除されました。必要なら編集を開始できます。','updated',true);
    else if(payload.new?.owner_label)showEditorStatus(`${payload.new.owner_label}さんが編集中です。現在は閲覧専用です。`,'locked',false);
  });

  document.addEventListener('nakano-lock-lost',e=>{
    const cid=inferCustomerId();if(e.detail?.resourceKey!==`karte:${cid}`)return;
    setEditorReadonly(true);showEditorStatus('編集ロックが切れたため閲覧専用に切り替えました。','locked',true);
  });
}

/* =========================
   身体図
========================= */
async function initBodyChartPage(){
  addSharedStyle();
  const{data:{session}}=await supabase.auth.getSession();
  if(!session)return;

  const params=new URLSearchParams(location.search);
  const customer=params.get('customer')||'';
  const date=params.get('date')||'';
  if(!customer||!date||customer==='draft'||date==='undated')return;
  const resourceKey=`body:${customer}:${date}`;
  const frame=$('chartFrame');
  let readonlyBody=false;
  let reloadTimer=null;

  function bodyBanner(doc){
    let b=doc?.getElementById('bodyStaffSyncBanner');
    if(!b){
      const card=doc?.querySelector('.card');
      if(!card)return null;
      b=doc.createElement('div');b.id='bodyStaffSyncBanner';b.className='staffSyncBanner';
      card.insertBefore(b,card.firstChild);
      if(!doc.getElementById('bodyStaffSyncStyle')){
        const s=doc.createElement('style');s.id='bodyStaffSyncStyle';s.textContent='.staffSyncBanner{margin:0 0 9px;padding:10px 11px;border-radius:11px;border:1px solid #d9d1c8;background:#faf8f5;color:#5e5751;font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic",Meiryo,sans-serif}.staffSyncBanner.editing{background:#edf4ee;border-color:#cbdccb;color:#45694b}.staffSyncBanner.locked{background:#fff5ef;border-color:#ead3c4;color:#80564c}.staffSyncBanner.updated{background:#eef3f8;border-color:#cfdbe7;color:#496379}.staffSyncBanner button{margin-top:7px;padding:7px 10px;border:1px solid #cfc5bb;border-radius:9px;background:#fff;color:#554d47;font-size:11px;font-weight:700}';doc.head.appendChild(s);
      }
    }
    return b;
  }

  function setBodyReadonly(value,text='',kind='locked',withRetry=false){
    readonlyBody=!!value;
    let doc;try{doc=frame?.contentDocument}catch{return}
    if(!doc)return;
    const stage=doc.getElementById('stage');if(stage)stage.style.pointerEvents=readonlyBody?'none':'';
    doc.querySelectorAll('.labelBtn,.color,#eraser,#undo,#clear,#save,.shapeBtn').forEach(el=>{el.disabled=readonlyBody});
    const b=bodyBanner(doc);if(!b)return;
    b.className=`staffSyncBanner ${kind}`;b.innerHTML='';
    const span=doc.createElement('span');span.textContent=text;b.appendChild(span);
    if(withRetry){
      b.appendChild(doc.createElement('br'));
      const btn=doc.createElement('button');btn.type='button';btn.textContent='編集を開始';
      btn.onclick=async()=>{
        const result=await acquireLock(resourceKey,'body_chart',`${customer}:${date}`);
        if(result?.acquired)setBodyReadonly(false,'あなたが編集中です。もう一方の管理画面では閲覧専用になります。','editing');
        else setBodyReadonly(true,`${result?.owner_label||'別の管理者'}さんがこの身体図を編集中です。現在は閲覧専用です。`,'locked',true);
      };
      b.appendChild(btn);
    }
  }

  function hookFrameControls(){
    let doc;try{doc=frame?.contentDocument}catch{return}
    if(!doc)return;
    if(readonlyBody){
      const existing=doc.getElementById('bodyStaffSyncBanner');
      const text=existing?.textContent||'別の管理者が編集中です。現在は閲覧専用です。';
      setBodyReadonly(true,text,'locked');
    }else if(ownedKey===resourceKey){
      setBodyReadonly(false,'あなたが編集中です。もう一方の管理画面では閲覧専用になります。','editing');
    }
    const back=doc.querySelector('.bar button');const close=doc.getElementById('close');
    [back,close].forEach(btn=>{if(btn&&!btn.dataset.staffReleaseHook){btn.dataset.staffReleaseHook='1';btn.addEventListener('click',()=>releaseOwnedLock(),{capture:true})}});
  }

  const result=await acquireLock(resourceKey,'body_chart',`${customer}:${date}`);
  if(result?.acquired)readonlyBody=false;else readonlyBody=true;

  frame?.addEventListener('load',()=>{
    setTimeout(()=>{
      if(result?.acquired)setBodyReadonly(false,'あなたが編集中です。もう一方の管理画面では閲覧専用になります。','editing');
      else setBodyReadonly(true,`${result?.owner_label||'別の管理者'}さんがこの身体図を編集中です。現在は閲覧専用です。`,'locked',false);
      hookFrameControls();
    },80);
  });
  if(frame?.contentDocument?.readyState==='complete')setTimeout(hookFrameControls,100);

  dataChannel=supabase.channel(`nakano-body-data-${sessionId}-${Date.now()}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'nakano_body_charts',filter:`customer_id=eq.${customer}`},payload=>{
      if(String(payload.new?.visit_date||'')!==date)return;
      if(ownedKey===resourceKey)return;
      clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>location.reload(),180);
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'nakano_body_charts',filter:`customer_id=eq.${customer}`},payload=>{
      if(String(payload.new?.visit_date||'')!==date)return;
      if(ownedKey===resourceKey){setBodyReadonly(false,'別端末からも変更が入りました。保存前に内容を確認してください。','updated');return;}
      clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>location.reload(),180);
    })
    .subscribe();

  subscribeLockChanges(async payload=>{
    const row=payload.new&&Object.keys(payload.new).length?payload.new:payload.old;
    if(String(row?.resource_key||'')!==resourceKey||ownedKey===resourceKey)return;
    if(payload.eventType==='DELETE'){
      setBodyReadonly(true,'編集ロックが解除されました。必要なら編集を開始できます。','updated',true);
    }else if(payload.new?.owner_label){
      setBodyReadonly(true,`${payload.new.owner_label}さんがこの身体図を編集中です。現在は閲覧専用です。`,'locked',false);
    }
  });

  document.addEventListener('nakano-lock-lost',e=>{
    if(e.detail?.resourceKey!==resourceKey)return;
    setBodyReadonly(true,'編集ロックが切れたため閲覧専用に切り替えました。','locked',true);
  });
}

const path=location.pathname;
if(path.endsWith('/customers.html'))initCustomersPage();
else if(path.endsWith('/body-chart.html'))initBodyChartPage();
