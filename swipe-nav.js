export function initSwipeNavigation({container,onSwipeLeft,onSwipeRight,threshold=40,restraint=100,allowedTime=600}){
  if(!container) container=document.body;
  let sx=0, sy=0, st=0, tracking=false;
  const onStart=e=>{ const t=e.changedTouches?e.changedTouches[0]:e.touches[0]; sx=t.pageX; sy=t.pageY; st=Date.now(); tracking=true; };
  const onEnd=e=>{
    if(!tracking) return; tracking=false;
    const t=e.changedTouches?e.changedTouches[0]:e.touches[0];
    const dx=t.pageX-sx, dy=t.pageY-sy, elapsed=Date.now()-st;
    if(elapsed<=allowedTime && Math.abs(dx)>=threshold && Math.abs(dy)<=restraint){
      if(dx<0 && typeof onSwipeLeft==='function') onSwipeLeft(e);
      else if(dx>0 && typeof onSwipeRight==='function') onSwipeRight(e);
    }
  };
  container.addEventListener('touchstart',onStart,{passive:true});
  container.addEventListener('touchend',onEnd,{passive:true});
  let down=false, mx=0, my=0, mt=0;
  container.addEventListener('mousedown',e=>{ down=true; mx=e.pageX; my=e.pageY; mt=Date.now(); });
  container.addEventListener('mouseup',e=>{
    if(!down) return; down=false;
    const dx=e.pageX-mx, dy=e.pageY-my, elapsed=Date.now()-mt;
    if(elapsed<=allowedTime && Math.abs(dx)>=threshold && Math.abs(dy)<=restraint){
      if(dx<0 && typeof onSwipeLeft==='function') onSwipeLeft(e);
      else if(dx>0 && typeof onSwipeRight==='function') onSwipeRight(e);
    }
  });
}
