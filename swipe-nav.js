// js/swipe-nav.js
export function initSwipeNavigation({ container, onSwipeLeft, onSwipeRight, threshold = 40, restraint = 100, allowedTime = 600 }) {
  if (!container) container = document.body;
  let startX=0, startY=0, startTime=0, tracking=false;
  const onTouchStart = (e)=>{ const t=e.changedTouches?e.changedTouches[0]:e.touches[0]; startX=t.pageX; startY=t.pageY; startTime=Date.now(); tracking=true; };
  const onTouchEnd = (e)=>{
    if(!tracking) return; tracking=false;
    const t=e.changedTouches?e.changedTouches[0]:e.touches[0];
    const distX=t.pageX-startX, distY=t.pageY-startY, elapsed=Date.now()-startTime;
    if (elapsed<=allowedTime && Math.abs(distX)>=threshold && Math.abs(distY)<=restraint){
      if (distX<0 && typeof onSwipeLeft==='function') onSwipeLeft(e);
      else if (distX>0 && typeof onSwipeRight==='function') onSwipeRight(e);
    }
  };
  container.addEventListener('touchstart', onTouchStart, {passive:true});
  container.addEventListener('touchend', onTouchEnd, {passive:true});
  // desktop mouse drag
  let down=false, mX=0, mY=0, mT=0;
  container.addEventListener('mousedown', e=>{down=true;mX=e.pageX;mY=e.pageY;mT=Date.now();});
  container.addEventListener('mouseup', e=>{
    if(!down) return; down=false;
    const distX=e.pageX-mX, distY=e.pageY-mY, elapsed=Date.now()-mT;
    if (elapsed<=allowedTime && Math.abs(distX)>=threshold && Math.abs(distY)<=restraint){
      if (distX<0 && typeof onSwipeLeft==='function') onSwipeLeft(e);
      else if (distX>0 && typeof onSwipeRight==='function') onSwipeRight(e);
    }
  });
}
