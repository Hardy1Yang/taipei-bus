'use strict';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const labels = {equal_stop:'共同站點：每站等權',network_stop:'共同站點：轉運連結加權',equal_district:'服務行政區：每區等權',day_district:'服務行政區：白天活動人口加權',job_district:'服務行政區：工作地從業人數加權',job_equal_district:'工作地比較基準：每區等權'};
const descriptions = {
 equal_stop:'每個站群各算一份。相似度等於共同站群數除以兩路線合計服務的不重複站群數；同一路線重複停靠只算一次。站群沿用來源的同站分組。',
 network_stop:'停靠母路線越多的站群，權重越高：權重為 log(1＋停靠母路線數)，log 是自然對數，用來降低大型節點過度主導的程度。此值衡量網路連結，不是乘客人數。與「每站等權」比較，才能看出大站對分數的影響。',
 equal_district:'有實際停靠站點才算服務該行政區。每區各算一份；共同服務行政區數除以兩路線合計服務的不重複行政區數。相同區域內的不同街道與站位在此不作區分。',
 day_district:'以 2023 年 11 月各區平日白天活動人口作權重。共同服務區域的權重總和，除以兩路線合計服務區域的權重總和。活動人口是區域活動規模，不能解讀為公車客流。',
 job_district:'以 2021 年底各區工商及服務業工作地從業人數作權重。共同服務工作集中的區域，會增加相似度；但一個區的從業人數不會分配給其中的每座站牌。請與「工作地比較基準」在相同路線範圍內比較。',
 job_equal_district:'保留與工作地加權完全相同的合格路線，每個行政區各算一份。這項對照排除資料缺漏導致路線範圍改變的影響。'
};
const reasons={unknown_district:'部分站點無法歸入雙北行政區，這條路線不納入行政區尺度比較。',missing_weight:'部分服務行政區缺少本項權重，因此不計算相似度。',empty_membership:'沒有可用的比較地點。',zero_union_weight:'合計權重為零，無法定義相似度。'};
const roles={none:'未匹配到入口清冊內的捷運站',single:'鄰近一座捷運站',multiple:'鄰近兩座以上捷運站'};
const fmt = (v,d=0) => v==null?'資料未知':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:d,minimumFractionDigits:d});
const pct = v => v==null?'資料未知':`${fmt(v*100,1)}%`;
function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!=null)n.textContent=text;for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
function mapLink(r){return 'index.html?route='+encodeURIComponent(r.pattern_id)+'#explorer';}
async function loadJson(url,failure){
 const response=await fetch(url);if(!response.ok)throw new Error(failure);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes[0]===0x1f&&bytes[1]===0x8b){
  if(typeof DecompressionStream!=='function')throw new Error('此瀏覽器無法解壓縮結果檔');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 return JSON.parse(new TextDecoder().decode(bytes));
}
let data, selected, mode, index, rail=null, renderVersion=0;
const detailsCache=new Map();
function routeOptions(query=''){
 const candidates=data.routes.filter(r=>(r.name+' '+r.parent_id).toLowerCase().includes(query.toLowerCase()));
 $('route').replaceChildren(...candidates.map(r=>el('option',`${r.name} · ${r.city==='Taipei'?'臺北':'新北'}`,{value:r.parent_id})));
 if(candidates.some(r=>r.parent_id===selected))$('route').value=selected;
 else if(candidates.length){selected=candidates[0].parent_id;render();}
 if(!candidates.length){$('status').textContent='沒有符合的路線；請換一個名稱。';}
}
function detail(r){
 const box=$('route-detail');box.replaceChildren(el('h2',r.name),el('a','在地理地圖查看這條路線 ↗',{href:mapLink(r),class:'map-link'}));
 const dl=el('dl');
 for(const [term,value]of [['起站所在行政區',r.start_district_name||'區域未知'],['末站所在行政區',r.end_district_name||'區域未知'],['本次比較的代表行駛紀錄',`${r.stop_group_count??r.stop_count} 個不重複站群`]])dl.append(el('dt',term),el('dd',value));
 box.append(dl,el('h3','與捷運的空間關係'));
 const p=r.metro_proximity?.['500'];
 box.append(el('p',roles[r.metro_role]||'資料未知'));
 box.append(el('p',(r.metro_nodes||[]).map(n=>n.name).join('、')||'入口清冊內沒有匹配站點。'));
 box.append(el('p',`距離任一已知捷運入口超過 500 公尺的實體站牌占 ${pct(p?.outside_stop_fraction)}。`,{class:'caption'}));
 box.append(el('p','以公車實際站點到捷運入口的平面距離判定。同站多個出入口合併；此距離尚未考慮過街與步行道路。鄰近捷運不等於旅客實際轉乘。',{class:'caption'}));
 const table=el('table');const body=el('tbody');
 for(const t of ['300','500','800']){const tr=el('tr');tr.append(el('th',t+' 公尺'),el('td',`${r.metro_proximity?.[t]?.metro_nodes?.length??'未知'} 座站`));body.append(tr);}table.append(body);box.append(table);
}
function showContributions(r,n){
 const other=index.get(n.parent_id), box=$('contributions');box.replaceChildren(el('h3',`${r.name} 與 ${n.name}：共同地點的貢獻`));
 const district=mode.includes('district');
 box.append(el('p',`相似度 ${fmt(n.similarity,3)} ＝共同${district?'行政區':'站群'}的權重總和 ÷ 合計服務地點的權重總和（${fmt(n.union_weight,2)}）。各項貢獻相加就是相似度。`));
 box.append(el('p',`起站所在行政區：${r.start_district_name||'未知'}／${other?.start_district_name||'未知'}；末站所在行政區：${r.end_district_name||'未知'}／${other?.end_district_name||'未知'}。不同起訖地可能服務不同旅客。`));
 const items=n.shared_nodes||[],list=el('ol');
 for(const node of items.slice(0,8))list.append(el('li',`${node.name}：權重 ${fmt(node.weight,2)}，對相似度貢獻 ${fmt(node.contribution,4)}。`));
 box.append(list);
 if(items.length>8){const remaining=items.slice(8).reduce((s,n)=>s+n.contribution,0);const details=el('details');details.append(el('summary',`其餘 ${items.length-8} 個地點，貢獻合計 ${fmt(remaining,4)}（展開全部）`));const rest=el('ol');for(const node of items.slice(8))rest.append(el('li',`${node.name}：權重 ${fmt(node.weight,2)}，貢獻 ${fmt(node.contribution,4)}。`));details.append(rest);box.append(details);}
 box.append(el('p',district?'行政區尺度相同，不能判定兩條路線在區內停靠相同站點。':'共同停靠站點是協調轉乘與班表的線索；是否可互相替代仍須核對旅客起訖地、服務時間及轉乘成本。'));
 if(other)box.append(el('a',`在地圖查看 ${other.name} ↗`,{href:mapLink(other)}));
}
function draw(r,neighbors,m){
 const svg=$('scatter');svg.replaceChildren();$('tooltip').hidden=true;
 const points=data.routes.filter(q=>q.embeddings?.[mode]);
 if(!points.length)return;
 const xs=points.map(q=>q.embeddings[mode][0]),ys=points.map(q=>q.embeddings[mode][1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),span=Math.max(maxX-minX,maxY-minY,1e-9);
 const xx=v=>390+(v-(minX+maxX)/2)*430/span, yy=v=>250-(v-(minY+maxY)/2)*430/span;
 function shape(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;}
 shape('line',{x1:72,x2:730,y1:485,y2:485,stroke:'#a8b6ac'});shape('line',{x1:72,x2:72,y1:24,y2:485,stroke:'#a8b6ac'});
 shape('text',{x:390,y:518,'text-anchor':'middle',fill:'#536860','font-size':15},'MDS 第 1 座標（無單位）');shape('text',{x:18,y:250,transform:'rotate(-90 18 250)','text-anchor':'middle',fill:'#536860','font-size':15},'MDS 第 2 座標（無單位）');
 const near=new Set(neighbors.map(n=>n.parent_id));
 const rank=q=>q.parent_id===selected?2:near.has(q.parent_id)?1:0;
 points.sort((a,b)=>rank(a)-rank(b));
 for(const q of points){const level=rank(q);const n=shape('circle',{cx:xx(q.embeddings[mode][0]),cy:yy(q.embeddings[mode][1]),r:level===2?8:level===1?5:2.4,fill:level===2?'#bf4922':level===1?'#176b96':'#a0aaa1',opacity:level?1:.62,stroke:level?'#fffefa':'none','stroke-width':2,'data-parent':q.parent_id});const title=document.createElementNS(NS,'title');title.textContent=`${q.name} · ${labels[mode]}`;n.append(title);const show=()=>{$('tooltip').textContent=`${q.name}｜座標 ${fmt(q.embeddings[mode][0],3)}, ${fmt(q.embeddings[mode][1],3)}｜點擊選取`;$('tooltip').hidden=false;};n.addEventListener('mouseenter',show);n.addEventListener('mouseleave',()=>{$('tooltip').hidden=true;});n.addEventListener('click',()=>{selected=q.parent_id;$('route-search').value='';routeOptions();render();});}
 const d=m.diagnostics||{};
 $('diagnostics').textContent=`二維距離重建誤差 ${fmt(d.normalized_reconstruction_error,3)}（0 表示距離完全保留，越大代表壓縮差異越多）；有效維度 ${d.dimensions??'未知'}。`;
}
async function render(){
 const version=++renderVersion;
 const r=index.get(selected),m=data.modes.find(m=>m.id===mode);if(!r||!m)return;
 $('contributions').replaceChildren();$('neighbors').replaceChildren();$('ties').textContent='';
 $('status').textContent='正在載入 '+r.name+' 的比較結果……';
 if(!detailsCache.has(r.parent_id))detailsCache.set(r.parent_id,loadJson(r.detail_url,'路線結果無法載入'));
 let detailData;
 try{detailData=await detailsCache.get(r.parent_id);}catch(error){detailsCache.delete(r.parent_id);if(version===renderVersion)$('status').textContent=error.message+'。請重新選取路線再試一次。';return;}
 if(version!==renderVersion)return;
 const ns=detailData.neighbors?.[mode]||[];
 $('mode-description').textContent=descriptions[mode];$('coverage').textContent=`合格母路線 ${fmt(m.eligible_count)} 條／全體 ${fmt(data.summary.route_count)} 條；本模式排除 ${fmt(m.excluded_count)} 條。`;
 $('status').textContent=r.mode_reasons?.[mode]?(reasons[r.mode_reasons[mode]]||'這條路線缺少此模式所需資料。'):`目前選取 ${r.name}，列出 ${ns.length} 條相似路線。`;
 detail(r);draw(r,ns,m);
 if(rail)rail.selectRoute(r.parent_id);
 for(const n of ns){const tr=el('tr'),td=el('td');td.append(el('a',n.name,{href:mapLink(n)}));tr.append(td,el('td',fmt(n.similarity,3)),el('td',String(n.shared_count)));const action=el('td'),button=el('button','檢視共同地點',{type:'button'});button.addEventListener('click',()=>showContributions(r,n));action.append(button);tr.append(action);$('neighbors').append(tr);}
 if(!ns.length){const tr=el('tr');tr.append(el('td','本模式沒有可列出的相似路線。',{colspan:4}));$('neighbors').append(tr);}
 const tie=detailData.boundary_ties?.[mode];$('ties').textContent=tie?.omitted_at_boundary?`第十名的相似度為 ${fmt(tie.similarity,3)}；有 ${tie.total_at_boundary} 條並列此分數，其中 ${tie.omitted_at_boundary} 條未列入。並列按固定路線識別碼排列，名次不代表優劣。`:'清單按原始相似度排序；同分時按固定路線識別碼排列。';
 const url=new URL(location.href);url.searchParams.set('route',selected);url.searchParams.set('mode',mode);history.replaceState(null,'',url);
}
async function start(){
 data=await loadJson('data/destination-analysis.json.gz','結果資料載入失敗');index=new Map(data.routes.map(r=>[r.parent_id,r]));
 const params=new URLSearchParams(location.search);mode=data.modes.some(m=>m.id===params.get('mode'))?params.get('mode'):'network_stop';if(!data.modes.some(m=>m.id===mode))mode=data.modes[0].id;
 selected=index.has(params.get('route'))?params.get('route'):(data.summary.featured_pair?.left_parent_id||data.routes.find(r=>r.name==='307')?.parent_id||data.routes[0].parent_id);
 $('mode').replaceChildren(...data.modes.map(m=>el('option',labels[m.id]||m.label,{value:m.id})));$('mode').value=mode;
 $('mode').addEventListener('change',()=>{mode=$('mode').value;render();});$('route').addEventListener('change',()=>{selected=$('route').value;render();});$('route-search').addEventListener('input',()=>routeOptions($('route-search').value));
 for(const d of [...data.districts].sort((a,b)=>(b.employees||0)-(a.employees||0))){const tr=el('tr');tr.append(el('td',`${d.city==='Taipei'?'臺北市':d.city==='NewTaipei'?'新北市':d.city||''} ${d.district_name}`),el('td',fmt(d.employees)),el('td',fmt(d.day)));$('district-rows').append(tr);}
 $('sources').append(el('h3','資料來源與統計範圍'));
 for(const s of data.sources||[]){const p=el('p');p.append(el('a',`${s.title||s.name||s.source_id}（${s.period||''}）`,{href:s.url||s.source_url||'#'}));if(s.limitations)p.append(document.createTextNode(' — '+(Array.isArray(s.limitations)?s.limitations.join('；'):s.limitations)));$('sources').append(p);}
 if(typeof window.initDestinationRail==='function')rail=window.initDestinationRail({routes:data.routes,summary:data.summary},id=>{selected=id;$('route-search').value='';routeOptions();render();});
 $('version').textContent='分析版本 '+data.run_id+'。以既有母路線代表與官方區級資料比較，跨年資料不表示同日城市活動。';
 routeOptions();render();
}
start().catch(error=>{$('status').textContent=`無法載入分析結果：${error.message}。請從網站網址開啟此頁，並重新整理。`;});
