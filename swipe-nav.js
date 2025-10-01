// js/swipe-nav.js
export function initSwipeNavigation({ container, onSwipeLeft, onSwipeRight, threshold = 40, restraint = 100, allowedTime = 600 }) {
  if (!container) container = document.body;
  let startX = 0, startY = 0, startTime = 0, tracking = false;

  const onTouchStart = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e.touches[0];
    startX = t.pageX; startY = t.pageY; startTime = Date.now(); tracking = true;
  };
  const onTouchEnd = (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches ? e.changedTouches[0] : e.touches[0];
    const distX = t.pageX - startX;
    const distY = t.pageY - startY;
    const elapsed = Date.now() - startTime;
    if (elapsed <= allowedTime && Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
      if (distX < 0 && typeof onSwipeLeft === 'function') onSwipeLeft(e);
      else if (distX > 0 && typeof onSwipeRight === 'function') onSwipeRight(e);
    }
  };
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  // simple mouse support
  let mDown = false, mX=0, mY=0, mTime=0;
  container.addEventListener('mousedown', (e)=>{ mDown=true; mX=e.pageX; mY=e.pageY; mTime=Date.now(); });
  container.addEventListener('mouseup', (e)=>{
    if (!mDown) return; mDown=false;
    const distX = e.pageX - mX, distY = e.pageY - mY, elapsed = Date.now()-mTime;
    if (elapsed <= allowedTime && Math.abs(distX) >= threshold && Math.abs(distY) <= restraint) {
      if (distX < 0 && typeof onSwipeLeft === 'function') onSwipeLeft(e);
      else if (distX > 0 && typeof onSwipeRight === 'function') onSwipeRight(e);
    }
  });
}
