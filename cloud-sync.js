import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const cfg=window.TRIP_SUPABASE||{};
const configured=
  typeof cfg.url==="string" &&
  typeof cfg.anonKey==="string" &&
  cfg.url.startsWith("https://") &&
  !cfg.url.includes("PASTE_") &&
  cfg.anonKey.length>20 &&
  !cfg.anonKey.includes("PASTE_");

const $=id=>document.getElementById(id);
const LOCAL_KEY="delhi_amritsar_trip_v1";
const POLL_MS=8000;

const pill=$("cloudPill"),pillText=$("cloudPillText");
const setupNotice=$("cloudSetupNotice"),signedOut=$("cloudSignedOut"),signedIn=$("cloudSignedIn");
const authMsg=$("cloudAuthMsg"),syncMsg=$("cloudSyncMsg"),debugMsg=$("cloudDebugMsg");
const userEl=$("cloudUser"),lastSyncEl=$("cloudLastSync");
const initPanel=$("cloudInitPanel"),readyActions=$("cloudReadyActions");

function setPill(text,state=""){
  if(pillText)pillText.textContent=text;
  if(pill){pill.classList.remove("online","offline");if(state)pill.classList.add(state)}
}
function setMsg(el,text,kind=""){
  if(!el)return;el.textContent=text;el.classList.remove("ok","warn");if(kind)el.classList.add(kind);
}
function fmt(iso){
  if(!iso)return "Not synced";
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return "Not synced";
  return d.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
}
function localState(){
  if(window.tripApp?.getState)return window.tripApp.getState();
  try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch{return {}}
}
function replaceLocal(data){
  if(!data||typeof data!=="object")return;
  if(window.tripApp?.replaceState)window.tripApp.replaceState(data);
  else{localStorage.setItem(LOCAL_KEY,JSON.stringify(data));location.reload()}
}
function getDeviceId(){
  let id=localStorage.getItem("trip_v9_device_id");
  if(!id){
    id=(crypto.randomUUID?.()||("dev-"+Date.now()+"-"+Math.random().toString(36).slice(2)));
    localStorage.setItem("trip_v9_device_id",id);
  }
  return id;
}
const deviceId=getDeviceId();

if(!configured){
  if(setupNotice)setupNotice.style.display="block";
  if(signedOut)signedOut.style.display="none";
  setPill("Cloud not configured","offline");
  setMsg(debugMsg,"Add Supabase Project URL and publishable key.","warn");
}else{
  const supabase=createClient(cfg.url,cfg.anonKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });

  let currentUser=null;
  let currentVersion=0;
  let lastCloudUpdatedAt="";
  let initialized=false;
  let pushing=false;
  let applying=false;
  let debounce=null;
  let pollTimer=null;
  let realtimeChannel=null;

  function showInitMode(){
    initialized=false;
    if(initPanel)initPanel.style.display="block";
    if(readyActions)readyActions.style.display="none";
    if(lastSyncEl)lastSyncEl.textContent="Not set up";
    setPill("Cloud setup needed","online");
    setMsg(syncMsg,"Choose the device that has the correct trip data, then use it as the master copy.","warn");
  }
  function showReady(){
    initialized=true;
    if(initPanel)initPanel.style.display="none";
    if(readyActions)readyActions.style.display="flex";
  }
  function rememberCloud(row){
    currentVersion=Number(row?.version)||0;
    lastCloudUpdatedAt=row?.updated_at||"";
    localStorage.setItem("trip_v9_cloud_version",String(currentVersion));
    if(lastCloudUpdatedAt)localStorage.setItem("trip_v9_cloud_updated_at",lastCloudUpdatedAt);
    if(lastSyncEl)lastSyncEl.textContent=fmt(lastCloudUpdatedAt);
    if(lastCloudUpdatedAt)setPill("Synced · "+fmt(lastCloudUpdatedAt),"online");
  }
  function debug(text){
    setMsg(debugMsg,`Device ${deviceId.slice(0,8)} · user ${currentUser?.id?.slice(0,8)||"—"} · cloud v${currentVersion} · ${text}`,"");
  }

  async function getCloud(){
    if(!currentUser)throw new Error("Not signed in");
    const {data,error}=await supabase
      .from("user_trip_state")
      .select("data,version,device_id,updated_at")
      .eq("user_id",currentUser.id)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function initializeFromThisDevice(){
    if(!currentUser||pushing)return;
    pushing=true;
    try{
      setPill("Creating cloud copy…","");
      setMsg(syncMsg,"Uploading this device as the master copy…","");
      const state=localState();
      const {data,error}=await supabase.from("user_trip_state").upsert({
        user_id:currentUser.id,
        data:state,
        version:1,
        device_id:deviceId
      },{onConflict:"user_id"}).select("data,version,device_id,updated_at").single();
      if(error)throw error;
      rememberCloud(data);
      showReady();
      setMsg(syncMsg,"✓ Cloud copy created. Live sync is on.","ok");
      debug("initialized from this device");
      subscribeRealtime();
    }catch(err){
      console.error("initialize cloud",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not create cloud copy: "+(err.message||"Unknown error"),"warn");
      debug("initialize failed");
    }finally{pushing=false}
  }

  async function pushLocal({manual=false}={}){
    if(!currentUser||!initialized||pushing||applying||!navigator.onLine)return;
    pushing=true;
    try{
      if(manual)setPill("Syncing…","");
      const remote=await getCloud();
      if(!remote){
        showInitMode();
        return;
      }

      // If another device changed the cloud since this device last saw it,
      // pull first rather than blindly overwriting it.
      if((Number(remote.version)||0)>currentVersion && remote.device_id!==deviceId){
        rememberCloud(remote);
        setMsg(syncMsg,"Newer data found on another device. Updating this device…","ok");
        applying=true;
        replaceLocal(remote.data);
        return;
      }

      const nextVersion=(Number(remote.version)||0)+1;
      const {data,error}=await supabase
        .from("user_trip_state")
        .update({
          data:localState(),
          version:nextVersion,
          device_id:deviceId
        })
        .eq("user_id",currentUser.id)
        .eq("version",Number(remote.version)||0)
        .select("data,version,device_id,updated_at")
        .maybeSingle();

      if(error)throw error;
      if(!data){
        // Optimistic lock lost: another device updated first.
        const latest=await getCloud();
        if(latest){
          rememberCloud(latest);
          applying=true;
          setMsg(syncMsg,"Another device updated first. Loading the newer copy…","ok");
          replaceLocal(latest.data);
        }
        return;
      }

      rememberCloud(data);
      setMsg(syncMsg,manual?"✓ Synced now":"✓ Live sync on","ok");
      debug("last write from this device");
    }catch(err){
      console.error("push",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not sync: "+(err.message||"Unknown error"),"warn");
      debug("push failed");
    }finally{
      pushing=false;
      applying=false;
    }
  }

  async function pullCloud({force=false}={}){
    if(!currentUser||pushing||applying||!navigator.onLine)return false;
    try{
      const row=await getCloud();
      if(!row){showInitMode();debug("no user_trip_state row");return false}
      showReady();

      const remoteVersion=Number(row.version)||0;
      const isNew=force || remoteVersion>currentVersion;

      if(isNew){
        rememberCloud(row);
        // Ignore our own realtime echo if local version is already current.
        if(row.device_id===deviceId && !force){
          setMsg(syncMsg,"✓ Live sync on","ok");
          debug("own cloud update observed");
          return false;
        }
        applying=true;
        setMsg(syncMsg,"New cloud data received. Updating…","ok");
        debug("loading remote update");
        replaceLocal(row.data);
        return true;
      }

      rememberCloud(row);
      setMsg(syncMsg,"✓ Live sync on","ok");
      debug("up to date");
      return false;
    }catch(err){
      console.error("pull",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not check cloud: "+(err.message||"Unknown error"),"warn");
      debug("pull failed");
      return false;
    }finally{applying=false}
  }

  function subscribeRealtime(){
    if(!currentUser||realtimeChannel)return;
    realtimeChannel=supabase
      .channel("trip-v9-"+currentUser.id)
      .on("postgres_changes",{
        event:"*",
        schema:"public",
        table:"user_trip_state",
        filter:`user_id=eq.${currentUser.id}`
      },payload=>{
        const row=payload.new;
        if(!row)return;
        const remoteVersion=Number(row.version)||0;
        if(remoteVersion<=currentVersion)return;
        rememberCloud(row);
        if(row.device_id===deviceId){
          setMsg(syncMsg,"✓ Live sync on","ok");
          debug("realtime own write");
          return;
        }
        applying=true;
        setMsg(syncMsg,"Update received from another device…","ok");
        debug("realtime remote write");
        replaceLocal(row.data);
      })
      .subscribe(status=>{
        if(status==="SUBSCRIBED")debug("realtime connected");
      });
  }

  function startPolling(){
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>{
      if(currentUser&&initialized&&navigator.onLine&&document.visibilityState==="visible"){
        pullCloud({force:false});
      }
    },POLL_MS);
  }

  async function bootSignedIn(user){
    currentUser=user;
    if(userEl)userEl.textContent=user.email||"Signed in";
    if(signedOut)signedOut.style.display="none";
    if(signedIn)signedIn.style.display="block";
    setPill("Checking cloud…","online");

    const row=await getCloud();
    if(!row){
      showInitMode();
      debug("no v9 cloud row");
      return;
    }

    rememberCloud(row);
    showReady();
    setMsg(syncMsg,"✓ Live sync on","ok");
    debug("cloud row found");

    // Cloud is the shared source of truth after initialization.
    applying=true;
    replaceLocal(row.data);
  }

  function renderSignedOut(){
    currentUser=null;
    initialized=false;
    currentVersion=0;
    lastCloudUpdatedAt="";
    if(signedOut)signedOut.style.display="block";
    if(signedIn)signedIn.style.display="none";
    setPill("Local only","");
  }

  $("togglePasswordBtn")?.addEventListener("click",()=>{
    const input=$("cloudPassword"),btn=$("togglePasswordBtn");
    if(!input||!btn)return;
    const show=input.type==="password";
    input.type=show?"text":"password";
    btn.textContent=show?"Hide":"Show";
  });

  async function passwordLogin(){
    const email=String($("cloudEmail")?.value||"").trim();
    const password=String($("cloudPassword")?.value||"");
    if(!email){setMsg(authMsg,"Enter your email address.","warn");return}
    if(!password){setMsg(authMsg,"Enter your password.","warn");return}
    const btn=$("cloudLoginBtn");
    if(btn){btn.disabled=true;btn.textContent="Signing in…"}
    try{
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error){
        const m=String(error.message||"");
        setMsg(authMsg,m.toLowerCase().includes("invalid login")?"Incorrect email or password.":"Could not sign in: "+m,"warn");
      }else if(data?.user){
        setMsg(authMsg,"✓ Signed in.","ok");
      }
    }catch(err){
      setMsg(authMsg,"Could not sign in. Check the connection.","warn");
    }finally{
      if(btn){btn.disabled=false;btn.textContent="Sign in"}
    }
  }
  $("cloudLoginBtn")?.addEventListener("click",passwordLogin);
  $("cloudPassword")?.addEventListener("keydown",e=>{if(e.key==="Enter")passwordLogin()});

  $("cloudInitBtn")?.addEventListener("click",()=>{
    if(confirm("Use the trip data currently on this device as the new cloud master copy?")){
      initializeFromThisDevice();
    }
  });
  $("cloudSyncBtn")?.addEventListener("click",async()=>{
    await pullCloud({force:false});
    await pushLocal({manual:true});
  });
  $("cloudLogoutBtn")?.addEventListener("click",async()=>{
    if(realtimeChannel){await supabase.removeChannel(realtimeChannel);realtimeChannel=null}
    if(pollTimer){clearInterval(pollTimer);pollTimer=null}
    await supabase.auth.signOut();
    renderSignedOut();
  });

  window.addEventListener("trip:local-save",()=>{
    if(!currentUser||!initialized||applying||!navigator.onLine)return;
    clearTimeout(debounce);
    setPill("Saving…","");
    debounce=setTimeout(()=>pushLocal(),700);
  });

  window.addEventListener("focus",()=>{if(currentUser&&initialized&&navigator.onLine)pullCloud()});
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&currentUser&&initialized&&navigator.onLine)pullCloud();
  });
  window.addEventListener("online",()=>{
    if(currentUser&&initialized){setPill("Online · checking","online");pullCloud()}
  });
  window.addEventListener("offline",()=>{if(currentUser)setPill("Offline","offline")});

  const {data:{session}}=await supabase.auth.getSession();
  if(session?.user){
    try{
      await bootSignedIn(session.user);
      subscribeRealtime();
      startPolling();
    }catch(err){
      console.error("boot",err);
      setPill("Sync setup error","offline");
      setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
      setMsg(debugMsg,"Run supabase-v9-migration.sql, then reload.","warn");
    }
  }else renderSignedOut();

  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(event==="SIGNED_OUT"){renderSignedOut();return}
    if(session?.user && (!currentUser || currentUser.id!==session.user.id)){
      try{
        await bootSignedIn(session.user);
        subscribeRealtime();
        startPolling();
      }catch(err){
        console.error("auth boot",err);
        setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
      }
    }
  });
}
