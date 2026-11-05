"use client";
import {useEffect,useRef} from 'react';

// Refresh visible data without navigating or remounting the current page.
export function useLiveRefresh(refresh:()=>void,enabled=true){
 const callback=useRef(refresh);callback.current=refresh;
 useEffect(()=>{
  if(!enabled)return;
  let last=0;
  const update=()=>{if(document.hidden||Date.now()-last<5000)return;last=Date.now();callback.current();};
  const timer=window.setInterval(update,10000);
  window.addEventListener('focus',update);
  window.addEventListener('online',update);
  document.addEventListener('visibilitychange',update);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};
 },[enabled]);
}
