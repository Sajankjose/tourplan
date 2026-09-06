import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const cfg = window.TRIP_SUPABASE || {};
const configured =
  typeof cfg.url === "string" &&
  typeof cfg.anonKey === "string" &&
  cfg.url.startsWith("https://") &&
  !cfg.url.includes("PASTE_") &&
  cfg.anonKey.length > 20 &&
  !cfg.anonKey.includes("PASTE_");

const $ = id => document.getElementById(id);
const pill = $("cloudPill");
const pillText = $("cloudPillText");
const setupNotice = $("cloudSetupNotice");
const signedOut = $("cloudSignedOut");
const signedIn = $("cloudSignedIn");
const authMsg = $("cloudAuthMsg");
const syncMsg = $("cloudSyncMsg");
const debugMsg = $("cloudDebugMsg");
const userEl = $("cloudUser");
const lastSyncEl = $("cloudLastSync");

const LOCAL_KEY = "delhi_amritsar_trip_v1";
const TRIP_SLUG = "delhi-amritsar-oct-2026";
const POLL_MS = 12000;

function setPill(text, state=""){
  if(pillText) pillText.textContent = text;
  if(pill){
    pill.classList.remove("online","offline");
    if(state) pill.classList.add(state);
  }
}
function setMsg(el,text,kind=""){
  if(!el) return;
  el.textContent = text;
  el.classList.remove("ok","warn");
  if(kind) el.classList.add(kind);
}
function fmt(iso){
  if(!iso) return "Not yet";
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return "Not yet";
  return d.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
}
function isoMs(iso){
  const n = Date.parse(iso || "");
  return Number.isFinite(n) ? n : 0;
}
function localState(){
  if(window.tripApp?.getState) return window.tripApp.getState();
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); }
  catch { return {}; }
}
function meaningful(s){
  if(!s || typeof s !== "object") return false;
  const tickets=(s.tickets||[]).some(t=>t && (t.pnr || Number(t.amount)>0 || (t.carrier && !String(t.carrier).includes("12029"))));
  const expenses=Array.isArray(s.expenses) && s.expenses.length>0;
  const notes=["hotelNotes","foodNotes","generalNotes","delhiHotelAddress","amritsarHotelAddress"].some(k=>String(s[k]||"").trim());
  return tickets || expenses || notes;
}
function setLastSync(iso, version){
  if(iso){
    localStorage.setItem("trip_cloud_last_sync", iso);
    localStorage.setItem("trip_cloud_last_seen_updated_at", iso);
  }
  if(version != null) localStorage.setItem("trip_cloud_last_seen_version", String(version));
  if(lastSyncEl) lastSyncEl.textContent = fmt(iso);
  setPill("Synced · " + fmt(iso), "online");
}
function markCloudCheck(text){
  setMsg(debugMsg, text, "");
}

if(!configured){
  if(setupNotice) setupNotice.style.display="block";
  if(signedOut) signedOut.style.display="none";
  setPill("Cloud not configured","offline");
  markCloudCheck("Cloud sync is disabled until Supabase config is added.");
} else {
  const supabase = createClient(cfg.url, cfg.anonKey, {
    auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
  });

  let currentUser = null;
  let tripId = localStorage.getItem("trip_cloud_trip_id") || "";
  let syncing = false;
  let pulling = false;
  let pushDebounce = null;
  let pollTimer = null;

  async function ensureTrip(){
    if(!currentUser) throw new Error("Not signed in");

    if(tripId){
      const {data,error} = await supabase.from("trips").select("id").eq("id",tripId).maybeSingle();
      if(!error && data?.id) return tripId;
      tripId="";
      localStorage.removeItem("trip_cloud_trip_id");
    }

    const {data:existing,error:findErr} = await supabase
      .from("trips")
      .select("id")
      .eq("owner_id", currentUser.id)
      .eq("slug", TRIP_SLUG)
      .maybeSingle();
    if(findErr) throw findErr;

    if(existing?.id){
      tripId=existing.id;
    } else {
      const {data:created,error:createErr} = await supabase
        .from("trips")
        .insert({
          owner_id: currentUser.id,
          name:"Delhi + Amritsar",
          slug:TRIP_SLUG,
          start_date:"2026-10-10",
          end_date:"2026-10-14"
        })
        .select("id")
        .single();
      if(createErr) throw createErr;
      tripId=created.id;

      const {error:memberErr} = await supabase.from("trip_members").upsert(
        {trip_id:tripId,user_id:currentUser.id,role:"owner"},
        {onConflict:"trip_id,user_id"}
      );
      if(memberErr) throw memberErr;
    }

    localStorage.setItem("trip_cloud_trip_id", tripId);
    return tripId;
  }

  async function getCloud(){
    const id = await ensureTrip();
    const {data,error} = await supabase
      .from("trip_state")
      .select("data,updated_at,version,updated_by")
      .eq("trip_id",id)
      .maybeSingle();
    if(error) throw error;
    return data || null;
  }

  async function pushCloud({explicit=false}={}){
    if(!currentUser || syncing || pulling || !navigator.onLine) return;
    syncing=true;
    try{
      setPill("Syncing…","");
      setMsg(syncMsg,"Saving this device to cloud…","");
      const id = await ensureTrip();
      const state = localState();

      const {data:existing,error:readErr} = await supabase
        .from("trip_state")
        .select("version,updated_at")
        .eq("trip_id",id)
        .maybeSingle();
      if(readErr) throw readErr;

      // Protect against silently overwriting a newer cloud copy.
      const seen = isoMs(localStorage.getItem("trip_cloud_last_seen_updated_at"));
      const remote = isoMs(existing?.updated_at);
      if(existing && remote > seen + 500){
        setMsg(syncMsg,"A newer cloud copy was found. Refreshing before saving…","warn");
        syncing=false;
        await pullIfNewer({force:true, reload:true});
        return;
      }

      const nextVersion = (Number(existing?.version)||0)+1;
      const {data,error} = await supabase.from("trip_state").upsert({
        trip_id:id,
        data:state,
        version:nextVersion,
        updated_by:currentUser.id
      },{onConflict:"trip_id"}).select("updated_at,version").single();
      if(error) throw error;

      localStorage.setItem("trip_cloud_initialized","1");
      setLastSync(data.updated_at, data.version);
      setMsg(syncMsg,(explicit?"✓ Synced now":"✓ Synced")+" · "+fmt(data.updated_at),"ok");
      markCloudCheck("Cloud version "+data.version+" · checked "+fmt(new Date().toISOString()));
    }catch(err){
      console.error("pushCloud",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not sync: "+(err.message||"Unknown error"),"warn");
      markCloudCheck("Push failed. Check Supabase tables/RLS and network.");
    }finally{
      syncing=false;
    }
  }

  async function applyCloud(row,{reload=true}={}){
    if(!row?.data) return false;
    pulling=true;
    try{
      localStorage.setItem("trip_cloud_initialized","1");
      setLastSync(row.updated_at, row.version);
      setMsg(syncMsg,"✓ Newer cloud data received · "+fmt(row.updated_at),"ok");
      markCloudCheck("Cloud version "+row.version+" loaded.");
      if(window.tripApp?.replaceState && reload){
        window.tripApp.replaceState(row.data);
      }else{
        localStorage.setItem(LOCAL_KEY, JSON.stringify(row.data));
        if(reload) location.reload();
      }
      return true;
    }finally{
      // If replaceState reloads the page this is moot, but keep state correct when reload=false.
      pulling=false;
    }
  }

  async function pullIfNewer({force=false,reload=true}={}){
    if(!currentUser || pulling || syncing || !navigator.onLine) return false;
    pulling=true;
    try{
      setPill(force?"Refreshing…":"Checking cloud…","");
      const row = await getCloud();

      if(!row?.data){
        setPill("Signed in","online");
        setMsg(syncMsg,"No cloud copy exists yet. Upload this device first.","warn");
        markCloudCheck("Cloud checked: no trip_state row yet.");
        return false;
      }

      const cloudMs = isoMs(row.updated_at);
      const seenMs = isoMs(localStorage.getItem("trip_cloud_last_seen_updated_at"));
      const cloudVersion = Number(row.version)||0;
      const seenVersion = Number(localStorage.getItem("trip_cloud_last_seen_version")||0);

      markCloudCheck("Cloud v"+cloudVersion+" checked "+fmt(new Date().toISOString()));

      if(force || cloudVersion > seenVersion || cloudMs > seenMs + 500){
        pulling=false; // applyCloud manages it again
        return await applyCloud(row,{reload});
      }

      setLastSync(row.updated_at,row.version);
      setMsg(syncMsg,"✓ Up to date · cloud checked just now","ok");
      return false;
    }catch(err){
      console.error("pullIfNewer",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not check cloud: "+(err.message||"Unknown error"),"warn");
      markCloudCheck("Cloud check failed.");
      return false;
    }finally{
      pulling=false;
    }
  }

  async function firstSync(){
    const row = await getCloud();
    const local = localState();

    if(!row?.data){
      await pushCloud({explicit:true});
      return;
    }

    const initialized = localStorage.getItem("trip_cloud_initialized")==="1";
    if(!initialized){
      if(meaningful(local)){
        // First time on a device with local data: don't guess which copy wins.
        setPill("Choose sync copy","online");
        setMsg(syncMsg,"This device and the cloud both contain trip data. Choose “Refresh from cloud” or “Upload this device”.","warn");
        markCloudCheck("Cloud v"+row.version+" found. Waiting for your choice.");
      }else{
        await applyCloud(row,{reload:true});
      }
      return;
    }

    // Important v5 change: initialized devices ALWAYS compare with cloud on startup.
    localStorage.setItem("trip_cloud_last_seen_updated_at",
      localStorage.getItem("trip_cloud_last_seen_updated_at") || "1970-01-01T00:00:00Z"
    );
    await pullIfNewer({force:false,reload:true});
  }

  function renderAuth(user){
    currentUser=user||null;
    if(user){
      if(signedOut) signedOut.style.display="none";
      if(signedIn) signedIn.style.display="block";
      if(userEl) userEl.textContent=user.email||"Signed in";
      const last=localStorage.getItem("trip_cloud_last_sync");
      if(lastSyncEl) lastSyncEl.textContent=fmt(last);
      setPill(navigator.onLine ? (last ? "Synced · "+fmt(last) : "Signed in") : "Offline",
              navigator.onLine?"online":"offline");
    } else {
      if(signedOut) signedOut.style.display="block";
      if(signedIn) signedIn.style.display="none";
      setPill("Local only","");
      markCloudCheck("Sign in to enable multi-device sync.");
    }
  }

  function startPolling(){
    if(pollTimer) clearInterval(pollTimer);
    pollTimer=setInterval(()=>{
      if(currentUser && navigator.onLine && document.visibilityState==="visible"){
        pullIfNewer({force:false,reload:true});
      }
    },POLL_MS);
  }

  $("cloudLoginBtn")?.addEventListener("click",async()=>{
    const email=String($("cloudEmail")?.value||"").trim();
    if(!email){setMsg(authMsg,"Enter your email address.","warn");return}
    setMsg(authMsg,"Sending sign-in link…","");
    const redirectTo=location.origin+location.pathname;
    const {error}=await supabase.auth.signInWithOtp({
      email,
      options:{emailRedirectTo:redirectTo,shouldCreateUser:true}
    });
    if(error) setMsg(authMsg,"Could not send link: "+error.message,"warn");
    else setMsg(authMsg,"✓ Sign-in link sent. Open it to connect this device.","ok");
  });

  $("cloudLogoutBtn")?.addEventListener("click",async()=>{
    await supabase.auth.signOut();
    currentUser=null;
    if(pollTimer) clearInterval(pollTimer);
    renderAuth(null);
  });

  $("cloudSyncBtn")?.addEventListener("click",async()=>{
    // Manual "Sync now" first checks if remote is newer, then pushes if not.
    const changed=await pullIfNewer({force:false,reload:true});
    if(!changed) await pushCloud({explicit:true});
  });

  $("cloudPushBtn")?.addEventListener("click",async()=>{
    // Explicit override intentionally uploads local state.
    const id=await ensureTrip();
    const state=localState();
    const {data:existing,error:readErr}=await supabase.from("trip_state").select("version").eq("trip_id",id).maybeSingle();
    if(readErr){setMsg(syncMsg,"Could not read cloud: "+readErr.message,"warn");return}
    const nextVersion=(Number(existing?.version)||0)+1;
    const {data,error}=await supabase.from("trip_state").upsert({
      trip_id:id,data:state,version:nextVersion,updated_by:currentUser.id
    },{onConflict:"trip_id"}).select("updated_at,version").single();
    if(error){setMsg(syncMsg,"Upload failed: "+error.message,"warn");return}
    localStorage.setItem("trip_cloud_initialized","1");
    setLastSync(data.updated_at,data.version);
    setMsg(syncMsg,"✓ This device uploaded · "+fmt(data.updated_at),"ok");
    markCloudCheck("Cloud v"+data.version+" updated from this device.");
  });

  $("cloudPullBtn")?.addEventListener("click",async()=>{
    await pullIfNewer({force:true,reload:true});
  });

  window.addEventListener("trip:local-save",()=>{
    if(!currentUser || !navigator.onLine) return;
    clearTimeout(pushDebounce);
    setPill("Saving…","");
    pushDebounce=setTimeout(()=>pushCloud(),900);
  });

  window.addEventListener("online",()=>{
    if(currentUser){
      setPill("Online · checking","online");
      pullIfNewer({force:false,reload:true});
    }
  });
  window.addEventListener("offline",()=>{
    if(currentUser) setPill("Offline","offline");
  });
  window.addEventListener("focus",()=>{
    if(currentUser && navigator.onLine) pullIfNewer({force:false,reload:true});
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && currentUser && navigator.onLine){
      pullIfNewer({force:false,reload:true});
    }
  });

  const {data:{session}}=await supabase.auth.getSession();
  renderAuth(session?.user||null);
  if(session?.user){
    try{
      await firstSync();
      startPolling();
    }catch(err){
      console.error("firstSync",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
      markCloudCheck("Initial cloud check failed.");
    }
  }

  supabase.auth.onAuthStateChange(async(_event,session)=>{
    renderAuth(session?.user||null);
    if(session?.user){
      try{
        await firstSync();
        startPolling();
      }catch(err){
        console.error("auth sync",err);
        setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
      }
    }
  });
}
