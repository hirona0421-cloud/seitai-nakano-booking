(()=>{
  if(window.__nakanoBodyEllipseLoaded)return;
  window.__nakanoBodyEllipseLoaded=true;

  const canvas=document.getElementById('draw');
  const stage=document.getElementById('stage');
  if(!canvas||!stage)return;

  let ellipseMode=false;
  let fillEnabled=true;
  let fillOpacity=0.25;
  let drawing=null;

  function addStyles(){
    if(document.getElementById('nakanoEllipseStyle'))return;
    const style=document.createElement('style');
    style.id='nakanoEllipseStyle';
    style.textContent=`
      .shapeTools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
      .shapeBtn{border:1px solid #ded6ce;background:#fff;color:#4d4843;border-radius:10px;padding:9px 12px;font-weight:800}
      .shapeBtn.primary{background:#61574d;color:#fff;border-color:#61574d}
      .shapeOpacity{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #e1d9d1;border-radius:10px;background:#faf8f5;color:#6f6862;font-size:12px;font-weight:700}
      .shapeOpacity input{width:105px;accent-color:#61574d}
      .shapeOpacityValue{min-width:34px;text-align:right}
      @media(max-width:600px){.shapeOpacity{width:100%}.shapeOpacity input{flex:1;width:auto}}
    `;
    document.head.appendChild(style);
  }

  function installUi(){
    if(document.getElementById('ellipseTool'))return;
    const penTitle=[...document.querySelectorAll('.toolTitle')].find(el=>el.textContent.trim()==='ペン');
    if(!penTitle)return;

    const title=document.createElement('div');
    title.className='toolTitle';
    title.textContent='図形';

    const tools=document.createElement('div');
    tools.className='shapeTools';
    tools.innerHTML=`
      <button class="shapeBtn" id="ellipseTool" type="button">楕円</button>
      <button class="shapeBtn primary" id="ellipseFill" type="button">中を塗る ON</button>
      <label class="shapeOpacity">塗り濃さ
        <input id="ellipseOpacity" type="range" min="10" max="55" step="5" value="25">
        <span id="ellipseOpacityValue" class="shapeOpacityValue">25%</span>
      </label>
    `;

    penTitle.parentNode.insertBefore(title,penTitle);
    penTitle.parentNode.insertBefore(tools,penTitle);

    const tool=document.getElementById('ellipseTool');
    const fill=document.getElementById('ellipseFill');
    const opacity=document.getElementById('ellipseOpacity');
    const opacityValue=document.getElementById('ellipseOpacityValue');

    tool.addEventListener('click',()=>{
      ellipseMode=!ellipseMode;
      tool.classList.toggle('primary',ellipseMode);
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

    document.querySelectorAll('.labelBtn').forEach(b=>b.addEventListener('click',()=>deactivateEllipse()));
    document.getElementById('eraser')?.addEventListener('click',()=>deactivateEllipse());
  }

  function deactivateEllipse(){
    ellipseMode=false;
    document.getElementById('ellipseTool')?.classList.remove('primary');
  }

  function currentColor(){
    return document.querySelector('.color.active')?.dataset.c||'#d9413a';
  }

  function point(e){
    const r=canvas.getBoundingClientRect();
    return{x:e.clientX-r.left,y:e.clientY-r.top};
  }

  function rgba(hex,alpha){
    const v=String(hex||'#d9413a').replace('#','');
    const full=v.length===3?v.split('').map(ch=>ch+ch).join(''):v.padEnd(6,'0');
    const n=parseInt(full,16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }

  function restoreSnapshot(snapshot){
    try{
      x.save();
      x.setTransform(1,0,0,1,0,0);
      x.clearRect(0,0,canvas.width,canvas.height);
      x.putImageData(snapshot,0,0);
      x.restore();
    }catch(e){console.warn('楕円プレビューの復元に失敗',e)}
  }

  function drawEllipse(start,end,color){
    let dx=end.x-start.x;
    let dy=end.y-start.y;
    if(Math.abs(dx)<6&&Math.abs(dy)<6){
      dx=24;
      dy=24;
      end={x:start.x+dx,y:start.y+dy};
    }
    const cx=(start.x+end.x)/2;
    const cy=(start.y+end.y)/2;
    const rx=Math.max(2,Math.abs(end.x-start.x)/2);
    const ry=Math.max(2,Math.abs(end.y-start.y)/2);

    x.save();
    x.globalCompositeOperation='source-over';
    x.beginPath();
    x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
    if(fillEnabled){
      x.fillStyle=rgba(color,fillOpacity);
      x.fill();
    }
    x.strokeStyle=color;
    x.lineWidth=3;
    x.stroke();
    x.restore();
  }

  function onDown(e){
    if(!ellipseMode)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    try{snap()}catch{}
    const start=point(e);
    let snapshot;
    try{snapshot=x.getImageData(0,0,canvas.width,canvas.height)}catch{return}
    drawing={pointerId:e.pointerId,start,end:start,snapshot,color:currentColor()};
    try{canvas.setPointerCapture(e.pointerId)}catch{}
  }

  function onMove(e){
    if(!drawing||drawing.pointerId!==e.pointerId)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drawing.end=point(e);
    restoreSnapshot(drawing.snapshot);
    drawEllipse(drawing.start,drawing.end,drawing.color);
  }

  function onUp(e){
    if(!drawing||drawing.pointerId!==e.pointerId)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drawing.end=point(e);
    restoreSnapshot(drawing.snapshot);
    drawEllipse(drawing.start,drawing.end,drawing.color);
    drawing=null;
    try{down=false;last=null}catch{}
  }

  function onCancel(e){
    if(!drawing||drawing.pointerId!==e.pointerId)return;
    restoreSnapshot(drawing.snapshot);
    drawing=null;
    try{down=false;last=null}catch{}
  }

  addStyles();
  installUi();

  canvas.addEventListener('pointerdown',onDown,true);
  canvas.addEventListener('pointermove',onMove,true);
  window.addEventListener('pointerup',onUp,true);
  window.addEventListener('pointercancel',onCancel,true);
})();
