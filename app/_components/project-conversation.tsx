"use client";
import {useEffect,useState,type FormEvent} from "react";
import {MessageSquareText,RefreshCw,Send} from "lucide-react";
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
  return <section className="project-conversation" aria-busy={loading}>
    <header className="conversation-heading">
      <div><span className="section-kicker">Project updates</span><h2>Project conversation</h2><p>Share decisions and updates with everyone on this project.</p></div>
      <button className="button button-quiet conversation-refresh" type="button" onClick={()=>setAttempt(value=>value+1)} disabled={loading}><RefreshCw size={14}/>Refresh</button>
    </header>
    <div className={`conversation-messages ${messages.length===0&&!loading?"is-empty":""}`} aria-live="polite">
      {loading?<p className="conversation-loading" role="status">Loading messages…</p>:messages.length?messages.map(item=><article key={item.id}>
        <div className="conversation-message-meta"><strong>{item.sender_name}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></div>
        <p>{item.body}</p>
      </article>):<div className="conversation-empty"><span><MessageSquareText size={20}/></span><strong>No messages yet</strong><p>Start the conversation with your project team.</p></div>}
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <form className="conversation-composer" onSubmit={send}>
      <label className="field" htmlFor="project-message">Message</label>
      <textarea id="project-message" required maxLength={5000} rows={3} value={message} onChange={event=>setMessage(event.target.value)} placeholder="Message for the project team…" />
      <div className="conversation-composer-footer"><span>Messages are shared with the project team.</span><button className="button button-primary" disabled={busy || !message.trim()}><Send size={14}/>{busy?"Sending…":"Send message"}</button></div>
    </form>
  </section>;
}
