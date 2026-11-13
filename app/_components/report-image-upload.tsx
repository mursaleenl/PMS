"use client";
import {useEffect,useId,useRef,useState} from "react";
import {Upload,X} from "lucide-react";
import {compressImage,type CompressedImage} from "@/lib/image-compression";

function ImagePreview({image,onClose}:{image:CompressedImage;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const node=dialog.current,previous=document.activeElement;
  node?.showModal();
  return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
 },[]);
 return <dialog ref={dialog} className="qa-image-dialog" aria-label="Image preview" onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}}>
  <header><h2>{image.name}</h2><button className="button button-quiet" type="button" aria-label="Close image preview" onClick={onClose}><X size={16} aria-hidden="true"/></button></header>
  <img src={image.dataUrl} alt="Full-size report image"/>
 </dialog>;
}

export function ReportImageUpload({value,onChange,onProcessingChange}:{value:CompressedImage|null;onChange:(image:CompressedImage|null)=>void;onProcessingChange:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState(false);
 const version=useRef(0),fileInput=useRef<HTMLInputElement>(null),helpId=useId();
 useEffect(()=>()=>{version.current++;},[]);
 return <div className="qa-image-upload">
  <div className="qa-image-upload-heading"><span>Image <span className="qa-image-optional">(optional)</span></span>{!value&&<button className="button button-quiet" type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={14} aria-hidden="true"/>Upload image</button>}</div>
  <input ref={fileInput} className="qa-image-file-input" type="file" name="image" aria-label="Image (optional)" aria-describedby={helpId} accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{
   const file=event.target.files?.[0];event.target.value="";if(!file)return;
   const current=++version.current;setBusy(true);setError("");onProcessingChange(true);
   try{const image=await compressImage(file);if(version.current===current)onChange(image);}
   catch(cause){if(version.current===current)setError(cause instanceof Error?cause.message:"Could not open the image.");}
   finally{if(version.current===current){setBusy(false);onProcessingChange(false);}}
  }}/>
  {value&&<div className="qa-image-preview">
   <button className="qa-image-thumbnail" type="button" aria-label="Preview image" disabled={busy} onClick={()=>setPreview(true)}><img src={value.dataUrl} alt="Report image preview"/></button>
   <div className="qa-image-info"><span className="qa-image-filename" title={value.name}>{value.name}</span><small>{Math.max(1,Math.round(value.bytes/1024))} KB · Click image to preview</small><div className="qa-image-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={()=>fileInput.current?.click()}>Replace image</button><button className="button button-quiet" type="button" disabled={busy} onClick={()=>{onChange(null);setError("");setPreview(false);}}>Remove image</button></div></div>
  </div>}
  <small id={helpId} className="qa-image-help">PNG, JPG or WebP · Up to 20 MB</small>
  {busy&&<small role="status">Preparing image…</small>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {preview&&value&&<ImagePreview image={value} onClose={()=>setPreview(false)}/>}
 </div>;
}
