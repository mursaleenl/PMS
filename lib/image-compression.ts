export const IMAGE_UPLOAD_TYPES=["image/png","image/jpeg","image/webp"];
export const MAX_IMAGE_SOURCE_BYTES=20*1024*1024;
export type CompressedImage={dataUrl:string;name:string;bytes:number;width:number;height:number};
export function readFileDataUrl(file:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error("Could not read the file."));reader.onerror=()=>reject(new Error("Could not read the file."));reader.readAsDataURL(file);});}
function encode(canvas:HTMLCanvasElement,type:string,quality?:number):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Could not optimize this image.")),type,quality));}
export async function compressImage(file:File,options:{maxDimension?:number;maxBytes?:number}={}):Promise<CompressedImage>{
 if(!IMAGE_UPLOAD_TYPES.includes(file.type))throw new Error("Choose a PNG, JPG, or WebP image.");
 if(!file.size||file.size>MAX_IMAGE_SOURCE_BYTES)throw new Error("Choose an image up to 20 MB.");
 const source=URL.createObjectURL(file),image=new Image();
 try{
  image.src=source;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)throw new Error("This image is too large. Choose an image under 40 megapixels.");
  const maxDimension=options.maxDimension??1600,maxBytes=options.maxBytes??350*1024;
  let scale=Math.min(1,maxDimension/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if(!context)throw new Error("Image optimization is unavailable in this browser.");
  for(let attempt=0;attempt<8;attempt++){
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(image,0,0,canvas.width,canvas.height);
   const png=await encode(canvas,"image/png");let smallest=png;
   for(const quality of [0.86,0.74,0.62]){const webp=await encode(canvas,"image/webp",quality);if(webp.size<smallest.size)smallest=webp;if(smallest.size<=maxBytes)break;}
   if(smallest.size<=maxBytes){const extension=smallest.type==="image/webp"?"webp":"png";const base=file.name.replace(/\.[^.]+$/,"").slice(0,180)||"image";return {dataUrl:await readFileDataUrl(smallest),name:`${base}.${extension}`,bytes:smallest.size,width:canvas.width,height:canvas.height};}
   scale*=0.75;
  }
  throw new Error("Could not reduce this image enough. Choose a smaller image.");
 }catch(cause){throw new Error(cause instanceof Error&&cause.name!=="EncodingError"?cause.message:"This image could not be opened. Choose another file.");}
 finally{URL.revokeObjectURL(source);}
}
