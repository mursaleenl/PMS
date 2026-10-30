"use client";

import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {ScanLine} from "lucide-react";
import {attendanceScanPath} from "@/lib/attendance-scan";

type NativeQrDetector = {detect(source:CanvasImageSource):Promise<Array<{rawValue:string}>>};
type NativeQrDetectorConstructor = new(options?:{formats:string[]})=>NativeQrDetector;

export function AttendanceCamera({onClose}:{onClose:()=>void}) {
  const router=useRouter();
  const dialogRef=useRef<HTMLDialogElement>(null),videoRef=useRef<HTMLVideoElement>(null);
  const streamRef=useRef<MediaStream|null>(null),frameRef=useRef<number>(0),generation=useRef(0);
  const startRef=useRef<()=>void>(()=>{});
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
    const cameraStartFrame=requestAnimationFrame(()=>startRef.current());
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    const visibility=()=>{
      if(document.hidden){stop();setActive(false);setStarting(false);}
      else if(dialog?.open)requestAnimationFrame(()=>{if(dialogRef.current?.open)startRef.current();});
    };
    document.addEventListener("visibilitychange",visibility);
    return ()=>{cancelAnimationFrame(cameraStartFrame);stop();dialog?.close();document.body.style.overflow=overflow;document.removeEventListener("visibilitychange",visibility);previous?.focus();};
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
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access needs HTTPS or localhost.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(request!==generation.current){stream.getTracks().forEach(track=>track.stop());return;}
      streamRef.current=stream;
      const video=videoRef.current;
      if(!video){stop();return;}
      video.srcObject=stream;await video.play();
      const {default:decode}=await import("jsqr");
      if(request!==generation.current)return;
      const Detector=(window as Window&{BarcodeDetector?:NativeQrDetectorConstructor}).BarcodeDetector;
      let detector:NativeQrDetector|undefined;
      if(Detector){try{detector=new Detector({formats:["qr_code"]});}catch{}}
      setActive(true);setStarting(false);
      const canvas=document.createElement("canvas"),context=canvas.getContext("2d",{willReadFrequently:true});
      if(!context)throw new Error("This browser cannot scan QR codes from video.");
      let last=0,scanning=false;
      const scan=async(time:number)=>{
        if(request!==generation.current)return;
        if(!scanning&&time-last>140&&video.readyState>=2&&video.videoWidth){
          last=time;
          scanning=true;
          try{
            let nativeResults:Array<{rawValue:string}>=[];
            if(detector){try{nativeResults=await detector.detect(video);}catch{detector=undefined;}}
            if(request!==generation.current)return;
            if(nativeResults[0]&&follow(nativeResults[0].rawValue))return;
            const scale=Math.min(1,1280/video.videoWidth);
            canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
            context.drawImage(video,0,0,canvas.width,canvas.height);
            const pixels=context.getImageData(0,0,canvas.width,canvas.height);
            const result=decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:"attemptBoth"});
            if(result&&follow(result.data))return;
          }catch{
            // Mobile browsers may briefly make a camera frame unavailable while refocusing.
          }finally{scanning=false;}
        }
        frameRef.current=requestAnimationFrame(scan);
      };
      frameRef.current=requestAnimationFrame(scan);
    }catch(cause){
      if(request!==generation.current)return;
      stop();setActive(false);setStarting(false);
      setError(cause instanceof DOMException&&cause.name==="NotAllowedError"?"Camera permission was denied. Allow camera access to scan attendance.":cause instanceof Error?cause.message:"Unable to open the camera.");
    }
  }
  startRef.current=()=>void start();
  return <dialog ref={dialogRef} className="attendance-camera-dialog" aria-labelledby="attendance-camera-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="scanner-heading"><div><span className="section-kicker">Office attendance</span><h2 id="attendance-camera-title">Scan attendance QR</h2></div></div>
    <p>Point your camera at the current office QR to record your attendance.</p>
    <div className={`camera-view ${active?"camera-active":""}`}><video ref={videoRef} muted playsInline aria-label="Attendance camera"/>{!active&&<div className="camera-placeholder"><ScanLine size={40}/><span>{starting?"Opening camera…":"Position the office QR inside the frame"}</span></div>}<span className="camera-frame" aria-hidden="true"/></div>
    <div className="scanner-actions"><span role="status">{active?"Looking for office QR…":starting?"Opening camera…":"Camera is unavailable."}</span></div>
    {error&&<p role="alert" className="form-error">{error}</p>}
  </dialog>;
}
