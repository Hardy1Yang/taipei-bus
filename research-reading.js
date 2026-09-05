const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=value=>value===null||value===undefined?'未知':typeof value==='boolean'?(value?'是':'否'):typeof value==='number'?new Intl.NumberFormat('zh-TW',{maximumFractionDigits:Math.abs(value)>0&&Math.abs(value)<.01?6:3}).format(value):Array.isArray(value)?value.join('；'):String(value);
const displayCell=(value,key)=>typeof value==='number'&&['longitude','latitude','lon','lat'].includes(key)?value.toFixed(6):display(value);
const translations={Taipei:'臺北市',NewTaipei:'新北市',Both:'雙北',geometry:'幾何距離',topology:'共站距離',metro_entries:'旅次起站端',metro_exits:'旅次訖站端',weekday:'週一至五',weekend:'週末',residential_support:'住宅面積分配',uniform_proxy:'面積均分代理',known_zero:'已知零人口',unknown:'未知',all:'全部',different_city:'跨城市',within_Taipei:'臺北市內',within_NewTaipei:'新北市內',same_hundred:'同百位',cross_hundred:'跨百位',representative_minus_mean:'原代表點 − 住宅平均',representative_minus_p90:'原代表點 − 住宅 p90',p90_minus_mean:'住宅 p90 − 平均',network_minus_straight_mean:'路網平均 − 直線平均',network_minus_straight_p90:'路網 p90 − 直線 p90',residential_locations:'住宅位置域',all_known_allocated_locations:'全部已知配置位置域',barrier_detour_candidate:'道路繞行候選',residential_coverage_candidate:'住宅到站較遠候選',within_walk_threshold:'門檻內',unresolved_walk_evidence:'步行未知'};
const label=value=>typeof value==='string'?(translations[value]||value):display(value);
const priorityColumns=[
 ['cell_id','網格 ID','','250 公尺網格的穩定識別碼。'],['city','城市','','來源城市。'],['district','行政區','','網格所屬行政區。'],['representative_villages','代表點所在里','','僅描述代表點位置，不表示整里都有缺口；空白表示未匹配。'],['intersecting_villages','網格相交里','','與網格有正面積交集的里，不含單純接邊。'],['longitude','經度','度 E','WGS84；與地圖連結相同的代表點。'],['latitude','緯度','度 N','WGS84；與地圖連結相同的代表點。'],['straight_p90_m','直線 p90','m','同格取樣位置至站點的直線距離加權第 90 百分位。'],['network_p90_m','路網 p90','m','同格位置到站路網距離加權第 90 百分位；權重為住宅面積或回退代理。'],['difference_m','路網 − 直線','m','同格兩種 p90 的差，不是改善前後成效。'],['population_estimate','配置人口估計','人','2024-12 人口按空間配置至網格，不是官方里人口。'],['population_method','人口配置方法','','住宅面積分配或面積均分代理，後者尚未核對住宅位置。']
].map(([key,label,unit,description])=>({key,label,unit,description}));
async function fetchJson(path){const response=await fetch(path);if(!response.ok)throw Error(`資料暫時無法讀取（${response.status}）`);const data=await response.json();return data}
function tableUI(host,tables,period){
 let selected=0,page=0,query='',district='',method='';const size=25;let shown=[];
 host.innerHTML=`<div class="table-controls">${tables.length>1?`<label>結果表<select data-table aria-label="結果表">${tables.map((t,i)=>`<option value="${i}">${esc(t.title)}（${t.total_rows.toLocaleString('zh-TW')} 列）</option>`).join('')}</select></label>`:''}<label>搜尋結果<input type="search" data-search placeholder="輸入區里、路線、站名或網格 ID"></label>${host.id==='priority-table'?'<label>行政區<select data-district aria-label="行政區"><option value="">全部行政區</option></select></label><label>人口配置方法<select data-method aria-label="人口配置方法"><option value="">全部配置方法</option><option value="residential_support">住宅面積分配</option><option value="uniform_proxy">面積均分代理</option></select></label>':''}<a data-csv download>下載本表完整 CSV</a></div><p class="table-context"></p><div class="value-detail" role="status" aria-live="polite">將滑鼠移到數字上，或用 Tab 鍵聚焦數值，即可查看其單位、分母與定義。</div><div class="table-scroll" tabindex="0" aria-label="結果表，可左右捲動"><table><thead></thead><tbody></tbody></table></div><div class="pagination"><p data-count role="status"></p><div class="actions"><button type="button" data-prev>上一頁</button><button type="button" data-next>下一頁</button></div></div><p class="method-note">表內只顯示每頁 25 列；下載檔包含本表全部列與完整來源欄位。搜尋不改變研究的原始分母。</p>`;
 const detail=host.querySelector('.value-detail');
 if(host.id==='priority-table'){
  host.querySelector('[data-district]').insertAdjacentHTML('beforeend',[...new Set(tables[0].rows.map(r=>`${r.city} ${r.district}`))].sort().map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join(''));
  host.querySelector('[data-district]').onchange=e=>{district=e.target.value;page=0;render()};
  host.querySelector('[data-method]').onchange=e=>{method=e.target.value;page=0;render()};
 }
 function render(){
  const table=tables[selected];const filtered=table.rows.filter(r=>(!query||Object.entries(r).filter(([key])=>!key.startsWith('_')).some(([,v])=>`${label(v)} ${display(v)}`.toLocaleLowerCase().includes(query)))&&(!district||`${r.city} ${r.district}`===district)&&(!method||r.population_method_code===method));
  const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages-1);shown=filtered.slice(page*size,(page+1)*size);
  host.querySelector('[data-csv]').href=table.csv;host.querySelector('.table-context').textContent=`${table.title}。${period}。分母：${table.denominator}`;
  host.querySelector('thead').innerHTML='<tr>'+table.columns.map(c=>`<th scope="col">${esc(c.label)}${c.unit?`<small>${esc(c.unit)}</small>`:''}</th>`).join('')+'<th scope="col">地理位置</th></tr>';
  host.querySelector('tbody').innerHTML=shown.length?shown.map((row,i)=>`<tr data-row-id="${esc(row._id||row.cell_id)}">${table.columns.map((column,j)=>{const value=row[column.key];return `<td>${typeof value==='number'?`<button type="button" class="value-button" data-value="${i}:${j}" aria-label="${esc(column.label)} ${esc(displayCell(value,column.key))} ${esc(column.unit)}">${esc(displayCell(value,column.key))}</button>`:esc(label(value)||'未匹配')}</td>`}).join('')}<td>${(row._links||[]).map(link=>`<a href="${esc(link.url)}" data-entity="${esc(link.entity_id)}">${esc(link.name)} ↗</a>`).join('<br>')||'不對應單一地點'}</td></tr>`).join(''):`<tr><td colspan="${table.columns.length+1}" class="empty">沒有符合目前搜尋與篩選的結果；原始表格仍有 ${table.total_rows.toLocaleString('zh-TW')} 列。</td></tr>`;
  host.querySelector('[data-count]').textContent=`符合 ${filtered.length.toLocaleString('zh-TW')}／${table.total_rows.toLocaleString('zh-TW')} 列 · 第 ${page+1}／${pages} 頁${filtered.length?` · 顯示 ${page*size+1}–${Math.min((page+1)*size,filtered.length)}`:''}`;
  host.querySelector('[data-prev]').disabled=page===0;host.querySelector('[data-next]').disabled=page+1>=pages;
  detail.innerHTML='將滑鼠移到數字上，或用 Tab 鍵聚焦數值，即可查看其單位、分母與定義。';
 }
 function explain(event){
  const button=event.target.closest('[data-value]');if(!button||!host.contains(button))return;
  const [i,j]=button.dataset.value.split(':').map(Number),table=tables[selected],row=shown[i],column=table.columns[j];
  const name=[row.name,row.station_name,row.origin_name&&`${row.origin_name} → ${row.destination_name}`,row.city&&label(row.city),row.district,row.cell_id,row.scenario_id,row.comparison&&label(row.comparison)].filter(Boolean).join(' · ')||table.title;
  detail.innerHTML=`<strong>${esc(name)}｜${esc(column.label)} ${esc(displayCell(row[column.key],column.key))} ${esc(column.unit)}</strong><br>${esc(column.description)}<small>分母：${esc(table.denominator)}　期間：${esc(period)}</small>`;
 }
 host.addEventListener('mouseover',explain);host.addEventListener('focusin',explain);
 host.querySelector('[data-search]').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase();page=0;render()};
 if(tables.length>1)host.querySelector('[data-table]').onchange=e=>{selected=Number(e.target.value);page=0;render()};
 host.querySelector('[data-prev]').onclick=()=>{page--;render()};host.querySelector('[data-next]').onclick=()=>{page++;render()};render();
}
async function loadPriority(){
 const host=document.querySelector('#priority-table');try{
  const data=await fetchJson('research-data/access-priority.json');if(!Array.isArray(data.rows)||data.rows.length!==509||data.denominator!==6047)throw Error('清冊資料與封存分母不一致');
  const rows=data.rows.map(row=>({...row,_links:[{entity_id:row.entity_id,name:'在地圖查看此格',url:row.map_url}]}));
  tableUI(host,[{title:'完整住宅繞行候選清冊',columns:priorityColumns,rows,total_rows:data.rows.length,denominator:'6,047 格合資格同格配對；本清冊列出其中 509 格。',csv:'research-data/access-priority.csv'}],data.period);
 }catch(error){host.innerHTML=`<p class="error" role="alert">${esc(error.message)}。上方仍可下載完整 CSV。</p><button class="retry">重試讀取清冊</button>`;host.querySelector('button').onclick=loadPriority}
}
for(const details of document.querySelectorAll('[data-figure]')){
 let loaded=false,loading=false;
 async function load(){if(loaded||loading||!details.open)return;loading=true;const host=details.querySelector('.table-host');host.innerHTML='<p role="status">正在讀取此圖的結果表…</p>';try{const data=await fetchJson(`research-data/${details.dataset.figure}.json`);if(!Array.isArray(data.tables)||!data.tables.length)throw Error('結果表結構不完整');tableUI(host,data.tables,data.period_label);loaded=true}catch(error){host.innerHTML=`<p class="error" role="alert">${esc(error.message)}；可先使用下方 CSV 下載。</p><button class="retry">重新載入結果表</button>`;host.querySelector('button').onclick=load}finally{loading=false}}
 details.addEventListener('toggle',load);
}
void loadPriority();
