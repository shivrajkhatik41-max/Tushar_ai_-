// Telegram AI bot v2: chat + history + PDF notes + YouTube notes. Node 18+, zero dependencies.
const fs=require("fs"),path=require("path"),http=require("http"),{makePdf}=require("./pdf");
const TG=process.env.TELEGRAM_TOKEN,GK=process.env.GEMINI_API_KEY,OA=process.env.OPENAI_API_KEY;
const ALLOW=(process.env.ALLOWED_USERS||"").split(",").map(s=>s.trim()).filter(Boolean);
const LIMIT=+process.env.DAILY_LIMIT||50,MODEL=process.env.GEMINI_MODEL||"gemini-3.8-flash",DIR=process.env.DATA_DIR||"./data",FILE=path.join(DIR,"data.json");
if(!TG||!GK){console.error("TELEGRAM_TOKEN aur GEMINI_API_KEY zaroori hain");process.exit(1)}
const SYSTEM="Tum ek helpful AI assistant ho jo Telegram par chat kar raha hai. User jis bhasha mein likhe (Hindi, Hinglish, English), usi mein jawab do. Jawab saaf aur chhote rakho. Plain text mein likho, markdown symbols kam use karo.";
const NOTES="Tum ek notes banane wale assistant ho. Sirf notes likho, is simple format mein: '# Title' ek baar, '## Heading' sections ke liye, '- ' bullets. Roman script mein likho (English ya Hinglish, Devanagari nahi), emoji, table aur bold markers nahi. Important points, definitions aur aakhir mein '## Summary' do.";
const API=`https://api.telegram.org/bot${TG}`;
fs.mkdirSync(DIR,{recursive:true});
let db={};try{db=JSON.parse(fs.readFileSync(FILE,"utf8"))}catch{}
let timer;const save=()=>{clearTimeout(timer);timer=setTimeout(()=>fs.writeFile(FILE,JSON.stringify(db),()=>{}),500)};
const used=new Map();
const tg=async(m,b)=>(await fetch(`${API}/${m}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)})).json();
const say=async(chat,text,extra={})=>{for(let i=0;i<text.length;i+=4000)await tg("sendMessage",{chat_id:chat,text:text.slice(i,i+4000),...(i+4000>=text.length?extra:{})})};
const sendDoc=async(chat,buf,name,caption)=>{const fd=new FormData();fd.append("chat_id",String(chat));if(caption)fd.append("caption",caption);
  fd.append("document",new Blob([buf],{type:"application/pdf"}),name);await fetch(`${API}/sendDocument`,{method:"POST",body:fd})};

async function claude(messages,system=SYSTEM,max=1500){
  // Gemini-compatible adapter; keep the existing function name so other bot features remain unchanged.
  const contents=messages.map(m=>({role:m.role==="assistant"?"model":"user",parts:Array.isArray(m.content)?m.content.map(x=>
    x.type==="image"?{inline_data:{mime_type:x.source.media_type,data:x.source.data}}:{text:x.text||""}
  ): [{text:String(m.content||"")}]}));
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GK}`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:max}})});
  const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Gemini API error");
  return (d.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("")||"Jawab nahi mil paya. Dobara koshish karein."}
async function makeImage(prompt){
  if(!OA)throw new Error("Image ke liye OPENAI_API_KEY set karni hogi.");
  const r=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+OA},body:JSON.stringify({model:"gpt-image-1",prompt,size:"1024x1024"})});
  const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Image error");return Buffer.from(d.data[0].b64_json,"base64")}
async function photoB64(id){const f=await tg("getFile",{file_id:id});
  return Buffer.from(await(await fetch(`https://api.telegram.org/file/bot${TG}/${f.result.file_path}`)).arrayBuffer()).toString("base64")}

// ---- YouTube transcript (unofficial; cloud servers par kabhi block ho sakta hai) ----
const dec=s=>s.replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
async function transcript(id){
  const h={"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36","accept-language":"en-US,en;q=0.9"};
  const page=await(await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`,{headers:h})).text();
  const m=page.match(/"captionTracks":(\[.*?\])(?=,"(?:audioTracks|translationLanguages|defaultAudioTrackIndex))/);
  if(!m)throw new Error("Is video ka transcript nahi mila (captions band ho sakte hain, ya YouTube ne server ko block kiya). Aap transcript paste karke /notes ke saath bhej sakte hain.");
  const tr=JSON.parse(m[1]),t=tr.find(x=>x.languageCode==="hi")||tr.find(x=>x.languageCode.startsWith("en"))||tr[0];
  const xml=await(await fetch(t.baseUrl,{headers:h})).text();
  const parts=[...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(x=>dec(dec(x[1])));
  const txt=(parts.length?parts.join(" "):dec(xml.replace(/<[^>]+>/g," "))).replace(/\s+/g," ").trim();
  if(!txt)throw new Error("Transcript khali mila.");return txt}

// ---- History ----
const U=uid=>db[uid]||(db[uid]={cur:null,chats:{}});
function chatOf(uid,title){const u=U(uid);if(!u.cur||!u.chats[u.cur]){u.cur=Date.now().toString(36);u.chats[u.cur]={t:(title||"Nayi chat").slice(0,60),ts:Date.now(),m:[]}}return u.chats[u.cur]}
function record(uid,userText,reply,title){const c=chatOf(uid,title);if(!c.m.length&&title)c.t=title.slice(0,60);c.m.push({role:"user",content:userText},{role:"assistant",content:reply});c.m=c.m.slice(-40);c.ts=Date.now();save()}
async function showHistory(chat,uid){
  const list=Object.entries(U(uid).chats).sort((a,b)=>b[1].ts-a[1].ts).slice(0,8);
  if(!list.length)return say(chat,"Abhi koi purani chat nahi hai.");
  await say(chat,"Aapki purani chats (kholne ke liye tap karein):",{reply_markup:{inline_keyboard:list.map(([id,c])=>[{text:"📂 "+c.t.slice(0,32),callback_data:"o:"+id},{text:"🗑",callback_data:"d:"+id}])}});
}
async function callback(q){
  const chat=q.message.chat.id,uid=String(q.from.id),[a,id]=q.data.split(":"),u=U(uid);
  await tg("answerCallbackQuery",{callback_query_id:q.id});
  if(!u.chats[id])return say(chat,"Ye chat ab nahi mili.");
  if(a==="d"){delete u.chats[id];if(u.cur===id)u.cur=null;save();return say(chat,"Chat delete ho gayi.")}
  u.cur=id;save();const c=u.chats[id],last=[...c.m].reverse().find(m=>m.role==="assistant");
  await say(chat,`Chat khul gayi: ${c.t}\nAb aap isi mein baat jaari rakh sakte hain.`+(last?`\n\nAakhri jawab:\n${last.content.slice(0,1200)}`:""));
}

// ---- Main handler ----
async function notesFlow(chat,uid,source,title,label){
  await tg("sendChatAction",{chat_id:chat,action:"upload_document"});
  const md=await claude([{role:"user",content:`${label}\n\n${source.slice(0,60000)}`}],NOTES,3500);
  const t=(md.match(/^#\s+(.*)/m)||[])[1]||title;
  await sendDoc(chat,makePdf(t,md.replace(/^#\s+.*\n?/,"")),t.replace(/[^\w]+/g,"_").slice(0,40)+".pdf","Aapke notes tayyar hain ✅");
  record(uid,title,md,title);
}
async function handle(m){
  const chat=m.chat.id,uid=String(m.from.id),text=(m.text||m.caption||"").trim();
  if(ALLOW.length&&!ALLOW.includes(uid))return say(chat,"Aapko is bot ka access nahi hai.");
  const first=text.split(/\s+/)[0],cmd=first.startsWith("/")?first.replace(/@\w+$/,"").toLowerCase():"",arg=cmd?text.slice(first.length).trim():text;
  if(cmd==="/start"||cmd==="/help")return say(chat,"Namaste! Mujhse kuch bhi poochhiye, photo bhejein to samjhaunga.\n\n/history - purani chats\n/new - nayi chat\n/notes <topic ya text> - PDF notes\n/yt <link> - YouTube video se PDF notes\n/pdf - last jawab ka PDF\n/image <description> - image banao");
  if(cmd==="/new"||cmd==="/reset"){U(uid).cur=null;save();return say(chat,"Nayi chat shuru ✅")}
  if(cmd==="/history")return showHistory(chat,uid);
  const k=uid+new Date().toDateString(),n=used.get(k)||0;
  if(n>=LIMIT)return say(chat,"Aaj ki limit khatam ho gayi. Kal try karein.");used.set(k,n+1);
  try{
    if(cmd==="/image"){
      if(!arg)return say(chat,"Aise likhein: /image ek billi jo space mein tair rahi hai");
      await tg("sendChatAction",{chat_id:chat,action:"upload_photo"});
      const fd=new FormData();fd.append("chat_id",String(chat));fd.append("photo",new Blob([await makeImage(arg)],{type:"image/png"}),"image.png");
      await fetch(`${API}/sendPhoto`,{method:"POST",body:fd});return}
    if(cmd==="/pdf"){
      const last=[...chatOf(uid).m].reverse().find(x=>x.role==="assistant");
      if(!last)return say(chat,"Pehle koi sawal poochhiye, phir /pdf bhejein.");
      return sendDoc(chat,makePdf("Notes",last.content),"notes.pdf")}
    if(cmd==="/notes"){
      if(!arg)return say(chat,"Aise likhein: /notes photosynthesis ke notes banao\nYa lamba text/transcript saath mein paste karein.");
      await say(chat,"Notes bana raha hoon…");return notesFlow(chat,uid,arg,arg.slice(0,50),"In notes banao (topic ya text):")}
    if(cmd==="/yt"){
      const id=(arg.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)||[])[1];
      if(!id)return say(chat,"Aise likhein: /yt https://youtu.be/xxxxxxxxxxx");
      await say(chat,"Video ka transcript la raha hoon…");const tr=await transcript(id);
      return notesFlow(chat,uid,tr,"YouTube video "+id,"Is YouTube video ke transcript se detailed notes banao:")}
    await tg("sendChatAction",{chat_id:chat,action:"typing"});
    const c=chatOf(uid,arg||"Photo"),content=[];
    if(m.photo)content.push({type:"image",source:{type:"base64",media_type:"image/jpeg",data:await photoB64(m.photo.at(-1).file_id)}});
    content.push({type:"text",text:arg||"Is image ke baare mein batao."});
    let msgs=[...c.m.slice(-20)];while(msgs.length&&msgs[0].role!=="user")msgs.shift();msgs.push({role:"user",content});
    const out=await claude(msgs);record(uid,(m.photo?"[photo] ":"")+(arg||"Photo"),out,arg||"Photo");await say(chat,out);
  }catch(e){await say(chat,"Error: "+e.message)}
}
if(process.env.PORT)http.createServer((q,r)=>r.end("ok")).listen(process.env.PORT);
(async()=>{
  await tg("setMyCommands",{commands:[{command:"history",description:"Purani chats"},{command:"new",description:"Nayi chat"},{command:"notes",description:"Topic/text se PDF notes"},{command:"yt",description:"YouTube se PDF notes"},{command:"pdf",description:"Last jawab ka PDF"},{command:"image",description:"Image banao"}]}).catch(()=>{});
  console.log("Bot chal raha hai…");let offset=0;
  for(;;){try{const d=await tg("getUpdates",{offset,timeout:30,allowed_updates:["message","callback_query"]});
    for(const u of d.result||[]){offset=u.update_id+1;if(u.message)handle(u.message);else if(u.callback_query)callback(u.callback_query).catch(()=>{})}}
  catch(e){console.error(e.message);await new Promise(r=>setTimeout(r,3000))}}
})();
