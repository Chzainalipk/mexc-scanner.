/* MEXC Futures Scanner PWA prototype.
   Public market-data only. No authentication or order execution. */
const API="https://contract.mexc.com/api/v1/contract";
const $=id=>document.getElementById(id);
let stopRequested=false, lastResults=[], scanned=0;
const fmt=(n)=>Number.isFinite(Number(n))?Number(n).toLocaleString("en-US",{maximumFractionDigits:8}):"—";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function setStatus(s,ok=false){$("marketStatus").textContent=s;$("statusDot").style.background=ok?"var(--green)":"var(--muted)"}
async function getJSON(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const j=await r.json();
  if(j.success===false)throw new Error(j.code||"MEXC API returned failure");
  return j.data;
}
async function getTicker(){
  const data=await getJSON(`${API}/ticker`);
  if(!Array.isArray(data))throw new Error("Unexpected ticker response");
  return data;
}
function turnover(t){
  const candidates=[t.amount24,t.turnover24,t.volume24,t.vol24,t.amount,t.volume];
  for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0)return n}
  return 0;
}
async function getCandles(symbol,interval,limit=240){
  const end=Math.floor(Date.now()/1000), start=end-limit*({Min5:300,Min15:900,Min60:3600}[interval]);
  const data=await getJSON(`${API}/kline/${encodeURIComponent(symbol)}?interval=${interval}&start=${start}&end=${end}`);
  if(!data)throw new Error("No candles");
  let rows=[];
  if(Array.isArray(data) && data.length && Array.isArray(data[0])){
    rows=data.map(a=>({time:+a[0],open:+a[1],high:+a[2],low:+a[3],close:+a[4],vol:+a[5],amount:+a[6]}));
  }else if(Array.isArray(data.time)){
    rows=data.time.map((t,i)=>({time:+t,open:+data.open?.[i],high:+data.high?.[i],low:+data.low?.[i],close:+data.close?.[i],vol:+data.vol?.[i],amount:+data.amount?.[i]}));
  }else if(Array.isArray(data.data?.time)){
    const d=data.data;rows=d.time.map((t,i)=>({time:+t,open:+d.open?.[i],high:+d.high?.[i],low:+d.low?.[i],close:+d.close?.[i],vol:+d.vol?.[i],amount:+d.amount?.[i]}));
  }
  rows=rows.filter(x=>[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
  // Exclude the currently forming candle when timestamps suggest it is incomplete.
  const secs={Min5:300,Min15:900,Min60:3600}[interval];
  const now=Math.floor(Date.now()/1000);
  if(rows.length && rows[rows.length-1].time+secs>now)rows.pop();
  return rows;
}
function ema(values,period){
  if(values.length<period)return [];
  const k=2/(period+1);let e=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  const out=Array(period-1).fill(null);out.push(e);
  for(let i=period;i<values.length;i++){e=values[i]*k+e*(1-k);out.push(e)}
  return out;
}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function rsi(closes,period=14){
  if(closes.length<=period)return NaN;let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];if(d>0)gains+=d;else losses-=d}
  let ag=gains/period,al=losses/period;
  for(let i=period+1;i<closes.length;i++){const d=closes[i]-closes[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period}
  if(al===0)return 100;return 100-100/(1+ag/al);
}
function atr(candles,period=14){
  if(candles.length<period+1)return NaN;const tr=[];
  for(let i=1;i<candles.length;i++){const c=candles[i],p=candles[i-1];tr.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)))}
  return mean(tr.slice(-period));
}
function analyse(symbol,c5,c15,c60,ticker){
  if(c5.length<60||c15.length<60||c60.length<210)throw new Error("Insufficient candle history");
  const close5=c5.map(c=>c.close),close15=c15.map(c=>c.close),close60=c60.map(c=>c.close);
  const e20_5=ema(close5,20),e50_5=ema(close5,50),e20_15=ema(close15,20),e50_15=ema(close15,50),e200_60=ema(close60,200);
  const last5=c5.at(-1),prev5=c5.at(-2),last15=c15.at(-1),last60=c60.at(-1);
  const px=last5.close, trendLong=last60.close>e200_60.at(-1),trendShort=last60.close<e200_60.at(-1);
  const structLong=last15.close>e20_15.at(-1)&&e20_15.at(-1)>e50_15.at(-1);
  const structShort=last15.close<e20_15.at(-1)&&e20_15.at(-1)<e50_15.at(-1);
  const avgVol=mean(c5.slice(-21,-1).map(c=>c.vol)), volOk=Number.isFinite(avgVol)&&last5.vol>avgVol*1.15;
  const r=rsi(close5), a=atr(c5);
  const bullConfirm=last5.close>last5.open&&last5.close>e20_5.at(-1)&&prev5.close<=e20_5.at(-2);
  const bearConfirm=last5.close<last5.open&&last5.close<e20_5.at(-1)&&prev5.close>=e20_5.at(-2);
  let longScore=0,shortScore=0,lr=[],sr=[];
  if(trendLong){longScore+=25;lr.push("1H close above EMA 200")}if(trendShort){shortScore+=25;sr.push("1H close below EMA 200")}
  if(structLong){longScore+=20;lr.push("15m EMA 20 above EMA 50; price above EMA 20")}if(structShort){shortScore+=20;sr.push("15m EMA 20 below EMA 50; price below EMA 20")}
  if(bullConfirm){longScore+=20;lr.push("5m bullish reclaim of EMA 20")}if(bearConfirm){shortScore+=20;sr.push("5m bearish loss of EMA 20")}
  if(volOk){if(last5.close>last5.open){longScore+=15;lr.push("5m volume > 1.15× recent average")}else if(last5.close<last5.open){shortScore+=15;sr.push("5m volume > 1.15× recent average")}}
  if(r>=50&&r<=68){longScore+=10;lr.push(`RSI ${r.toFixed(1)} supports momentum without extreme extension`)}
  if(r<=50&&r>=32){shortScore+=10;sr.push(`RSI ${r.toFixed(1)} supports downside momentum without extreme extension`)}
  const tickPrice=Number(ticker?.lastPrice),spread=Number(ticker?.riseFallRate);
  const score=Math.max(longScore,shortScore), direction=longScore>=shortScore?"LONG":"SHORT";
  const reasons=direction==="LONG"?lr:sr;
  const riskDistance=Math.max(a*1.2,px*0.002);
  let entry=px,sl=direction==="LONG"?px-riskDistance:px+riskDistance;
  let tp1=direction==="LONG"?px+2*riskDistance:px-2*riskDistance;
  let tp2=direction==="LONG"?px+3*riskDistance:px-3*riskDistance;
  const opposing=direction==="LONG"?!(trendLong&&structLong&&bullConfirm):!(trendShort&&structShort&&bearConfirm);
  let verdict=(score>=Number($("minScore").value)&&!opposing&&Number.isFinite(a)&&a>0) ? direction:"NO TRADE";
  if(!volOk)reasons.push("Volume confirmation absent: strict filter");
  if(!Number.isFinite(r))reasons.push("RSI unavailable");
  if(opposing)reasons.push("One or more required trend/structure/entry conditions not aligned");
  if(score<Number($("minScore").value))reasons.push(`Score ${score}/100 below selected threshold`);
  const rr=2;
  return {symbol,verdict,direction,score,entry,sl,tp1,tp2,rr,price:tickPrice||px,closeTime:last5.time,reasons,metrics:{rsi:r,atr:a,volumeRatio:avgVol>0?last5.vol/avgVol:NaN,trendLong,trendShort,structLong,structShort,bullConfirm,bearConfirm,volOk},funding:ticker?.fundingRate,turnover:turnover(ticker)};
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function cardHTML(s){
  const cls=s.verdict==="LONG"?"long":s.verdict==="SHORT"?"short":"neutral";
  const reasons=(s.reasons||[]).slice(0,5).map(x=>`<li>${esc(x)}</li>`).join("");
  return `<article class="signal-card"><div class="signal-top"><div><div class="symbol">${esc(s.symbol)}</div><div class="score">Score ${s.score}/100 · RSI ${Number.isFinite(s.metrics?.rsi)?s.metrics.rsi.toFixed(1):"—"} · Vol ${Number.isFinite(s.metrics?.volumeRatio)?s.metrics.volumeRatio.toFixed(2)+"×":"—"}</div></div><span class="direction ${cls}">${s.verdict}</span></div><div class="price-grid"><div class="price-cell"><span>Entry</span><b>${fmt(s.entry)}</b></div><div class="price-cell"><span>Stop-loss</span><b>${fmt(s.sl)}</b></div><div class="price-cell"><span>TP1 · 2R</span><b>${fmt(s.tp1)}</b></div><div class="price-cell"><span>TP2 · 3R</span><b>${fmt(s.tp2)}</b></div></div><ul class="reasons">${reasons||"<li>No confirmed setup</li>"}</ul><div class="score">Last closed 5m candle: ${s.closeTime?new Date(s.closeTime*1000).toLocaleString():"—"} · Indicative levels, not execution prices</div><button class="small-button log-btn" data-symbol="${esc(s.symbol)}">Log signal</button></article>`;
}
function renderResults(results){
  const filtered=results.filter(x=>x.verdict!=="NO TRADE").sort((a,b)=>b.score-a.score);
  const rejected=results.filter(x=>x.verdict==="NO TRADE");
  lastResults=results;
  $("scannedCount").textContent=results.length;$("longCount").textContent=results.filter(x=>x.verdict==="LONG").length;
  $("shortCount").textContent=results.filter(x=>x.verdict==="SHORT").length;$("rejectCount").textContent=rejected.length;
  const ordered=[...filtered,...rejected.slice(0,10)];
  $("results").innerHTML=ordered.length?ordered.map(cardHTML).join(""):`<div class="empty-state">No candidates found.</div>`;
  $("exportBtn").disabled=!results.length;
  document.querySelectorAll(".log-btn").forEach(b=>b.addEventListener("click",()=>logSignal(results.find(x=>x.symbol===b.dataset.symbol))));
}
async function analyseSymbol(symbol,ticker){
  const [c5,c15,c60]=await Promise.all([getCandles(symbol,"Min5",240),getCandles(symbol,"Min15",240),getCandles(symbol,"Min60",240)]);
  return analyse(symbol,c5,c15,c60,ticker);
}
async function scan(){
  stopRequested=false;scanned=0;lastResults=[];$("scanBtn").disabled=true;$("stopBtn").disabled=false;$("progressBar").style.width="0%";setStatus("Loading tickers");
  try{
    const tickers=await getTicker();
    const contracts=tickers.filter(t=>String(t.symbol||"").endsWith("_USDT")&&turnover(t)>0).sort((a,b)=>turnover(b)-turnover(a)).slice(0,Number($("universe").value));
    if(!contracts.length)throw new Error("No eligible USDT contracts returned by the public API.");
    const results=[];let errors=0;
    for(let i=0;i<contracts.length;i++){
      if(stopRequested)break;
      const t=contracts[i];
      $("progressText").textContent=`Analyzing ${i+1}/${contracts.length}: ${t.symbol}`;
      try{results.push(await analyseSymbol(t.symbol,t));}catch(e){errors++}
      scanned=i+1;$("progressBar").style.width=`${Math.round(scanned/contracts.length*100)}%`;
      if(i%5===4){renderResults(results);await sleep(180)}
      else await sleep(80);
    }
    renderResults(results);setStatus(stopRequested?"Scan stopped":"Scan complete",true);
    $("progressText").textContent=`Finished ${scanned}/${contracts.length}. ${errors} contracts skipped due to missing/failed data. Review signals before use.`;
  }catch(e){setStatus("API error");$("progressText").textContent=`Could not scan: ${e.message}. The public API may be blocked by browser CORS/network restrictions.`}
  finally{$("scanBtn").disabled=false;$("stopBtn").disabled=true}
}
function stopScan(){stopRequested=true;$("progressText").textContent="Stopping after current contract…"}
async function manualAnalyze(){
  const symbol=$("symbolInput").value.trim().toUpperCase().replace(/\s/g,"");
  if(!/^[A-Z0-9]+_USDT$/.test(symbol)){$("manualResult").innerHTML='<p class="hint">Use a symbol like BTC_USDT.</p>';return}
  $("analyzeBtn").disabled=true;$("manualResult").innerHTML='<p class="hint">Fetching 5m, 15m and 1h candles…</p>';
  try{
    const tickers=await getTicker(),ticker=tickers.find(t=>t.symbol===symbol);
    const result=await analyseSymbol(symbol,ticker);
    $("manualResult").innerHTML=`<div class="manual-card">${cardHTML(result)}</div>`;
    $("manualResult").querySelector(".log-btn")?.addEventListener("click",()=>logSignal(result));
  }catch(e){$("manualResult").innerHTML=`<p class="hint">Analysis failed: ${esc(e.message)}. Check symbol, connectivity and API access.</p>`}
  finally{$("analyzeBtn").disabled=false}
}
function getLog(){try{return JSON.parse(localStorage.getItem("mexcSignalLog")||"[]")}catch{return []}}
function logSignal(s){if(!s)return;const log=getLog();log.unshift({...s,loggedAt:new Date().toISOString()});localStorage.setItem("mexcSignalLog",JSON.stringify(log.slice(0,1000)));updateLogCount()}
function updateLogCount(){$("logCount").textContent=`${getLog().length} logged signals (stored on this device)`}
function download(name,content,type="text/csv"){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
function csv(rows){
  const cols=["symbol","verdict","score","entry","sl","tp1","tp2","closeTime","loggedAt"];
  return [cols.join(","),...rows.map(r=>cols.map(k=>JSON.stringify(r[k]??"")).join(","))].join("\n");
}
$("scanBtn").addEventListener("click",scan);$("stopBtn").addEventListener("click",stopScan);$("analyzeBtn").addEventListener("click",manualAnalyze);
$("exportBtn").addEventListener("click",()=>download("mexc-scan-results.csv",csv(lastResults)));
$("clearLogBtn").addEventListener("click",()=>{if(confirm("Clear locally stored signal log?")){localStorage.removeItem("mexcSignalLog");updateLogCount()}});
$("exportLogBtn").addEventListener("click",()=>download("mexc-paper-signal-log.csv",csv(getLog())));
updateLogCount();
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
