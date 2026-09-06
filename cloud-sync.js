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
const APPLY_KEY="trip_v10_atomic_applied_version";
const POLL_MS=4000;

const pill=$("cloudPill"),pillText=$("cloudPillText");
const setupNotice=$("cloudSetupNotice"),sessionChecking=$("cloudSessionChecking"),signedOut=$("cloudSignedOut"),signedIn=$("cloudSignedIn");
const authMsg=$("cloudAuthMsg"),syncMsg=$("cloudSyncMsg"),debugMsg=$("cloudDebugMsg");
const userEl=$("cloudUser"),lastSyncEl=$("cloudLastSync");
const initPanel=$("cloudInitPanel"),readyActions=$("cloudReadyActions");

function setPill(text,state=""){
  if(pillText)pillText.textContent=text;
  if(pill){pill.classList.remove("online","offline");if(state)pill.classList.add(state)}
}
function setMsg(el,text,kind=""){
  if(!el)return;
  el.textContent=text;
  el.classList.remove("ok","warn");
  if(kind)el.classList.add(kind);
}
function fmt(iso){
  if(!iso)return "Not synced";
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return "Not synced";
  return d.toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
}
function getDeviceId(){
  let id=localStorage.getItem("trip_v10_atomic_device_id");
  if(!id){
    id=crypto.randomUUID?.()||("dev-"+Date.now()+"-"+Math.random().toString(36).slice(2));
    localStorage.setItem("trip_v10_atomic_device_id",id);
  }
  return id;
}
function localState(){
  if(window.tripApp?.getState)return window.tripApp.getState();
  try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"{}")}catch{return {}}
}
function applyCloudLocally(data,version){
  if(!data||typeof data!=="object")return;
  localStorage.setItem(APPLY_KEY,String(version||0));
  localStorage.setItem(LOCAL_KEY,JSON.stringify(data));
  location.reload();
}

const deviceId=getDeviceId();

if(!configured){
  if(setupNotice)setupNotice.style.display="block";
  if(signedOut)signedOut.style.display="none";
  setPill("Cloud not configured","offline");
}else{
  const supabase=createClient(cfg.url,cfg.anonKey,{
    auth:{
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true,
      storage:window.localStorage
    }
  });

  let currentUser=null;
  let currentVersion=Number(localStorage.getItem(APPLY_KEY)||0);
  let initialized=false;
  let saving=false;
  let applying=false;
  let debounce=null;
  let pollTimer=null;
  let realtimeChannel=null;

  function finishSessionCheck(){
    if(sessionChecking)sessionChecking.style.display="none";
  }

  function debug(text){
    setMsg(
      debugMsg,
      `Device ${deviceId.slice(0,8)} · user ${currentUser?.id?.slice(0,8)||"—"} · cloud v${currentVersion} · ${text}`,
      ""
    );
  }

  function showInit(){
    initialized=false;
    if(initPanel)initPanel.style.display="block";
    if(readyActions)readyActions.style.display="none";
    if(lastSyncEl)lastSyncEl.textContent="Not set up";
    setPill("Cloud setup needed","online");
    setMsg(syncMsg,"No v10 cloud copy yet. Use the device with the correct trip data as master.","warn");
    debug("waiting for master copy");
  }

  function showReady(row){
    initialized=true;
    if(initPanel)initPanel.style.display="none";
    if(readyActions)readyActions.style.display="flex";
    if(row){
      currentVersion=Number(row.version)||0;
      if(lastSyncEl)lastSyncEl.textContent=fmt(row.updated_at);
      setPill("Synced · "+fmt(row.updated_at),"online");
    }
  }

  async function getCloud(){
    if(!currentUser)throw new Error("Not signed in");
    const {data,error}=await supabase
      .from("trip_sync_state")
      .select("data,version,device_id,updated_at")
      .eq("user_id",currentUser.id)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  }

  async function atomicSave({manual=false}={}){
    if(!currentUser||!initialized||saving||applying||!navigator.onLine)return;
    saving=true;
    try{
      if(manual)setPill("Syncing…","");
      const {data,error}=await supabase.rpc("save_trip_sync_state",{
        p_data:localState(),
        p_device_id:deviceId
      });
      if(error)throw error;

      const row=Array.isArray(data)?data[0]:data;
      if(!row)throw new Error("Database save returned no row");

      currentVersion=Number(row.version)||currentVersion;
      localStorage.setItem(APPLY_KEY,String(currentVersion));
      showReady(row);
      setMsg(syncMsg,manual?"✓ Synced now":"✓ Synced","ok");
      debug("database save complete");
    }catch(err){
      console.error("atomicSave",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not sync: "+(err.message||"Unknown error"),"warn");
      debug("database save failed");
    }finally{
      saving=false;
    }
  }

  async function createMaster(){
    if(!currentUser||saving)return;
    saving=true;
    try{
      const {data,error}=await supabase.rpc("save_trip_sync_state",{
        p_data:localState(),
        p_device_id:deviceId
      });
      if(error)throw error;

      const row=Array.isArray(data)?data[0]:data;
      if(!row)throw new Error("Database save returned no row");

      currentVersion=Number(row.version)||1;
      localStorage.setItem(APPLY_KEY,String(currentVersion));
      showReady(row);
      setMsg(syncMsg,"✓ Cloud master created. Automatic sync is active.","ok");
      debug("master created");
      subscribeRealtime();
      startPolling();
    }catch(err){
      console.error("createMaster",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not create cloud copy: "+(err.message||"Unknown error"),"warn");
      debug("master creation failed");
    }finally{
      saving=false;
    }
  }

  async function pullCloud(){
    if(!currentUser||saving||applying||!navigator.onLine)return false;
    try{
      const row=await getCloud();
      if(!row){
        showInit();
        return false;
      }

      initialized=true;
      if(initPanel)initPanel.style.display="none";
      if(readyActions)readyActions.style.display="flex";

      const remoteVersion=Number(row.version)||0;
      const appliedVersion=Number(localStorage.getItem(APPLY_KEY)||0);

      if(remoteVersion>appliedVersion){
        currentVersion=remoteVersion;

        if(row.device_id===deviceId){
          localStorage.setItem(APPLY_KEY,String(remoteVersion));
          showReady(row);
          setMsg(syncMsg,"✓ Synced","ok");
          debug("own write confirmed");
          return false;
        }

        applying=true;
        setMsg(syncMsg,"Updating from another device…","ok");
        debug("applying remote v"+remoteVersion);
        applyCloudLocally(row.data,remoteVersion);
        return true;
      }

      showReady(row);
      setMsg(syncMsg,"✓ Up to date","ok");
      debug("up to date");
      return false;
    }catch(err){
      console.error("pullCloud",err);
      setPill("Sync error","offline");
      setMsg(syncMsg,"Could not check cloud: "+(err.message||"Unknown error"),"warn");
      debug("cloud read failed");
      return false;
    }finally{
      applying=false;
    }
  }

  function subscribeRealtime(){
    if(!currentUser||realtimeChannel)return;
    realtimeChannel=supabase
      .channel("trip-v10-atomic-"+currentUser.id)
      .on("postgres_changes",{
        event:"*",
        schema:"public",
        table:"trip_sync_state",
        filter:`user_id=eq.${currentUser.id}`
      },payload=>{
        const row=payload.new;
        if(!row)return;

        const remoteVersion=Number(row.version)||0;
        const appliedVersion=Number(localStorage.getItem(APPLY_KEY)||0);
        if(remoteVersion<=appliedVersion)return;

        currentVersion=remoteVersion;

        if(row.device_id===deviceId){
          localStorage.setItem(APPLY_KEY,String(remoteVersion));
          showReady(row);
          setMsg(syncMsg,"✓ Synced","ok");
          debug("realtime confirmed own save");
          return;
        }

        applying=true;
        setMsg(syncMsg,"Update received from another device…","ok");
        debug("realtime remote v"+remoteVersion);
        applyCloudLocally(row.data,remoteVersion);
      })
      .subscribe(status=>{
        if(status==="SUBSCRIBED")debug("realtime connected");
      });
  }

  function startPolling(){
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(()=>{
      if(currentUser&&initialized&&navigator.onLine&&document.visibilityState==="visible"){
        pullCloud();
      }
    },POLL_MS);
  }

  async function boot(user){
    currentUser=user;
    finishSessionCheck();
    if(userEl)userEl.textContent=user.email||"Signed in";
    if(signedOut)signedOut.style.display="none";
    if(signedIn)signedIn.style.display="block";

    const row=await getCloud();
    if(!row){
      showInit();
      return;
    }

    initialized=true;
    const remoteVersion=Number(row.version)||0;
    const appliedVersion=Number(localStorage.getItem(APPLY_KEY)||0);

    if(remoteVersion>appliedVersion){
      applying=true;
      debug("boot applying cloud v"+remoteVersion);
      applyCloudLocally(row.data,remoteVersion);
      return;
    }

    showReady(row);
    setMsg(syncMsg,"✓ Up to date","ok");
    debug("boot complete");
  }

  function signedOutView(){
    currentUser=null;
    initialized=false;
    currentVersion=0;
    finishSessionCheck();
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

  async function login(){
    const email=String($("cloudEmail")?.value||"").trim();
    const password=String($("cloudPassword")?.value||"");

    if(!email){setMsg(authMsg,"Enter your email address.","warn");return}
    if(!password){setMsg(authMsg,"Enter your password.","warn");return}

    const btn=$("cloudLoginBtn");
    if(btn){btn.disabled=true;btn.textContent="Signing in…"}

    try{
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error)throw error;
      if(data?.session){
        // Supabase persists the access + refresh session in localStorage.
        // getSession() on future launches will silently restore it.
        await supabase.auth.getSession();
      }
      if(data?.user)setMsg(authMsg,"✓ Signed in. This device will stay signed in.","ok");
    }catch(err){
      setMsg(authMsg,"Could not sign in: "+(err.message||"Unknown error"),"warn");
    }finally{
      if(btn){btn.disabled=false;btn.textContent="Sign in"}
    }
  }

  $("cloudLoginBtn")?.addEventListener("click",login);
  $("cloudPassword")?.addEventListener("keydown",e=>{if(e.key==="Enter")login()});

  $("cloudInitBtn")?.addEventListener("click",()=>{
    if(confirm("Use the trip data currently on this device as the v10 cloud master copy?")){
      createMaster();
    }
  });

  $("cloudSyncBtn")?.addEventListener("click",async()=>{
    const changed=await pullCloud();
    if(!changed)await atomicSave({manual:true});
  });

  $("cloudLogoutBtn")?.addEventListener("click",async()=>{
    if(realtimeChannel)await supabase.removeChannel(realtimeChannel);
    realtimeChannel=null;
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=null;
    await supabase.auth.signOut();
    signedOutView();
  });

  window.addEventListener("trip:local-save",()=>{
    if(!currentUser||!initialized||applying||!navigator.onLine)return;
    clearTimeout(debounce);
    setPill("Saving…","");
    debounce=setTimeout(()=>atomicSave(),450);
  });

  window.addEventListener("focus",()=>{
    if(currentUser&&initialized&&navigator.onLine)pullCloud();
  });

  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&currentUser&&initialized&&navigator.onLine)pullCloud();
  });

  window.addEventListener("online",()=>{
    if(currentUser&&initialized)pullCloud();
  });

  window.addEventListener("offline",()=>{
    if(currentUser)setPill("Offline","offline");
  });

  const {data:{session}}=await supabase.auth.getSession();

  if(session?.user){
    try{
      await boot(session.user);
      subscribeRealtime();
      startPolling();
    }catch(err){
      console.error("boot",err);
      setPill("Sync setup error","offline");
      setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
      debug("boot failed");
    }
  }else{
    signedOutView();
  }

  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(event==="SIGNED_OUT"){
      signedOutView();
      return;
    }

    // INITIAL_SESSION, SIGNED_IN and TOKEN_REFRESHED all keep the user signed in.
    if(session?.user){
      finishSessionCheck();
      if(!currentUser||currentUser.id!==session.user.id){
        try{
          await boot(session.user);
          subscribeRealtime();
          startPolling();
        }catch(err){
          setMsg(syncMsg,"Cloud setup error: "+(err.message||"Unknown error"),"warn");
        }
      }else{
        if(signedOut)signedOut.style.display="none";
        if(signedIn)signedIn.style.display="block";
      }
    }
  });
}
