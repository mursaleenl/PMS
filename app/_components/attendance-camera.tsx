"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {Camera,ScanLine,X} from "lucide-react";
import {attendanceScanPath} from "@/lib/attendance-scan";

export function AttendanceCamera({onClose}:{onClose:()=>void}) {
  const router=useRouter();
  const dialogRef=useRef<HTMLDialogElement>(null),videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null),frameRef=useRef<number>(0),generation=useRef(0);
  const [active,setActive]=useState(false),[starting,setStarting]=useState(false),[error,setError]=useState("");
  function stop(){
    generation.current++;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;
    if(videoRef.current)videoRef.current.srcObject=null;
  }
  useEffect(()=>{
    const dialog=dialogRef.current,previous=document.activeElement as HTMLElement|null;
    dialog?.showModal();
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    const pause=()=>{if(document.hidden){stop();setActive(false);setStarting(false);}};
    document.addEventListener("visibilitychange",pause);
    return ()=>{stop();dialog?.close();document.body.style.overflow=overflow;document.removeEventListener("visibilitychange",pause);previous?.focus();};
  },[]);
  function follow(value:string){
    const path=attendanceScanPath(value,window.location.origin);
    if(!path){setError("Use the attendance QR displayed by your office.");return false;}
    stop();router.push(path);onClose();return true;
  }
  async function start(){
    if(starting||active)return;
    setStarting(true);setError("");
    const request=++generation.current;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access needs HTTPS or localhost. You can paste the office attendance link below.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(request!==generation.current){stream.getTracks().forEach(track=>track.stop());return;}
      streamRef.current=stream;
      const video=videoRef.current;
      if(!video){stop();return;}
      video.srcObject=stream;await video.play();
      const {default:decode}=await import("jsqr");
      if(request!==generation.current)return;
      setActive(true);setStarting(false);
      const canvas=document.createElement("canvas"),context=canvas.getContext("2d",{willReadFrequently:true});
      if(!context)throw new Error("This browser cannot scan video. Paste the office attendance link below.");
      let last=0;
      const scan=(time:number)=>{
        if(request!==generation.current)return;
        if(time-last>200&&video.readyState>=2&&video.videoWidth){
          last=time;
          const scale=Math.min(1,720/video.videoWidth);
          canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
          context.drawImage(video,0,0,canvas.width,canvas.height);
          const pixels=context.getImageData(0,0,canvas.width,canvas.height);
          const result=decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:"dontInvert"});
          if(result&&follow(result.data))return;
        }
        frameRef.current=requestAnimationFrame(scan);
      };
      frameRef.current=requestAnimationFrame(scan);
    }catch(cause){
      if(request!==generation.current)return;
      stop();setActive(false);setStarting(false);
      setError(cause instanceof DOMException&&cause.name==="NotAllowedError"?"Camera permission was denied. Allow camera access in your browser, or paste the office attendance link.":cause instanceof Error?cause.message:"Unable to open the camera. Try again or paste the office attendance link.");
    }
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();follow(String(new FormData(event.currentTarget).get("link")||""));}
  return <dialog ref={dialogRef} className="attendance-camera-dialog" aria-labelledby="attendance-camera-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="scanner-heading"><div><span className="section-kicker">Office attendance</span><h2 id="attendance-camera-title">Scan attendance QR</h2></div><button className="scanner-close" type="button" aria-label="Close attendance scanner" onClick={onClose}><X size={20}/></button></div>
    <p>Point your camera at the current office QR. You’ll confirm check-in or check-out on the next screen.</p>
    <div className={`camera-view ${active?"camera-active":""}`}><video ref={videoRef} muted playsInline aria-label="Attendance camera"/>{!active&&<div className="camera-placeholder"><ScanLine size={40}/><span>{starting?"Opening camera…":"Position the office QR inside the frame"}</span></div>}<span className="camera-frame" aria-hidden="true"/></div>
    <div className="scanner-actions">{active?<button className="button button-quiet" onClick={()=>{stop();setActive(false);}}>Stop camera</button>:<button className="button button-primary" onClick={()=>void start()} disabled={starting}><Camera size={17}/>{starting?"Opening camera…":"Start camera"}</button>}<span role="status">{active?"Looking for office QR…":"Camera starts only when you’re ready."}</span></div>
    {error&&<p role="alert" className="form-error">{error}</p>}
    <details className="scanner-link-fallback"><summary>Use an attendance link instead</summary><form onSubmit={submit}><label className="field">Office attendance link<input name="link" type="text" inputMode="url" autoComplete="off" required placeholder="Paste the office QR link"/></label><button className="button button-quiet" type="submit">Continue to confirmation</button></form></details>
  </dialog>;
}
