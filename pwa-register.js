(()=>{
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('PWA registration failed',err));
    },{once:true});
  }

  let installPrompt=null;
  let installButton=null;

  const removeButton=()=>{
    installButton?.remove();
    installButton=null;
  };

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    if(installButton)return;
    const anchor=document.getElementById('lineStatus')||document.querySelector('.header');
    if(!anchor)return;
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary';
    button.id='installNakanoApp';
    button.textContent='ホーム画面に追加';
    button.style.marginTop='10px';
    button.addEventListener('click',async()=>{
      if(!installPrompt)return;
      button.disabled=true;
      try{
        await installPrompt.prompt();
        await installPrompt.userChoice;
      }catch(err){
        console.warn('PWA install prompt failed',err);
      }finally{
        installPrompt=null;
        removeButton();
      }
    });
    anchor.insertAdjacentElement('afterend',button);
    installButton=button;
  });

  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    removeButton();
  });
})();
