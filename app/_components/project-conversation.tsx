"use client";
import {useEffect,useState,type FormEvent} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
type Message={id:string;body:string;sender_name:string;created_at:string};
export function ProjectConversation({projectId}:{projectId:string}) {
  const {session}=useWorkspaceAuth();
  const [messages,setMessages]=useState<Message[]>([]),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!session) return;
    const controller=new AbortController();setLoading(true);setError("");
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/messages`,{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:"no-store"})
      .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error);setMessages(result.messages);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load conversation.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[projectId,session,attempt]);
  async function send(event:FormEvent) {
    event.preventDefault();if(busy || !message.trim() || !session)return;
    setBusy(true);setError("");
    try {
      const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({message})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setMessage("");setAttempt(value=>value+1);
    } catch(cause) {setError(cause instanceof Error?cause.message:"Message could not be sent.");}
    finally {setBusy(false);}
  }
  return <section className="project-conversation"><div className="panel-heading"><h2>Project conversation</h2><button className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Refresh messages</button></div>{loading?<p role="status">Loading messages…</p>:<div className="conversation-messages" aria-live="polite">{messages.length?messages.map(item=><article key={item.id}><strong>{item.sender_name}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time><p>{item.body}</p></article>):<p>No messages yet. Start a conversation with your project team.</p>}</div>}{error&&<p className="form-error" role="alert">{error}</p>}<form onSubmit={send}><label className="field">Message<textarea required maxLength={5000} rows={3} value={message} onChange={event=>setMessage(event.target.value)} /></label><button className="button button-primary" disabled={busy || !message.trim()}>{busy?"Sending…":"Send message"}</button></form></section>;
}
