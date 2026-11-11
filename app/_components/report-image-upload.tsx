"use client";
import {useEffect,useRef,useState} from "react";
import {compressImage,type CompressedImage} from "@/lib/image-compression";
export function ReportImageUpload({value,onChange,onProcessingChange}:{value:CompressedImage|null;onChange:(image:CompressedImage|null)=>void;onProcessingChange:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const version=useRef(0);
 useEffect(()=>()=>{version.current++;},[]);
 return <div className="qa-image-upload"><label className="field">Image (optional)<input type="file" name="image" aria-label="Image (optional)" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{
  const file=event.target.files?.[0];event.target.value="";if(!file)return;
  const current=++version.current;setBusy(true);setError("");onProcessingChange(true);
  try{const image=await compressImage(file);if(version.current===current)onChange(image);}
  catch(cause){if(version.current===current)setError(cause instanceof Error?cause.message:"Could not open the image.");}
  finally{if(version.current===current){setBusy(false);onProcessingChange(false);}}
 }}/><small>PNG, JPG or WebP, up to 20 MB. Optimized before saving.</small></label>
 {busy&&<small role="status">Optimizing image…</small>}
 {error&&<p className="form-error" role="alert">{error}</p>}
 {value&&<div className="qa-image-preview"><img src={value.dataUrl} alt="Report image preview"/><div><span>{value.name}</span><small>{Math.max(1,Math.round(value.bytes/1024))} KB</small><button className="button button-quiet" type="button" disabled={busy} onClick={()=>{onChange(null);setError("");}}>Remove image</button></div></div>}
 </div>;
}
