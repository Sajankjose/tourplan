import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const cfg = window.TRIP_SUPABASE || {};
const configured =
  typeof cfg.url === "string" &&
  typeof cfg.anonKey === "string" &&
  cfg.url.startsWith("https://") &&
  !cfg.url.includes("PASTE_") &&
  cfg.anonKey.length > 30 &&
  !cfg.anonKey.includes("PASTE_");

const $ = id => document.getElementById(id);
const pill = $("cloudPill"), pillText = $("cloudPillText");
const setupNotice = $("cloudSetupNotice"), signedOut = $("cloudSignedOut"), signedIn = $("cloudSignedIn");
const authMsg = $("cloudAuthMsg"), syncMsg = $("cloudSyncMsg"), userEl = $("cloudUser"), lastSyncEl = $("cloudLastSync");

function setPill(text,state=""){
  if(pillText)pillText.textContent=text;
  if(pill){pill.classList.remove("online","offline");if(state)pill.classList.add(state)}
}
function setMsg(el,text,kind=""){
  if(!el)return; el.textContent=text; el.classList.remove("ok","warn"); if(kind)el.classList.add(kind);
}
function fmt(iso){
  if(!iso)return "Not yet";
  const d=new Date(iso); if(Number.isNaN(d.getTime()))return "Not yet";
  return d.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
}
function localState(){
  if(window.tripApp?.getState)return window.tripApp.getState();
  try{return JSON.parse(localStorage.getItem("delhi_amritsar_trip_v1")||"{}")}catch{return {}}
}
function meaningful(s){
  if(!s||typeof s!=="object")return false;
  const tickets=(s.tickets||[]).some(t=>t&&(t.pnr||Number(t.amount)>0||(t.carrier&&!String(t.carrier).includes("12029"))));
  const expenses=Array.isArray(s.expenses)&&s.expenses.length>0;
  const notes=["hotelNotes","foodNotes","generalNotes","delhiHotelAddress","amritsarHotelAddress"].some(k=>String(s[k]||"").trim());
  return tickets||expenses||notes;
}

if(!configured){
  if(setupNotice)setupNotice.style.display="block";
  if(signedOut)signedOut.style.display="none";
  setPill("Cloud not configured","offline");
} else {
  const supabase=createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let currentUser=null;
  let tripId=localStorage.getItem("trip_cloud_trip_id")||"";
  let syncing=false, debounce=null;

  async function ensureTrip(){
    if(!currentUser)throw new Error("Not signed in");
    if(tripId){
      const {data,error}=await supabase.from("trips").select("id").eq("id",tripId).maybeSingle();
      if(!error&&data?.id)return tripId;
      tripId=""; localStorage.removeItem("trip_cloud_trip_id");
    }
    const {data:existing,error:findErr}=await supabase.from("trips").select("id").eq("owner_id",currentUser.id).eq("slug","delhi-amritsar-oct-2026").maybeSingle();
    if(findErr)throw findErr;
    if(existing?.id){
      tripId=existing.id;
    }else{
      const {data:created,error:createErr}=await supabase.from("trips").insert({
        owner_id:currentUser.id,name:"Delhi + Amritsar",slug:"delhi-amritsar-oct-2026",start_date:"2026-10-10",end_date:"2026-10-14"
      }).select("id").single();
      if(createErr)throw createErr;
      tripId=created.id;
      const {error:memberErr}=await supabase.from("trip_members").upsert({trip_id:tripId,user_id:currentUser.id,role:"owner"},{onConflict:"trip_id,user_id"});
      if(memberErr)throw memberErr;
    }
    localStorage.setItem("trip_cloud_trip_id",tripId);
    return tripId;
  }

  async function getCloud(){
    const id=await ensureTrip();
    const {data,error}=await supabase.from("trip_state").select("data,updated_at,version").eq("trip_id",id).maybeSingle();
    if(error)throw error; return data||null;
  }

  async function pushCloud({explicit=false}={}){
    if(!currentUser||syncing)return;
    syncing=true;
    try{
      setPill("Syncing…",""); setMsg(syncMsg,"Saving this device to cloud…","");
      const id=await ensureTrip(), state=localState();
      const {data:existing,error:readErr}=await supabase.from("trip_state").select("version").eq("trip_id",id).maybeSingle();
      if(readErr)throw readErr;
      const nextVersion=(Number(existing?.version)||0)+1;
      const {data,error}=await supabase.from("trip_state").upsert({
        trip_id:id,data:state,version:nextVersion,updated_by:currentUser.id
      },{onConflict:"trip_id"}).select("updated_at").single();
      if(error)throw error;
      localStorage.setItem("trip_cloud_last_sync",data.updated_at);
      localStorage.setItem("trip_cloud_initialized","1");
      if(lastSyncEl)lastSyncEl.textContent=fmt(data.updated_at);
      setPill("Synced","online");
      setMsg(syncMsg,(explicit?"✓ Synced now":"✓ Synced")+" · "+fmt(data.updated_at),"ok");
    }catch(err){
      console.error(err); setPill("Sync error","offline"); setMsg(syncMsg,"Could not sync: "+(err.message||"Unknown error"),"warn");
    }finally{syncing=false}
  }

  async function pullCloud(){
    if(!currentUser)return;
    try{
      setPill("Loading cloud…","");
      const row=await getCloud();
      if(!row?.data){setMsg(syncMsg,"No cloud copy exists yet. Upload this device first.","warn");setPill("Signed in","online");return}
      localStorage.setItem("trip_cloud_last_sync",row.updated_at||"");
      localStorage.setItem("trip_cloud_initialized","1");
      if(window.tripApp?.replaceState)window.tripApp.replaceState(row.data);
      else{localStorage.setItem("delhi_amritsar_trip_v1",JSON.stringify(row.data));location.reload()}
    }catch(err){
      console.error(err); setPill("Sync error","offline"); setMsg(syncMsg,"Could not load cloud copy: "+(err.message||"Unknown error"),"warn");
    }
  }

  async function firstSync(){
    const row=await getCloud(), local=localState();
    if(!row?.data){await pushCloud();return}
    const initialized=localStorage.getItem("trip_cloud_initialized")==="1";
    if(!initialized){
      if(meaningful(local)){
        setMsg(syncMsg,"Cloud data already exists and this device also has trip data. Choose “Use cloud copy” or “Upload this device”.","warn");
        setPill("Choose sync copy","online");
      }else{
        localStorage.setItem("trip_cloud_initialized","1");
        if(window.tripApp?.replaceState)window.tripApp.replaceState(row.data);
      }
    }else{
      setPill("Synced","online"); setMsg(syncMsg,"Cloud copy found. Changes will autosync.","ok");
    }
  }

  function renderAuth(user){
    currentUser=user||null;
    if(user){
      if(signedOut)signedOut.style.display="none"; if(signedIn)signedIn.style.display="block";
      if(userEl)userEl.textContent=user.email||"Signed in";
      const last=localStorage.getItem("trip_cloud_last_sync"); if(lastSyncEl)lastSyncEl.textContent=fmt(last);
      setPill(navigator.onLine?"Signed in":"Offline",navigator.onLine?"online":"offline");
    }else{
      if(signedOut)signedOut.style.display="block"; if(signedIn)signedIn.style.display="none"; setPill("Local only","");
    }
  }

  $("cloudLoginBtn")?.addEventListener("click",async()=>{
    const email=String($("cloudEmail")?.value||"").trim();
    if(!email){setMsg(authMsg,"Enter your email address.","warn");return}
    setMsg(authMsg,"Sending sign-in link…","");
    const redirectTo=location.origin+location.pathname;
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
    if(error)setMsg(authMsg,"Could not send link: "+error.message,"warn");
    else setMsg(authMsg,"✓ Sign-in link sent. Open it on this device to connect the trip.","ok");
  });
  $("cloudLogoutBtn")?.addEventListener("click",async()=>{await supabase.auth.signOut();currentUser=null;renderAuth(null)});
  $("cloudSyncBtn")?.addEventListener("click",()=>pushCloud({explicit:true}));
  $("cloudPushBtn")?.addEventListener("click",()=>pushCloud({explicit:true}));
  $("cloudPullBtn")?.addEventListener("click",()=>pullCloud());

  window.addEventListener("trip:local-save",()=>{
    if(!currentUser)return;
    clearTimeout(debounce); setPill("Saving…","");
    debounce=setTimeout(()=>pushCloud(),1300);
  });
  window.addEventListener("online",()=>currentUser&&setPill("Online · syncing","online"));
  window.addEventListener("offline",()=>currentUser&&setPill("Offline","offline"));

  const {data:{session}}=await supabase.auth.getSession();
  renderAuth(session?.user||null);
  if(session?.user){try{await firstSync()}catch(err){console.error(err);setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn")}}
  supabase.auth.onAuthStateChange(async(_event,session)=>{
    renderAuth(session?.user||null);
    if(session?.user){try{await firstSync()}catch(err){console.error(err);setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn")}}
  });
}
