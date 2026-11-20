// Zero-dependency PDF maker (Helvetica, Latin text only). Input: simple markdown (# ## - bullets).
const W=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const clean=s=>s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,"-").replace(/\u2022/g,"-").replace(/\u2026/g,"...")
  .replace(/\*\*|__|`/g,"").replace(/\t/g,"  ").replace(/[^\x20-\x7e\xa0-\xff]/g,"?");
const width=(s,size,bold)=>{let t=0;for(const c of s){const k=c.charCodeAt(0);t+=(k>=32&&k<=126?W[k-32]:556)}return t*size/1000*(bold?1.06:1)};
const esc=s=>s.replace(/[\\()]/g,"\\$&").replace(/[\x80-\xff]/g,c=>"\\"+c.charCodeAt(0).toString(8));
function wrap(text,size,bold,max){const out=[];let line="";
  for(const w of text.split(/\s+/).filter(Boolean)){const t=line?line+" "+w:w;
    if(width(t,size,bold)<=max)line=t;else{if(line)out.push(line);line=w}}
  if(line)out.push(line);return out.length?out:[""]}
function makePdf(title,md){
  const PW=595,PH=842,M=50,pages=[[]];let y=PH-M;
  const put=(txt,size,bold,x,gap)=>{if(y-size<M){pages.push([]);y=PH-M}
    pages[pages.length-1].push(`BT /${bold?"F2":"F1"} ${size} Tf ${x} ${y-size} Td (${esc(txt)}) Tj ET`);y-=size+gap};
  const lines=md.split(/\r?\n/).map(clean);
  if(title)for(const l of wrap(clean(title),18,true,PW-2*M))put(l,18,true,M,4);
  y-=8;
  for(const raw of lines){const l=raw.trimEnd();
    if(!l.trim()){y-=6;continue}
    let m;
    if((m=l.match(/^#{1}\s+(.*)/))){y-=4;for(const x of wrap(m[1],15,true,PW-2*M))put(x,15,true,M,4)}
    else if((m=l.match(/^#{2,}\s+(.*)/))){y-=4;for(const x of wrap(m[1],12.5,true,PW-2*M))put(x,12.5,true,M,3)}
    else if((m=l.match(/^(\s*)[-*]\s+(.*)/))){const ind=M+14+Math.min(m[1].length,6)*4;
      wrap(m[2],11,false,PW-M-ind-4).forEach((x,i)=>{if(!i)put("-",11,false,ind-12,0),y+=0;put(x,11,false,ind,3)});}
    else for(const x of wrap(l,11,false,PW-2*M))put(x,11,false,M,3);
  }
  const objs=[];const add=s=>objs.push(s)-1+1;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  const n=pages.length,kids=pages.map((_,i)=>`${5+i*2} 0 R`).join(" ");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((p,i)=>{const stream=p.join("\n");
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`);
    objs.push(`<< /Length ${Buffer.byteLength(stream,"latin1")} >>\nstream\n${stream}\nendstream`)});
  let out="%PDF-1.4\n";const off=[];
  objs.forEach((o,i)=>{off.push(Buffer.byteLength(out,"latin1"));out+=`${i+1} 0 obj\n${o}\nendobj\n`});
  const xr=Buffer.byteLength(out,"latin1");
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+off.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
  return Buffer.from(out,"latin1");
}
module.exports={makePdf};
