"use strict";

// Кооперативный поиск — полностью работает на GitHub Pages без сервера.
// Облачные аккаунты доступны после настройки публичного Supabase key и SQL RLS.
const TAXONOMY = [
  ["Экшен и движение", [
    ["Action","Экшен"],["Adventure","Приключения"],["Shooter","Шутеры"],["FPS","От первого лица"],
    ["Third-Person Shooter","Шутер от 3-го лица"],["Hack and Slash","Рубилово"],["Fighting","Файтинги"],
    ["Platformer","Платформеры"],["Puzzle Platformer","Платформинг с загадками"],["Parkour","Паркур"],
    ["Roguelike","Рогалики"],["Roguelite","Роглайты"],["Souls-like","Соулслайки"],
    ["Difficult","Хардкор"],["Stealth","Стелс"],["Bullet Hell","Пулевой ад"]
  ]],
  ["Мышление и стратегия", [
    ["Strategy","Стратегии"],["RTS","Стратегии в реальном времени"],
    ["Turn-Based Strategy","Пошаговые стратегии"],["Turn-Based Tactics","Пошаговая тактика"],
    ["Tactical","Тактические игры"],["Tower Defense","Защита башен"],
    ["Puzzle","Головоломки"],["Escape Room","Побег из комнаты"],["Physics","Физические загадки"],
    ["Card Game","Карточные игры"],["Deckbuilding","Сбор колод"],
    ["Management","Менеджмент"],["City Builder","Градостроение"],["Colony Sim","Симуляторы колоний"]
  ]],
  ["Исследование и развитие", [
    ["RPG","Ролевые игры"],["JRPG","Японские RPG"],["Open World","Открытый мир"],
    ["Exploration","Исследование"],["Survival","Выживание"],["Sandbox","Песочницы"],
    ["Base Building","Строительство баз"],["Building","Строительство"],
    ["Crafting","Крафт"],["Automation","Автоматизация"],["Simulation","Симуляторы"],
    ["Farming Sim","Фермерство"],["Fishing","Рыбалка"],["Mining","Добыча ресурсов"],
    ["Loot","Сбор добычи"],["Dungeon Crawler","Подземелья"]
  ]],
  ["История и настроение", [
    ["Story Rich","Хороший сюжет"],["Choices Matter","Выбор и последствия"],
    ["Visual Novel","Визуальные новеллы"],["Mystery","Тайны"],["Detective","Детектив"],
    ["Horror","Хорроры"],["Psychological Horror","Психологический ужас"],
    ["Comedy","Юмор"],["Relaxing","Расслабляющие"],["Cozy","Уютные"],
    ["Casual","Казуальные"],["Atmospheric","Атмосферные"],["Emotional","Эмоциональные"],
    ["Dark","Мрачные"],["Cute","Милые"]
  ]],
  ["Формат и веселье", [
    ["Party Game","Для компании"],["Cooking","Готовка"],["Rhythm","Ритм-игры"],
    ["Music","Музыкальные"],["Racing","Гонки"],["Sports","Спорт"],
    ["Board Game","Настольные"],["Minigames","Мини-игры"],["Funny","Абсурд и веселье"],
    ["PvE","Против компьютера"],["Competitive","Соревновательные"]
  ]],
  ["Миры и визуальный стиль", [
    ["Sci-fi","Научная фантастика"],["Fantasy","Фэнтези"],["Medieval","Средневековье"],
    ["Space","Космос"],["Post-apocalyptic","Постапокалипсис"],["Cyberpunk","Киберпанк"],
    ["Anime","Аниме"],["Pixel Graphics","Пиксельная графика"],
    ["2D","2D"],["3D","3D"],["Robots","Роботы"],["Zombies","Зомби"],
    ["Dinosaurs","Динозавры"],["Historical","Исторические"]
  ]]
];
const TAG_NAMES = new Map(TAXONOMY.flatMap(group => group[1]).map(x=>[x[0].toLowerCase(),x[1]]));
const el = id => document.getElementById(id);
const blank = () => ({name:"", prefs:{}, favorites:[]});
const STORE_KEY="coop-compass-my-profile-v2";
const DATA_URL="./data/catalog.json";
const PAGES=["home","catalog","profile"];
let catalog=[], catalogMeta={}, page="home", guest=blank(), profiles=[blank(),blank()];
let invited=false, invitation=null, sharedMatch=false, matches=[], matchLimit=12, catalogLimit=24, shownTag="";
let cloud=null, cloudUser=null, authMode="login", toastTimer=0, saveTimer=0;
const config=window.COOP_CONFIG||{};
const cloudConfigured=!!(config.supabaseUrl && config.supabasePublishableKey);

function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function trimName(s){return String(s||"").trim().slice(0,40);}
function cleanPrefs(raw){
  const out={};
  if(raw && typeof raw==="object" && !Array.isArray(raw)){
    for(const [k,v] of Object.entries(raw)){
      if(TAG_NAMES.has(k.toLowerCase()) && (v===1 || v===-1))out[k]=v;
    }
  }
  return out;
}
function cleanProfile(raw){
  const p=blank();
  if(raw && typeof raw==="object"){
    p.name=trimName(raw.name);
    p.prefs=cleanPrefs(raw.prefs);
    p.favorites=Array.isArray(raw.favorites)?[...new Set(raw.favorites.map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))].slice(0,400):[];
  }
  return p;
}
function loadGuest(){
  try{return cleanProfile(JSON.parse(localStorage.getItem(STORE_KEY)||"null"));}
  catch{return blank();}
}
function myIndex(){return invited?1:0;}
function myProfile(){return profiles[myIndex()];}
function persist(){
  guest=cleanProfile(myProfile());
  try{localStorage.setItem(STORE_KEY,JSON.stringify(guest));}catch{}
  clearTimeout(saveTimer);
  if(cloudUser && cloud)saveTimer=setTimeout(()=>void saveCloud(),700);
}
function toast(message){
  const t=el("toast");t.textContent=message;t.classList.add("visible");clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("visible"),3500);
}
function getTagLabel(t){return TAG_NAMES.get(String(t).toLowerCase())||t;}
function renderPrefs(index){
  const target=el("prefs-"+(index+1));
  const p=profiles[index];
  const disabled=invited && index===0;
  target.innerHTML=TAXONOMY.map(group=>{
    return '<section class="pref-group"><div class="pref-heading">'+esc(group[0])+' <small>'+group[1].length+' тематик</small></div><div class="chips">'+group[1].map(([key,label])=>{
      const state=p.prefs[key]||0;
      return '<button type="button" class="chip '+(state===1?"like":state===-1?"dislike":"")+'" data-p="'+index+'" data-tag="'+esc(key)+'" aria-pressed="'+(state!==0)+'" title="'+(state===1?"Люблю: нажми, чтобы изменить":state===-1?"Не люблю: нажми, чтобы убрать":"Нейтрально: нажми, чтобы отметить")+'" '+(disabled?"disabled":"")+'>'+(state===1?"♥ ":state===-1?"✕ ":"")+esc(label)+'</button>';
    }).join("")+'</div></section>';
  }).join("");
}
function renderProfiles(){
  el("name-1").value=profiles[0].name;el("name-2").value=profiles[1].name;
  el("name-1").disabled=invited;
  renderPrefs(0);renderPrefs(1);updateSummary();
}
function updateSummary(){
  const count=p=>Object.keys(p.prefs).length;
  const a=count(profiles[0]), b=count(profiles[1]);
  el("prefs-summary").textContent=(a+b)?"Отмечено: игрок 1 — "+a+", игрок 2 — "+b:"Отметь интересы каждого — это займёт пару минут";
}
function setPage(next){
  if(!PAGES.includes(next))return;
  page=next;
  PAGES.forEach(p=>el("page-"+p).classList.toggle("hidden",p!==next));
  document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("is-active",x.dataset.page===next));
  if(next==="catalog")renderCatalog();
  if(next==="profile")renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}
function parseInvite(){
  const hash=location.hash;
  const isMatch=hash.startsWith("#match=");
  if(!hash.startsWith("#invite=")&&!isMatch)return;
  try{
    const encoded=hash.slice(isMatch?7:8);
    if(encoded.length>10000)throw Error("too long");
    const binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(data.v!==1)throw Error("version");
    if(isMatch){
      if(!Array.isArray(data.profiles)||data.profiles.length!==2)throw Error("invalid matching");
      profiles=[cleanProfile(data.profiles[0]),cleanProfile(data.profiles[1])];
      sharedMatch=true;
      el("pair-mode").value=["online","local","any"].includes(data.mode)?data.mode:"any";
      el("invite-notice").textContent="Получена подборка для двух игроков. Ниже можно изменить предпочтения и пересчитать результат.";
      el("invite-notice").classList.remove("hidden");
      history.replaceState(null,"",location.pathname+location.search);
      return;
    }
    if(typeof data.profile!=="object")throw Error("version");
    invitation=cleanProfile(data.profile);invitation.favorites=[];
    invited=true;
    el("invite-notice").textContent="Тебя пригласил "+(invitation.name||"друг")+". Его предпочтения уже заполнены — добавь свои во второй анкете и нажми «Подобрать игры».";
    el("invite-notice").classList.remove("hidden");
    history.replaceState(null,"",location.pathname+location.search);
  }catch{toast("Не удалось открыть приглашение. Попроси друга отправить ссылку заново.");}
}
function encodePacket(value){
  const binary=Array.from(new TextEncoder().encode(JSON.stringify(value)),b=>String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function shareableProfile(profile){return {name:trimName(profile.name),prefs:cleanPrefs(profile.prefs)};}
function makeLink(profile){
  return location.origin+location.pathname+"#invite="+encodePacket({v:1,profile:shareableProfile(profile)});
}
function makeMatchLink(){
  return location.origin+location.pathname+"#match="+encodePacket({v:1,profiles:profiles.map(shareableProfile),mode:el("pair-mode").value});
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast("Ссылка скопирована!");}
  catch{window.prompt("Скопируй ссылку:",text);}
}
function modeMatches(game,mode){
  if(mode==="online")return game.mode_online===true;
  if(mode==="local")return game.mode_local===true;
  return true;
}
function gameTags(game){
  const tags=new Set([...(game.tags||[]),...(game.genres||[])].map(x=>String(x).toLowerCase()));
  if(tags.has("rogue-like")||tags.has("action roguelike"))tags.add("roguelike");
  if(tags.has("base-building"))tags.add("base building");
  if(tags.has("first-person"))tags.add("fps");
  if(tags.has("building"))tags.add("base building");
  if(tags.has("walking simulator"))tags.add("exploration");
  if(tags.has("turn-based"))tags.add("turn-based strategy");
  if(tags.has("real time strategy"))tags.add("rts");
  return tags;
}
function individualScore(profile,game){
  const selected=Object.entries(profile.prefs);
  if(!selected.length)return 50;
  const tags=gameTags(game);
  let score=game.tags?.length || game.genres?.length ? 40 : 27, hits=0, dislikes=0;
  for(const [key,val] of selected){
    if(tags.has(key.toLowerCase())){
      if(val===1){hits++;score+=Math.max(8,16-Math.max(0,hits-1)*1.3);}
      else{dislikes++;score-=28;}
    }
  }
  if(dislikes>0 && hits===0)score-=8;
  return Math.max(3,Math.min(97,Math.round(score)));
}
function pairScore(game){
  const sa=individualScore(profiles[0],game),sb=individualScore(profiles[1],game);
  const fair=Math.round(Math.min(sa,sb)*.72+((sa+sb)/2)*.28);
  return {sa,sb,fair};
}
function startMatch(){
  matches=catalog.filter(game=>modeMatches(game,el("pair-mode").value)).map(game=>Object.assign({game},pairScore(game)))
    .sort((a,b)=>b.fair-a.fair || Math.min(b.sa,b.sb)-Math.min(a.sa,a.sb) || (b.game.positive||0)-(a.game.positive||0));
  matchLimit=12;
  el("match-section").classList.remove("hidden");
  const p1=profiles[0].name||"Игрок 1",p2=profiles[1].name||"Игрок 2";
  el("match-caption").textContent="Подбор для "+p1+" и "+p2+". Наш алгоритм старается не предлагать игры, которые один из вас не любит.";
  renderMatches();
  el("match-section").scrollIntoView({behavior:"smooth",block:"start"});
}
function banner(id){return "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/"+id+"/header.jpg";}
function gameCard(game,rank,scores){
  const name=esc(game.name),tags=[...(game.tags||[]),...(game.genres||[])].filter((v,i,a)=>a.indexOf(v)===i).slice(0,5);
  const mode=game.mode_online===true&&game.mode_local===true?"🌐 Онлайн · 🏠 Локально":game.mode_online===true?"🌐 Онлайн":game.mode_local===true?"🏠 Локально":"Режим уточнить";
  const id=Number(game.appid);
  if(!Number.isSafeInteger(id)||id<=0)return "";
  const fav=myProfile().favorites.includes(id);
  const bars=scores?'<div class="score-section">'+[["1",profiles[0].name||"Игрок 1",scores.sa,""],["2",profiles[1].name||"Игрок 2",scores.sb,"second"]].map(x=>
    '<div class="score-row"><span class="score-name" title="'+esc(x[1])+'">'+esc(x[1])+'</span><span class="score-bar"><span class="score-fill '+x[3]+'" style="width:'+x[2]+'%"></span></span><strong>'+x[2]+'%</strong></div>').join("")+'</div>':"";
  return '<article class="game-card"><div class="game-banner"><img loading="lazy" decoding="async" src="'+banner(id)+'" alt="" referrerpolicy="no-referrer">'+(rank?'<span class="game-position">#'+rank+' · '+scores.fair+' баллов</span>':'')+'<button class="favorite '+(fav?"on":"")+'" data-fav="'+id+'" aria-label="'+(fav?"Убрать из избранного":"В избранное")+'">'+(fav?"♥":"♡")+'</button></div><div class="game-body"><h3>'+name+'</h3><div class="game-sub">'+esc(mode)+'</div><div class="tag-row">'+tags.map(t=>'<span class="game-tag">'+esc(getTagLabel(t))+'</span>').join("")+'</div>'+(game.description?'<p class="game-desc">'+esc(game.description)+'</p>':'')+bars+'<div class="card-bottom">'+(scores?'<span class="match-score">✓ Компромисс '+scores.fair+'/100</span>':'<span class="game-sub">Steam · '+(game.source==="seed"?"подборка":"SteamSpy")+'</span>')+'<a class="steam-link" href="https://store.steampowered.com/app/'+id+'/" target="_blank" rel="noopener noreferrer">Открыть в Steam ↗</a></div></div></article>';
}
function renderMatches(){
  const node=el("match-results");
  node.innerHTML=matches.slice(0,matchLimit).map((r,i)=>gameCard(r.game,i+1,r)).join("")||'<p class="empty-note">Не нашлось игр для заданного режима. Попробуй «Любой кооператив».</p>';
  el("match-more").classList.toggle("hidden",matches.length<=matchLimit);
}
function populateCatalogFilter(){
  const select=el("catalog-tag");
  select.innerHTML='<option value="">Все жанры и темы</option>'+TAXONOMY.flatMap(g=>g[1]).map(t=>'<option value="'+esc(t[0])+'">'+esc(t[1])+'</option>').join("");
}
function normalizedString(str){return String(str||"").toLocaleLowerCase("ru");}
function popularity(game){
  const buckets={"20k+":8,"5k+":7,"1k+":6,"500+":5,"100+":4,"50+":3,"10+":2,"<10":1};
  return (buckets[game.reviews_bucket]||0)*10000000+(game.positive||0);
}
function getFilteredCatalog(){
  const q=normalizedString(el("catalog-search").value).trim();
  const t=el("catalog-tag").value.toLowerCase(), mode=el("catalog-mode").value;
  const searchTerms=q.split(/\s+/).filter(Boolean);
  const list=catalog.filter(game=>{
    if(!modeMatches(game,mode))return false;
    const tags=gameTags(game);
    if(t&&!tags.has(t))return false;
    if(searchTerms.length){
      const text=normalizedString(game.name+" "+(game.tags||[]).join(" ")+" "+(game.genres||[]).join(" ")+" "+(game.description||"")+" "+(game.tags||[]).map(getTagLabel).join(" "));
      if(!searchTerms.every(term=>text.includes(term)))return false;
    }
    return true;
  });
  if(el("catalog-sort").value==="name")list.sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  else list.sort((a,b)=>popularity(b)-popularity(a)||a.name.localeCompare(b.name,"ru"));
  return list;
}
function renderCatalog(){
  const filtered=getFilteredCatalog();
  el("catalog-results").innerHTML=filtered.slice(0,catalogLimit).map(g=>gameCard(g,0,null)).join("")||'<div class="notice">По этому запросу ничего не нашлось. Попробуй другую тему или режим.</div>';
  el("catalog-count").textContent=filtered.length.toLocaleString("ru");
  el("catalog-status").textContent="Показано "+Math.min(filtered.length,catalogLimit)+" из "+filtered.length.toLocaleString("ru")+" игр";
  el("catalog-more").classList.toggle("hidden",filtered.length<=catalogLimit);
}
function renderDashboard(){
  const p=myProfile();const gameById=new Map(catalog.map(g=>[g.appid,g]));
  el("dashboard-name").textContent=p.name||"Игрок";
  el("dashboard-email").textContent=cloudUser?.email||"Гостевой профиль · сохранён на этом устройстве";
  el("liked-count").textContent=Object.values(p.prefs).filter(v=>v===1).length;
  el("disliked-count").textContent=Object.values(p.prefs).filter(v=>v===-1).length;
  el("saved-count").textContent=p.favorites.length;
  el("profile-status").textContent=cloudUser?"Профиль привязан к аккаунту. Предпочтения и избранное синхронизируются с облаком.":cloudConfigured?"Войди или зарегистрируйся, чтобы сохранять любимые жанры и избранное между устройствами.":"Предпочтения и избранное пока хранятся в браузере. Регистрация заработает после подключения Supabase владельцем сайта.";
  el("profile-signin").textContent=cloudUser?"Аккаунт · Выйти":"Создать аккаунт";
  const owned=p.favorites.map(id=>gameById.get(id)).filter(Boolean);
  el("saved-games").innerHTML=owned.map(g=>'<div class="favorite-entry"><a target="_blank" rel="noopener noreferrer" href="https://store.steampowered.com/app/'+g.appid+'/">'+esc(g.name)+' ↗</a><button class="text-button" data-fav="'+g.appid+'">Убрать</button></div>').join("")||'<p class="empty-note">Пока здесь нет игр. Нажми ♡ на карточке понравившейся игры.</p>';
}
function toggleFavorite(appid){
  const p=myProfile();
  if(p.favorites.includes(appid))p.favorites=p.favorites.filter(id=>id!==appid);
  else p.favorites.push(appid);
  persist();
  if(page==="catalog")renderCatalog();
  else if(page==="profile")renderDashboard();
  else if(!el("match-section").classList.contains("hidden"))renderMatches();
}
async function loadCatalog(){
  try{
    const res=await fetch(DATA_URL+"?v="+Date.now(),{cache:"no-cache"});
    if(!res.ok)throw new Error("status "+res.status);
    const payload=await res.json();
    if(!Array.isArray(payload.games)||!payload.games.length)throw new Error("empty catalog");
    catalog=payload.games.filter(g=>g && Number.isInteger(g.appid) && g.appid>0 && typeof g.name==="string" && Array.isArray(g.tags));
    catalogMeta=payload;
    el("hero-count").textContent=catalog.length.toLocaleString("ru");
    const isSeed=payload.source==="curated-starter";
    el("catalog-source").textContent=(isSeed?"Стартовый набор — автоматическое обновление ещё не завершилось":"Источник: SteamSpy")+" · "+(payload.updated_at||"дата неизвестна");
  }catch(err){
    console.error("Catalog load failure",err);
    el("catalog-status").textContent="Каталог не загрузился. Обнови страницу.";
    el("catalog-results").innerHTML='<div class="notice">Не удалось загрузить каталог. Проверь подключение к интернету.</div>';
    toast("Не удалось загрузить каталог игр.");
  }
  renderCatalog();
  if(sharedMatch || !el("match-section").classList.contains("hidden"))startMatch();
}
async function initCloud(){
  if(!cloudConfigured)return;
  try{
    const mod=await import("https://esm.sh/@supabase/supabase-js@2");
    cloud=mod.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
    const response=await cloud.auth.getSession();
    if(response.data?.session?.user)await setCloudUser(response.data.session.user);
    cloud.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){cloudUser=null;el("auth-open").textContent="Войти";renderDashboard();}
      if(event==="SIGNED_IN"&&session?.user&&!cloudUser){setTimeout(()=>void setCloudUser(session.user),0);}
    });
  }catch(err){console.error("Supabase unavailable",err);toast("Облачные аккаунты временно недоступны, гостевой режим работает.");}
}
async function setCloudUser(user){
  cloudUser=user;el("auth-open").textContent=(user.email||"Мой аккаунт").split("@")[0].slice(0,16);
  try{
    const {data,error}=await cloud.from("player_profiles").select("nickname,preferences").eq("user_id",user.id).maybeSingle();
    if(error)throw error;
    if(data?.preferences){
      const saved=cleanProfile({...data.preferences,name:data.nickname});
      const idx=myIndex();
      profiles[idx]=saved;
      renderProfiles();
      persist();
    }else await saveCloud();
  }catch(err){console.error("Failed loading profile",err);toast("Не удалось синхронизировать профиль: проверь настройку базы.");}
  renderDashboard();
}
async function saveCloud(){
  if(!cloud||!cloudUser)return;
  const p=cleanProfile(myProfile());
  const {error}=await cloud.from("player_profiles").upsert({
    user_id:cloudUser.id,
    nickname:p.name||"Игрок",
    preferences:{prefs:p.prefs,favorites:p.favorites},
    updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error){console.error("Profile save failed",error);toast("Профиль не сохранился в облаке. Проверь настройки доступа.");}
}
function openAuth(){
  el("auth-modal").classList.remove("hidden");
  el("auth-feedback").textContent="";
  el("auth-config-info").classList.toggle("hidden",cloudConfigured);
  el("auth-config-info").textContent="Регистрация пока не активирована: владельцу сайта нужно подключить Supabase. Гостевые предпочтения сохраняются в этом браузере.";
  el("auth-form").classList.toggle("hidden",!cloudConfigured||!!cloudUser);
  el("auth-switch").classList.toggle("hidden",!cloudConfigured||!!cloudUser);
  el("signout-btn").classList.toggle("hidden",!cloudUser);
  renderAuthMode();
}
function closeAuth(){el("auth-modal").classList.add("hidden");}
function renderAuthMode(){
  el("auth-title").textContent=cloudUser?"Мой аккаунт":authMode==="login"?"Войти в аккаунт":"Регистрация";
  el("auth-description").textContent=cloudUser?"Профиль синхронизируется с облаком.":"Сохраняй вкусы и игры на разных устройствах.";
  el("auth-submit").textContent=authMode==="login"?"Войти":"Зарегистрироваться";
  el("auth-switch").textContent=authMode==="login"?"Нет аккаунта? Зарегистрироваться":"Есть аккаунт? Войти";
}
async function submitAuth(e){
  e.preventDefault();if(!cloud)return;
  const email=el("auth-email").value.trim(),password=el("auth-password").value;
  const button=el("auth-submit");button.disabled=true;button.textContent="Подключаем…";
  try{
    const result=authMode==="login"?await cloud.auth.signInWithPassword({email,password}):await cloud.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
    if(result.error)throw result.error;
    if(result.data.user&&!result.data.session)el("auth-feedback").textContent="Проверь электронную почту и подтверди регистрацию, затем войди.";
    else{if(result.data.user)await setCloudUser(result.data.user);closeAuth();toast("Аккаунт подключён!");}
  }catch(err){el("auth-feedback").textContent="Не удалось войти: "+String(err.message||err);}
  finally{button.disabled=false;renderAuthMode();}
}
function bindEvents(){
  document.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>setPage(btn.dataset.page)));
  el("brand").addEventListener("click",e=>{e.preventDefault();setPage("home");});
  for(const index of [0,1]){
    el("name-"+(index+1)).addEventListener("input",e=>{
      profiles[index].name=trimName(e.target.value);
      if(index===myIndex())persist();
    });
  }
  document.addEventListener("click",e=>{
    const chip=e.target.closest("button[data-p][data-tag]");
    if(chip){
      const index=Number(chip.dataset.p),tag=chip.dataset.tag;
      if(invited&&index===0)return;
      const old=profiles[index].prefs[tag]||0;
      const next=old===0?1:old===1?-1:0;
      if(next)profiles[index].prefs[tag]=next;else delete profiles[index].prefs[tag];
      chip.classList.toggle("like",next===1);chip.classList.toggle("dislike",next===-1);
      chip.textContent=(next===1?"♥ ":next===-1?"✕ ":"")+getTagLabel(tag);
      chip.setAttribute("aria-pressed",String(next!==0));
      if(index===myIndex())persist();
      updateSummary();
    }
    const fav=e.target.closest("button[data-fav]");
    if(fav)toggleFavorite(Number(fav.dataset.fav));
  });
  el("invite-btn").addEventListener("click",()=>copyText(makeLink(invited?profiles[1]:profiles[0])));
  el("find-btn").addEventListener("click",startMatch);
  el("match-more").addEventListener("click",()=>{matchLimit+=12;renderMatches();});
  el("match-share").addEventListener("click",()=>copyText(makeMatchLink()));
  for(const id of ["catalog-search","catalog-tag","catalog-mode","catalog-sort"]){
    el(id).addEventListener(id==="catalog-search"?"input":"change",()=>{catalogLimit=24;renderCatalog();});
  }
  el("catalog-more").addEventListener("click",()=>{catalogLimit+=24;renderCatalog();});
  el("profile-edit").addEventListener("click",()=>{setPage("home");el("finder").scrollIntoView({behavior:"smooth"});});
  el("profile-signin").addEventListener("click",openAuth);
  el("auth-open").addEventListener("click",openAuth);
  el("auth-close").addEventListener("click",closeAuth);
  el("auth-modal").addEventListener("click",e=>{if(e.target===el("auth-modal"))closeAuth();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAuth();});
  el("auth-switch").addEventListener("click",()=>{authMode=authMode==="login"?"signup":"login";el("auth-feedback").textContent="";renderAuthMode();});
  el("auth-form").addEventListener("submit",submitAuth);
  el("signout-btn").addEventListener("click",async()=>{if(cloud)await cloud.auth.signOut();closeAuth();toast("Вы вышли из аккаунта.");});
  document.addEventListener("error",e=>{if(e.target instanceof HTMLImageElement)e.target.style.visibility="hidden";},true);
}
function init(){
  guest=loadGuest();profiles=[cleanProfile(guest),blank()];
  parseInvite();
  if(invited){profiles=[cleanProfile(invitation),cleanProfile(guest)];}
  populateCatalogFilter();renderProfiles();bindEvents();
  void loadCatalog();void initCloud();
  if(location.hash==="#catalog")setPage("catalog");
}
init();
