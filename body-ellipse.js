(()=>{
  if(window.__nakanoBodyObjectsLoaded)return;
  window.__nakanoBodyObjectsLoaded=true;

  const baseCanvas=document.getElementById('draw');
  const stage=document.getElementById('stage');
  if(!baseCanvas||!stage)return;

  const params=new URLSearchParams(location.search);
  const customer=params.get('customer')||'draft';
  const date=params.get('date')||'undated';
  const OBJECT_KEY=`nakano_body_chart_${customer}_${date}_objects`;

  let ellipseMode=false;
  let fillEnabled=true;
  let fillOpacity=.25;
  let objects=[];
  let objectHistory=[];
  let selectedId=null;
  let gesture=null;
  let draftEllipse=null;

  const overlay=document.createElement('canvas');
  overlay.id='bodyObjectLayer';
  overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;';
  stage.appendChild(overlay);
  const ox=overlay.getContext('2d');

  function uid(){try{return crypto.randomUUID()}catch{return `obj_${Date.now()}_${Math.random().toString(36).slice(2)}`}}
  function cloneObjects(){return JSON.parse(JSON.stringify(objects))}
  function loadObjects(){
    try{
      const raw=localStorage.getItem(OBJECT_KEY);
      const parsed=raw?JSON.parse(raw):[];
      objects=Array.isArray(parsed)?parsed.filter(o=>o&&['ellipse','text'].includes(o.type)):[];
    }catch{objects=[]}
  }
  function saveObjects(){try{localStorage.setItem(OBJECT_KEY,JSON.stringify(objects))}catch{}}
  function pushObjectHistory(){objectHistory.push(cloneObjects());if(objectHistory.length>30)objectHistory.shift()}

  function addStyles(){
    if(document.getElementById('nakanoEllipseStyle'))return;
    const style=document.createElement('style');
    style.id='nakanoEllipseStyle';
    style.textContent=`
      #bodyObjectLayer{transform:none!important}
      .shapeTools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
      .shapeBtn{border:1px solid #ded6ce;background:#fff;color:#4d4843;border-radius:10px;padding:9px 12px;font-weight:800}
      .shapeBtn.primary{background:#61574d;color:#fff;border-color:#61574d}
      .shapeBtn:disabled{opacity:.42}
      .shapeOpacity{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #e1d9d1;border-radius:10px;background:#faf8f5;color:#6f6862;font-size:12px;font-weight:700}
      .shapeOpacity input{width:105px;accent-color:#61574d}
      .shapeOpacityValue{min-width:34px;text-align:right}
      .shapeMoveHint{width:100%;padding:9px 11px;border-radius:10px;background:#faf8f5;color:#6f6862;font-size:11px;line-height:1.65}
      @media(max-width:600px){.shapeOpacity{width:100%}.shapeOpacity input{flex:1;width:auto}}
    `;
    document.head.appendChild(style);
  }

  function installUi(){
    if(document.getElementById('ellipseTool'))return;
    const penTitle=[...document.querySelectorAll('.toolTitle')].find(el=>el.textContent.trim()==='ペン');
    if(!penTitle)return;
    const title=document.createElement('div');
    title.className='toolTitle';title.textContent='図形';
    const tools=document.createElement('div');
    tools.className='shapeTools';
    tools.innerHTML=`
      <button class="shapeBtn" id="ellipseTool" type="button">楕円</button>
      <button class="shapeBtn primary" id="ellipseFill" type="button">中を塗る ON</button>
      <label class="shapeOpacity">塗り濃さ
        <input id="ellipseOpacity" type="range" min="10" max="55" step="5" value="25">
        <span id="ellipseOpacityValue" class="shapeOpacityValue">25%</span>
      </label>
      <button class="shapeBtn" id="deleteBodyObject" type="button" disabled>選択した図形を削除</button>
      <div class="shapeMoveHint">楕円と症状文字は、置いたあとに直接タップしてそのままスワイプすると移動できます。選択中は点線で囲まれます。</div>`;
    penTitle.parentNode.insertBefore(title,penTitle);
    penTitle.parentNode.insertBefore(tools,penTitle);

    const ellipseTool=document.getElementById('ellipseTool');
    const fill=document.getElementById('ellipseFill');
    const opacity=document.getElementById('ellipseOpacity');
    const opacityValue=document.getElementById('ellipseOpacityValue');

    ellipseTool.addEventListener('click',()=>{
      ellipseMode=!ellipseMode;
      ellipseTool.classList.toggle('primary',ellipseMode);
      selectedId=null;updateDeleteButton();render();
      if(ellipseMode){
        try{er=false;label=null}catch{}
        document.getElementById('eraser')?.classList.remove('primary');
        document.querySelectorAll('.labelBtn').forEach(b=>b.classList.remove('active'));
      }
    });
    fill.addEventListener('click',()=>{
      fillEnabled=!fillEnabled;
      fill.textContent=fillEnabled?'中を塗る ON':'中を塗る OFF';
      fill.classList.toggle('primary',fillEnabled);
      opacity.disabled=!fillEnabled;
    });
    opacity.addEventListener('input',()=>{
      fillOpacity=Number(opacity.value)/100;
      opacityValue.textContent=`${opacity.value}%`;
    });
    document.getElementById('deleteBodyObject').addEventListener('click',()=>{
      if(!selectedId)return;
      pushObjectHistory();
      objects=objects.filter(o=>o.id!==selectedId);
      selectedId=null;saveObjects();updateDeleteButton();render();
    });
    document.querySelectorAll('.labelBtn').forEach(b=>b.addEventListener('click',()=>deactivateEllipse()));
    document.getElementById('eraser')?.addEventListener('click',()=>{deactivateEllipse();selectedId=null;updateDeleteButton();render()});
  }

  function deactivateEllipse(){ellipseMode=false;document.getElementById('ellipseTool')?.classList.remove('primary')}
  function updateDeleteButton(){const b=document.getElementById('deleteBodyObject');if(b)b.disabled=!selectedId}
  function currentColor(){return document.querySelector('.color.active')?.dataset.c||'#d9413a'}
  function rgba(hex,alpha){const v=String(hex||'#d9413a').replace('#','');const full=v.length===3?v.split('').map(ch=>ch+ch).join(''):v.padEnd(6,'0');const n=parseInt(full,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`}
  function cssSize(){const r=baseCanvas.getBoundingClientRect();return{w:r.width||1,h:r.height||1}}
  function point(e){const r=baseCanvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,w:r.width||1,h:r.height||1}}
  function normPoint(p){return{x:p.x/p.w,y:p.y/p.h}}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

  function resizeOverlay(){
    const {w,h}=cssSize(),d=devicePixelRatio||1;
    const nw=Math.max(1,Math.round(w*d)),nh=Math.max(1,Math.round(h*d));
    if(overlay.width!==nw||overlay.height!==nh){overlay.width=nw;overlay.height=nh;overlay.style.width=`${w}px`;overlay.style.height=`${h}px`}
    render();
  }

  function ellipseBounds(o,w,h){return{x:(o.cx-o.rx)*w,y:(o.cy-o.ry)*h,width:o.rx*2*w,height:o.ry*2*h}}
  function textMetrics(o,w,h,ctx=ox){const fs=Math.max(14,(o.fontSize||.028)*w);ctx.save();ctx.font=`700 ${fs}px -apple-system,BlinkMacSystemFont,"Yu Gothic",sans-serif`;const mw=ctx.measureText(o.text||'').width;ctx.restore();return{x:o.x*w,y:o.y*h-fs,width:mw,height:fs*1.25,fs}}

  function drawObject(ctx,o,w,h,showSelection=false){
    if(o.type==='ellipse'){
      const cx=o.cx*w,cy=o.cy*h,rx=Math.max(2,o.rx*w),ry=Math.max(2,o.ry*h);
      ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
      if(o.fill){ctx.fillStyle=rgba(o.color,o.opacity??.25);ctx.fill()}
      ctx.strokeStyle=o.color||'#d9413a';ctx.lineWidth=3;ctx.stroke();ctx.restore();
      if(showSelection){const b=ellipseBounds(o,w,h);drawSelection(ctx,b)}
    }else if(o.type==='text'){
      const m=textMetrics(o,w,h,ctx);
      ctx.save();ctx.fillStyle=o.color||'#333';ctx.font=`700 ${m.fs}px -apple-system,BlinkMacSystemFont,"Yu Gothic",sans-serif`;ctx.textBaseline='alphabetic';ctx.fillText(o.text||'',o.x*w,o.y*h);ctx.restore();
      if(showSelection)drawSelection(ctx,{x:m.x-5,y:m.y-4,width:m.width+10,height:m.height+8})
    }
  }
  function drawSelection(ctx,b){ctx.save();ctx.setLineDash([6,5]);ctx.strokeStyle='#61574d';ctx.lineWidth=1.5;ctx.strokeRect(b.x,b.y,b.width,b.height);ctx.restore()}
  function render(){
    const {w,h}=cssSize(),d=devicePixelRatio||1;
    ox.setTransform(1,0,0,1,0,0);ox.clearRect(0,0,overlay.width,overlay.height);ox.setTransform(d,0,0,d,0,0);
    objects.forEach(o=>drawObject(ox,o,w,h,o.id===selectedId));
    if(draftEllipse)drawObject(ox,draftEllipse,w,h,false);
  }

  function hitTest(p){
    const n=normPoint(p),{w,h}=p;
    for(let i=objects.length-1;i>=0;i--){
      const o=objects[i];
      if(o.type==='ellipse'){
        const rx=Math.max(o.rx,.001),ry=Math.max(o.ry,.001);
        const q=((n.x-o.cx)/rx)**2+((n.y-o.cy)/ry)**2;
        const pxTol=Math.max(9/w,9/h),tol=Math.max(.14,pxTol/Math.max(Math.min(rx,ry),.001));
        if(o.fill?q<=1.18:Math.abs(q-1)<=tol)return o;
      }else if(o.type==='text'){
        const b=textMetrics(o,w,h);
        if(p.x>=b.x-10&&p.x<=b.x+b.width+10&&p.y>=b.y-10&&p.y<=b.y+b.height+10)return o;
      }
    }
    return null;
  }

  function labelState(){try{return label?{text:label,color:labelCol||'#333'}:null}catch{return null}}
  function clearLegacyLabel(){try{label=null}catch{}document.querySelectorAll('.labelBtn').forEach(b=>b.classList.remove('active'))}

  function onPointerDown(e){
    if(e.button!==undefined&&e.pointerType==='mouse'&&e.button!==0)return;
    const p=point(e),n=normPoint(p);
    if(ellipseMode){
      e.preventDefault();e.stopImmediatePropagation();
      selectedId=null;updateDeleteButton();
      gesture={type:'newEllipse',pointerId:e.pointerId,start:n,current:n};
      draftEllipse={id:'draft',type:'ellipse',cx:n.x,cy:n.y,rx:.001,ry:.001,color:currentColor(),fill:fillEnabled,opacity:fillOpacity};
      try{stage.setPointerCapture(e.pointerId)}catch{}render();return;
    }
    const ls=labelState();
    if(ls){
      e.preventDefault();e.stopImmediatePropagation();pushObjectHistory();
      const {w}=p;
      const obj={id:uid(),type:'text',x:clamp(n.x,0,1),y:clamp(n.y,0,1),text:ls.text,color:ls.color,fontSize:19/w};
      objects.push(obj);selectedId=obj.id;saveObjects();clearLegacyLabel();updateDeleteButton();render();return;
    }
    const hit=hitTest(p);
    if(hit){
      e.preventDefault();e.stopImmediatePropagation();
      selectedId=hit.id;updateDeleteButton();render();
      pushObjectHistory();
      gesture={type:'move',pointerId:e.pointerId,id:hit.id,start:n,original:JSON.parse(JSON.stringify(hit)),moved:false};
      try{stage.setPointerCapture(e.pointerId)}catch{}
    }else{
      if(selectedId){selectedId=null;updateDeleteButton();render()}
      objectHistory=[];
    }
  }

  function onPointerMove(e){
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    const p=point(e),n=normPoint(p);
    if(gesture.type==='newEllipse'){
      gesture.current=n;
      const sx=gesture.start.x,sy=gesture.start.y;
      draftEllipse={id:'draft',type:'ellipse',cx:(sx+n.x)/2,cy:(sy+n.y)/2,rx:Math.max(.004,Math.abs(n.x-sx)/2),ry:Math.max(.004,Math.abs(n.y-sy)/2),color:currentColor(),fill:fillEnabled,opacity:fillOpacity};
      render();
    }else if(gesture.type==='move'){
      const obj=objects.find(o=>o.id===gesture.id);if(!obj)return;
      const dx=n.x-gesture.start.x,dy=n.y-gesture.start.y;gesture.moved=true;
      if(obj.type==='ellipse'){
        obj.cx=clamp(gesture.original.cx+dx,obj.rx,1-obj.rx);obj.cy=clamp(gesture.original.cy+dy,obj.ry,1-obj.ry);
      }else{
        obj.x=clamp(gesture.original.x+dx,0,1);obj.y=clamp(gesture.original.y+dy,.02,1);
      }
      render();
    }
  }

  function onPointerUp(e){
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(gesture.type==='newEllipse'){
      pushObjectHistory();
      let o=draftEllipse;
      if(o){if(o.rx<.012&&o.ry<.012){o.rx=.035;o.ry=.035}o.id=uid();objects.push(o);selectedId=o.id}
      draftEllipse=null;saveObjects();updateDeleteButton();render();
    }else if(gesture.type==='move'){
      if(gesture.moved)saveObjects();else objectHistory.pop();
      render();
    }
    gesture=null;try{down=false;last=null}catch{}
  }
  function onPointerCancel(e){if(!gesture||gesture.pointerId!==e.pointerId)return;if(gesture.type==='move'){const i=objects.findIndex(o=>o.id===gesture.id);if(i>=0)objects[i]=gesture.original;objectHistory.pop()}draftEllipse=null;gesture=null;render()}

  function hookUndoAndClear(){
    document.getElementById('undo')?.addEventListener('click',e=>{
      if(!objectHistory.length)return;
      e.preventDefault();e.stopImmediatePropagation();objects=objectHistory.pop();selectedId=null;saveObjects();updateDeleteButton();render();
    },true);
    document.getElementById('clear')?.addEventListener('click',()=>{
      if(objects.length){pushObjectHistory();objects=[];selectedId=null;saveObjects();updateDeleteButton();render()}
    },true);
  }

  window.__nakanoBodyGetObjects=()=>cloneObjects();
  window.__nakanoBodyExportComposite=()=>{
    const {w,h}=cssSize(),d=devicePixelRatio||1;
    const out=document.createElement('canvas');out.width=baseCanvas.width;out.height=baseCanvas.height;
    const ctx=out.getContext('2d');ctx.drawImage(baseCanvas,0,0);
    ctx.setTransform(d,0,0,d,0,0);objects.forEach(o=>drawObject(ctx,o,w,h,false));
    return out.toDataURL('image/png');
  };

  addStyles();installUi();loadObjects();resizeOverlay();hookUndoAndClear();
  stage.addEventListener('pointerdown',onPointerDown,true);
  stage.addEventListener('pointermove',onPointerMove,true);
  window.addEventListener('pointerup',onPointerUp,true);
  window.addEventListener('pointercancel',onPointerCancel,true);
  window.addEventListener('resize',()=>setTimeout(resizeOverlay,90));
  if(window.ResizeObserver)new ResizeObserver(()=>resizeOverlay()).observe(stage);
})();
