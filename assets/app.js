/*
 * Page logic for the MQM explorer: D3 tree, tooltip, selection panel and the
 * export menu. Expects `DATA` (the injected node list) plus the functions from
 * export-formats.js and docx.js in scope — build inlines all three files into
 * the template in that order.
 */

const LEVEL_COLORS = {0:"#ff6b6b",1:"#ffa94d",2:"#ffd43b",3:"#69db7c"};
const LEVEL_NAMES = {0:"Dimension (L0)",1:"Level 1",2:"Level 2",3:"Level 3"};

const isCore = d => isCoreData(d.data);
const hasHidden = d => !!(d._children && !d.children);
const colorData = n => LEVEL_COLORS[n.level] ?? "#868e96";
const color = d => colorData(d.data);

// ---- master lookup + selection state ----
const mById = new Map(DATA.map(d=>[d.id,d]));
function rootOf(id){ let n=mById.get(id); while(n && n.parent && mById.get(n.parent)) n=mById.get(n.parent); return n; }
const LSKEY="mqm_selected_v1";
let selected=new Set();
try{ selected=new Set(JSON.parse(localStorage.getItem(LSKEY)||"[]")); }catch(e){}
function save(){ try{ localStorage.setItem(LSKEY, JSON.stringify([...selected])); }catch(e){} }

// ---- legend ----
const legend=d3.select("#legend");
Object.keys(LEVEL_COLORS).forEach(k=>{
  const s=legend.append("span").attr("class","sw");
  s.append("span").attr("class","dot").style("background",LEVEL_COLORS[k]);
  s.append("span").text(LEVEL_NAMES[k]);
});
legend.append("span").attr("class","sep");
const cs=legend.append("span").attr("class","sw");
cs.append("span").attr("class","dot").style("background","#9aa3b2");
cs.append("span").text("Core (filled)");
const es=legend.append("span").attr("class","sw");
es.append("span").attr("class","dot hollow");
es.append("span").text("Extension (outline)");

// ---- build (filterable) hierarchy ----
const margin={top:24,right:300,bottom:24,left:170};
const svg=d3.select("#wrap").append("svg");
const g=svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);
const gLink=g.append("g"), gNode=g.append("g");
const tip=d3.select("#tip");
const dx=22, dy=215;
const tree=d3.tree().nodeSize([dx,dy]);
const diagonal=d3.linkHorizontal().x(d=>d.y).y(d=>d.x);

let filterMode="all";
let root;

function buildMaster(){
  const byId=new Map(DATA.map(d=>[d.id,{...d,children:[]}]));
  const roots=[];
  byId.forEach(n=>{ if(n.parent && byId.has(n.parent)) byId.get(n.parent).children.push(n); else roots.push(n); });
  return {id:"__root__",name:"MQM-Core",level:-1,desc:"Top-level quality dimensions",children:roots};
}
const MASTER=buildMaster();

function keep(n){
  if(filterMode==="core") return isCoreData(n);
  if(filterMode==="selected") return selected.has(n.id);
  return true;
}
function prune(n){
  const kids=(n.children||[]).map(prune).filter(Boolean);
  if(n.id==="__root__") return {...n,children:kids};
  if(keep(n) || kids.length) return {...n,children:kids};
  return null;
}

function rebuild(){
  const data=prune(MASTER);
  root=d3.hierarchy(data);
  root.x0=0; root.y0=0;
  root.descendants().forEach((d,i)=>{
    d._id=i; d._children=d.children;
    if(filterMode!=="selected" && d.depth>=1) d.children=null; // collapse to dimensions
  });
  svg.call(zoomCenter);
  update(root);
}

function zoomCenter(){ /* placeholder kept for parity */ }

function update(source){
  const nodes=root.descendants().reverse();
  const links=root.links();
  tree(root);
  let lo=Infinity,hi=-Infinity;
  root.each(d=>{ if(d.x<lo)lo=d.x; if(d.x>hi)hi=d.x; });
  const width=Math.max(...nodes.map(d=>d.y))+margin.left+margin.right;
  const contentH=hi-lo+margin.top+margin.bottom;
  const vh=Math.max(svg.node().parentNode.clientHeight, window.innerHeight-60);
  const H=Math.max(contentH, vh);
  const yOff=lo-margin.top-Math.max(0,(H-contentH)/2);
  svg.attr("viewBox",[0,yOff,width,H]).attr("height",H).attr("preserveAspectRatio","xMinYMid meet");

  const node=gNode.selectAll("g.node").data(nodes,d=>d._id);
  const nodeEnter=node.enter().append("g").attr("class","node")
    .attr("transform",`translate(${source.y0},${source.x0})`)
    .on("click",(e,d)=>{ if(d.depth===0) return; d.children=d.children?null:d._children; update(d); })
    .on("mousemove",(e,d)=>showTip(e,d))
    .on("mouseleave",()=>tip.style("opacity",0));
  nodeEnter.append("circle").attr("class","halo");
  nodeEnter.append("circle").attr("class","main");
  // checkbox
  const cb=nodeEnter.append("g").attr("class","cb").attr("transform","translate(-14,0)")
    .on("click",(e,d)=>{ e.stopPropagation(); toggleSel(d); });
  cb.append("rect").attr("x",-5.5).attr("y",-5.5).attr("width",11).attr("height",11).attr("rx",2.5);
  cb.append("path").attr("class","tick").attr("d","M-3,0 L-1,2.6 L3.6,-3");
  nodeEnter.append("text").attr("dy","0.31em")
    .attr("x",d=>d._children?-26:11)
    .attr("text-anchor",d=>d._children?"end":"start")
    .text(d=>d.data.name).style("display",d=>d.depth===0?"none":null);

  const nodeAll=node.merge(nodeEnter);
  nodeAll.attr("transform",d=>`translate(${d.y},${d.x})`);
  nodeAll.attr("class",d=>"node"+(hasHidden(d)?" collapsed":""));
  nodeAll.select("circle.halo").attr("r",d=>hasHidden(d)?10:0);
  nodeAll.select("circle.main")
    .attr("r",5.5)
    .attr("fill",d=>isCore(d)?color(d):"#0f1117")
    .attr("stroke",d=>color(d))
    .attr("stroke-width",d=>isCore(d)?1.4:2.1);
  nodeAll.select("g.cb")
    .style("display",d=>d.depth===0?"none":null)
    .attr("class",d=>"cb"+(selected.has(d.data.id)?" on":""));
  nodeAll.select("text")
    .attr("x",d=>d._children?-26:11)
    .attr("text-anchor",d=>d._children?"end":"start");

  node.exit().remove();

  const link=gLink.selectAll("path").data(links,d=>d.target._id);
  const linkEnter=link.enter().append("path").attr("class","link");
  link.merge(linkEnter).attr("d",diagonal);
  link.exit().remove();

  root.eachBefore(d=>{d.x0=d.x;d.y0=d.y;});
}

function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function showTip(e,d){
  if(d.depth===0){tip.style("opacity",0);return;}
  const c=color(d), lv=d.data.level, pid=d.data.pid||"", core=isCore(d);
  let html=`<div class="meta"><span class="lvl" style="background:${c}">${LEVEL_NAMES[lv]||"Level "+lv}</span>`;
  if(pid) html+=`<span class="pid">${esc(pid)}</span>`;
  html+=`<span class="tag ${core?"core":"ext"}">${core?"Core":"Extension"}</span></div>`;
  html+=`<h3>${esc(d.data.name)}</h3>`;
  if(d.data.desc) html+=`<p>${esc(d.data.desc)}</p>`;
  if(d.data.ex){html+=`<div class="lab">Examples</div><div class="ex">${esc(d.data.ex)}</div>`;}
  tip.html(html).style("opacity",1);
  const pad=16, tw=tip.node().offsetWidth, th=tip.node().offsetHeight;
  let x=e.clientX+pad, y=e.clientY+pad;
  if(x+tw>window.innerWidth) x=e.clientX-tw-pad;
  if(y+th>window.innerHeight) y=e.clientY-th-pad;
  tip.style("left",Math.max(8,x)+"px").style("top",Math.max(8,y)+"px");
}

// ---- selection ----
function toggleSel(d){
  const id=d.data.id;
  if(selected.has(id)) selected.delete(id); else selected.add(id);
  save(); renderPanel();
  if(filterMode==="selected") rebuild(); else update(root);
}
function removeSel(id){
  selected.delete(id); save(); renderPanel();
  if(filterMode==="selected") rebuild(); else update(root);
}
function renderPanel(){
  d3.select("#count").html(`<b>${selected.size}</b> selected`);
  const plist=d3.select("#plist"); plist.html("");
  const ids=[...selected].filter(id=>mById.has(id));
  if(!ids.length){ plist.append("div").attr("class","empty").text("No types selected yet. Tick the box next to a node to add it."); return; }
  const groups=new Map();
  ids.forEach(id=>{ const r=rootOf(id)||{name:"(other)"}; if(!groups.has(r.name)) groups.set(r.name,[]); groups.get(r.name).push(mById.get(id)); });
  // order groups by dimension order in DATA
  const dimOrder=DATA.filter(d=>!d.parent).map(d=>d.name);
  const ordered=[...groups.keys()].sort((a,b)=>dimOrder.indexOf(a)-dimOrder.indexOf(b));
  ordered.forEach(gn=>{
    const items=groups.get(gn).sort((a,b)=>(a.pid||"").localeCompare(b.pid||""));
    const grp=plist.append("div").attr("class","grp");
    grp.append("div").attr("class","gh").html(`<span>${esc(gn)}</span><span>${items.length}</span>`);
    items.forEach(n=>{
      const it=grp.append("div").attr("class","item");
      it.append("span").attr("class","dotmini").style("background",isCoreData(n)?colorData(n):"transparent")
        .style("box-shadow",isCoreData(n)?"none":`inset 0 0 0 2px ${colorData(n)}`);
      it.append("span").attr("class","nm").text(n.name);
      it.append("span").attr("class","pid").text(n.pid||"");
      it.append("span").attr("class","x").text("×").on("click",()=>removeSel(n.id));
    });
  });
}

// ---- export UI ----
function toast(msg){ const t=d3.select("#toast"); t.text(msg).classed("show",true); setTimeout(()=>t.classed("show",false),1400); }
function copyText(txt,label){ navigator.clipboard.writeText(txt).then(()=>toast(label+" copied")).catch(()=>toast("Copy failed")); }
function download(txt,fname,mime){ const b=new Blob([txt],{type:mime}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=fname; a.click(); URL.revokeObjectURL(u); }
function downloadBytes(bytes,fname,mime){ const b=new Blob([bytes],{type:mime}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=fname; a.click(); URL.revokeObjectURL(u); }

const exportBtn=document.getElementById("exportBtn");
const exportMenu=document.getElementById("exportMenu");
function closeExport(){ exportMenu.hidden=true; exportBtn.classList.remove("open"); exportBtn.setAttribute("aria-expanded","false"); }
function toggleExport(){ if(exportMenu.hidden){ exportMenu.hidden=false; exportBtn.classList.add("open"); exportBtn.setAttribute("aria-expanded","true"); } else closeExport(); }
exportBtn.onclick=e=>{ e.stopPropagation(); toggleExport(); };
document.addEventListener("click",e=>{ if(!exportMenu.hidden && !exportMenu.contains(e.target) && e.target!==exportBtn) closeExport(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !exportMenu.hidden) closeExport(); });
function doExport(fmt,act){
  if(!selected.size){ toast("Nothing selected"); closeExport(); return; }
  if(fmt==="json"){ const t=toJSON(DATA,selected); act==="copy"?copyText(t,"JSON"):download(t,"mqm_selection.json","application/json"); }
  else if(fmt==="csv"){ const t=toCSV(DATA,selected); act==="copy"?copyText(t,"CSV"):download(t,"mqm_selection.csv","text/csv"); }
  else if(fmt==="tex"){ const t=toLaTeX(DATA,selected); act==="copy"?copyText(t,"LaTeX"):download(t,"mqm_guideline.tex","application/x-tex"); }
  else if(fmt==="docx"){ downloadBytes(toDocx(guidelineSections(DATA,selected)),"mqm_guideline.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"); toast("Word downloaded"); }
  closeExport();
}
exportMenu.querySelectorAll("button").forEach(b=>{ b.onclick=()=>doExport(b.dataset.fmt,b.dataset.act); });
document.getElementById("clearSel").onclick=()=>{ if(!selected.size)return; if(!confirm("Clear all "+selected.size+" selected types?"))return; selected.clear(); save(); renderPanel(); if(filterMode==="selected") rebuild(); else update(root); };

// ---- controls ----
document.querySelectorAll("#filter button").forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll("#filter button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); filterMode=b.dataset.m; rebuild(); };
});
document.getElementById("expand").onclick=()=>{ root.each(d=>{ if(d._children) d.children=d._children; }); update(root); };
document.getElementById("collapse").onclick=()=>{ root.each(d=>{ if(d.depth>=1 && d._children) d.children=null; }); update(root); };
document.getElementById("togglePanel").onclick=()=>{ const p=document.getElementById("panel"); const hid=p.classList.toggle("hidden"); document.getElementById("togglePanel").textContent=hid?"Show panel":"Hide panel"; setTimeout(()=>update(root),0); };

renderPanel();
rebuild();
