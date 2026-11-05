"use client";

// Print a standalone document so invoice and workspace CSS cannot affect proposals.
export async function printProposal(source:HTMLElement){
 const frame=document.createElement('iframe');
 frame.title='Proposal print document';
 frame.setAttribute('aria-hidden','true');
 frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
 document.body.appendChild(frame);
 try{
  const doc=frame.contentDocument!;
  doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Proposal</title></head><body></body></html>');doc.close();
  doc.title=source.querySelector('h1')?.textContent||'Proposal';
  const style=doc.createElement('style');
  style.textContent=`
   @page { size: A4 portrait; margin: 16mm 15mm; }
   * { box-sizing: border-box; }
   html,body { margin:0; padding:0; width:auto; height:auto; overflow:visible; background:white; color:#000000; }
   body { font-family:Arial,Helvetica,sans-serif; font-size:10pt; line-height:1.55; }
   main { width:100%; margin:0; padding:0; }
   .client-proposal-header { padding-bottom:5mm; border-bottom:1px solid #d4d4d8; }
   .client-proposal-logo { width:14mm; height:17mm; object-fit:contain; display:block; }
   .client-proposal-logo-servn { width:42mm; height:auto; }
   .client-proposal-hero { padding:7mm 0 6mm; border-bottom:1px solid #e4e4e7; break-inside:avoid; }
   .client-proposal-kicker { font-size:8pt; letter-spacing:.12em; text-transform:uppercase; color:#71717a; margin:0 0 3mm; }
   h1 { font-size:24pt; line-height:1.2; letter-spacing:-.03em; margin:0 0 4mm; }
   .client-proposal-intro { font-size:11pt; margin:0; }
   .client-proposal-project-title,.client-proposal-prepared-by { margin:2mm 0; }
   .client-proposal-content { padding-top:4mm; }
   .client-proposal-card { break-inside:auto; page-break-inside:auto; padding:4mm 0; margin:0 0 3mm; border-bottom:1px solid #e4e4e7; }
   h2 { font-size:13pt; line-height:1.3; margin:0 0 3mm; break-after:avoid; page-break-after:avoid; }
   h3 { font-size:10pt; margin:3mm 0 1.5mm; break-after:avoid; page-break-after:avoid; }
   p { margin:0 0 2mm; white-space:pre-wrap; orphans:3; widows:3; overflow-wrap:anywhere; }
   ul { margin:0 0 3mm; padding-left:5mm; }
   li { padding-left:1mm; margin:0 0 1.5mm; break-inside:avoid; }
   .client-proposal-price { border-block:1px solid #d4d4d8; padding:4mm 0; margin:4mm 0; break-inside:avoid; }
   .client-proposal-price span,.client-proposal-price strong,.client-proposal-price small { display:block; }
   .client-proposal-price strong { font-size:20pt; letter-spacing:-.02em; margin:1mm 0; }
   .client-proposal-price small { color:#52525b; font-size:9pt; }
   .client-proposal-contact strong,.client-proposal-contact span { display:block; }
   .client-proposal-signature-section { padding:5mm 0 0; margin-top:4mm; border:0; border-top:1px solid #d4d4d8; background:transparent; break-inside:avoid; }
   .client-proposal-acceptance-details { display:flex; gap:15mm; margin:4mm 0 0; }
   .client-proposal-acceptance-details div { flex:1; }
   dt { font-size:9pt; color:#71717a; } dd { margin:1.5mm 0 0; font-weight:600; }
   .client-proposal-footer { margin-top:5mm; padding-top:3mm; border-top:1px solid #e4e4e7; color:#71717a; font-size:8pt; }
   .client-proposal-card,.client-proposal-signature-section { box-shadow:none; }
  `;
  doc.head.appendChild(style);
  const copy=source.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.client-proposal-header-actions,.client-proposal-actions,.client-proposal-response-form,.client-proposal-response-saved,.client-proposal-notice,.client-proposal-toc,.client-proposal-template-grid').forEach(node=>node.remove());
  copy.querySelectorAll('img').forEach(img=>{img.src=new URL(img.getAttribute('src')||'',window.location.href).href;});
  doc.body.appendChild(copy);
  await doc.fonts.ready;
  await Promise.all(Array.from(doc.images).map(img=>img.decode()));
  await new Promise<void>(resolve=>frame.contentWindow!.requestAnimationFrame(()=>resolve()));
  frame.contentWindow!.focus();frame.contentWindow!.print();
  // Keep the document alive while Safari's native print/save dialog is open.
  frame.contentWindow!.addEventListener('afterprint',()=>frame.remove(),{once:true});
  setTimeout(()=>frame.remove(),120000);
 }catch(error){frame.remove();throw error;}
}
